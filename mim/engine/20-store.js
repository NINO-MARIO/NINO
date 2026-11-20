/* มิ้ม | 20-store
 * คลังความรู้, การตั้งค่า, และ "ความคิด" (ข้อสังเกตที่คิดได้เอง และช่องว่างความรู้)
 * - ใช้คีย์ localStorage เดิม เพื่อให้ข้อมูลของผู้ใช้เดิมยังอยู่ครบ
 * - ดัชนีค้นหาสร้างแบบขี้เกียจ (lazy) เมื่อถูกเรียกใช้ และสร้างใหม่เฉพาะตอนความรู้เปลี่ยน
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;
  const Text = NINO.Text;

  const KB_KEY = 'nino_local_ai_kb_v1';     // คีย์เดิม ห้ามเปลี่ยน
  const SET_KEY = 'nino_local_ai_set_v1';   // คีย์เดิม ห้ามเปลี่ยน
  const MIND_KEY = 'nino_local_ai_mind_v1';
  const EXPORT_FORMAT = 'nino-knowledge';
  const EXPORT_VERSION = 2;

  const LIMITS = { question: 300, answer: 4000, persona: 20000, entries: 20000, insights: 500, gaps: 200, qgaps: 30, candidates: 20, notes: 50, noteChars: 6000 };

  function memoryStorage() {
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: k => { m.delete(k); }
    };
  }

  function pickStorage() {
    try {
      if (typeof localStorage !== 'undefined') {
        const probe = '__nino_probe__';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        return localStorage;
      }
    } catch (e) { /* ไม่มีสิทธิ์ใช้งาน storage ใช้หน่วยความจำแทน */ }
    return memoryStorage();
  }

  function clampNum(v, lo, hi, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  }

  function isEntry(e) {
    return Boolean(e && typeof e.q === 'string' && typeof e.a === 'string' && e.q.trim() && e.a.trim());
  }

  function normEntry(e) {
    const out = {
      q: e.q.trim(),
      a: e.a.trim(),
      hits: Number(e.hits) || 0,
      created: Number(e.created) || Date.now(),
      updated: e.updated
    };
    // ที่มาของความรู้ (แหล่งข้อมูลที่ติดตั้งไว้) ถ้ามี
    if (typeof e.src === 'string' && e.src) out.src = e.src.slice(0, 80);
    if (typeof e.trust === 'string' && e.trust) out.trust = e.trust.slice(0, 20);
    return out;
  }

  class KnowledgeStore {
    constructor(storage) {
      this.storage = storage || pickStorage();
      this.entries = [];
      this.insights = [];
      this.gaps = [];
      this.qgaps = [];          // คำถามทั้งข้อที่มิ้มตอบไม่ได้ (ล่าสุดท้าย) ให้ผู้ใช้สอนต่อได้
      this.notes = [];          // ข้อความที่มิ้มเคยอ่าน ใช้ค้นหานิยามเองเมื่อเจอคำที่ไม่รู้จัก (48-selfstudy)
      this.sources = {};        // สถานะแหล่งข้อมูลที่ติดตั้งแล้ว: id -> { loaded, learned, skipped } (49-sources)
      this.candidates = [];     // ผู้สมัครจากการค้นเว็บ รอให้ผู้ใช้ยืนยัน ยังไม่ใช่ความรู้จนกว่าจะยืนยัน (54-webcand)
      this.settings = { enabled: false, threshold: 0.34, persona: '', generator: false, seeded: false };
      this.totalHits = 0;
      this.version = 0;
      this._idx = null;
      this._idxVersion = -1;
      this.revision = 0;        // นับการแก้ไขรายการเดิม (ไม่นับการเพิ่มต่อท้าย) ใช้บอกกราฟว่าต้องสร้างใหม่หรือไม่
      this._ex = null;          // ตารางชื่อที่ทำให้เป็นรูปมาตรฐาน (เบา ใช้ตอนสอน)
      this._exVersion = -1;
      this._prepCache = new WeakMap(); // ค่าต่อรายการที่คำนวณครั้งเดียว (ไม่คำนวณซ้ำทุกครั้งที่คลังเปลี่ยน)
    }

    load() {
      try {
        const raw = this.storage.getItem(KB_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        this.entries = Array.isArray(arr) ? arr.filter(isEntry).map(normEntry) : [];
      } catch (e) {
        this.entries = [];
      }
      try {
        const raw = this.storage.getItem(SET_KEY);
        if (raw) Object.assign(this.settings, JSON.parse(raw) || {});
      } catch (e) { /* ใช้ค่าเริ่มต้น */ }
      try {
        const raw = this.storage.getItem(MIND_KEY);
        const mind = raw ? JSON.parse(raw) : {};
        this.insights = Array.isArray(mind.insights) ? mind.insights.filter(x => x && x.text).slice(-LIMITS.insights) : [];
        this.gaps = Array.isArray(mind.gaps) ? mind.gaps.filter(x => typeof x === 'string').slice(-LIMITS.gaps) : [];
        this.qgaps = Array.isArray(mind.qgaps) ? mind.qgaps.filter(x => typeof x === 'string' && x).slice(-LIMITS.qgaps) : [];
        this.notes = Array.isArray(mind.notes) ? mind.notes.filter(x => typeof x === 'string' && x).slice(-LIMITS.notes) : [];
        this.sources = mind.sources && typeof mind.sources === 'object' && !Array.isArray(mind.sources) ? mind.sources : {};
        this.candidates = Array.isArray(mind.candidates) ? mind.candidates.filter(x => x && typeof x.q === 'string' && typeof x.a === 'string' && x.q && x.a).slice(-LIMITS.candidates) : [];
      } catch (e) {
        this.insights = [];
        this.gaps = [];
        this.qgaps = [];
        this.notes = [];
        this.sources = {};
        this.candidates = [];
      }
      this.settings.threshold = clampNum(this.settings.threshold, 0.1, 0.9, 0.34);
      this.settings.persona = String(this.settings.persona || '').slice(0, LIMITS.persona);
      this.totalHits = this.entries.reduce((s, e) => s + (e.hits || 0), 0);
      this._touch();
      return this;
    }

    save() {
      try {
        this.storage.setItem(KB_KEY, JSON.stringify(this.entries));
        this.storage.setItem(SET_KEY, JSON.stringify(this.settings));
        this.storage.setItem(MIND_KEY, JSON.stringify({ insights: this.insights, gaps: this.gaps, qgaps: this.qgaps, notes: this.notes, sources: this.sources, candidates: this.candidates }));
        return true;
      } catch (e) {
        return false;
      }
    }

    _touch() {
      this.version++;
    }

    // ค่าเตรียมของรายการหนึ่ง: ชื่อที่ทำให้เป็นรูปมาตรฐาน และโปรไฟล์ คำนวณครั้งเดียวต่อวัตถุรายการ
    _prep(entry) {
      let c = this._prepCache.get(entry);
      if (!c || c.q !== entry.q) {
        const n = Text.normalize(entry.q);
        c = { q: entry.q, n, p: n ? Text.profile(n) : null };
        this._prepCache.set(entry, c);
      }
      return c;
    }

    // ตารางชื่อ -> รายการ สร้างใหม่เมื่อคลังเปลี่ยน (ราคาถูก ไม่มี bigram)
    _exactMap() {
      if (this._ex && this._exVersion === this.version) return this._ex;
      const exact = new Map();
      for (const entry of this.entries) {
        const c = this._prep(entry);
        if (c.n && !exact.has(c.n)) exact.set(c.n, entry);
      }
      this._ex = exact;
      this._exVersion = this.version;
      return exact;
    }

    // ดัชนีค้นหาสำหรับการจับคู่แบบคล้าย: โปรไฟล์ทุกรายการ และดัชนีกลับ (bigram/คำ -> ตำแหน่งรายการ)
    // ใช้คัดเฉพาะรายการที่มีโอกาสได้คะแนนมากกว่าศูนย์ ผลลัพธ์จึงเหมือนการไล่ทุกรายการ
    index() {
      if (this._idx && this._idxVersion === this.version) return this._idx;
      const exact = this._exactMap();
      const profiles = [];
      const post = new Map();
      const add = (key, i) => {
        const list = post.get(key);
        if (!list) post.set(key, [i]);
        else if (list[list.length - 1] !== i) list.push(i);
      };
      for (const entry of this.entries) {
        const c = this._prep(entry);
        if (!c.n) continue;
        const i = profiles.length;
        profiles.push({ entry, p: c.p });
        for (const key of c.p.b) add(key, i);
        for (const key of c.p.t) add(key, i);
      }
      this._idx = { exact, profiles, post };
      this._idxVersion = this.version;
      return this._idx;
    }

    find(q) {
      const nq = Text.normalize(q);
      if (!nq) return null;
      return this._exactMap().get(nq) || null;
    }

    // คืนค่า: 'new' | 'updated' | 'invalid' | 'too_long' | 'full'
    // meta (ไม่บังคับ): { src, trust } บอกที่มาของความรู้ใหม่ ไม่เขียนทับรายการเดิม
    teach(q, a, meta) {
      const r = this._upsert(q, a, null, meta);
      // คำถามที่เคยตอบไม่ได้ เมื่อสอนแล้วจะออกจากรายการ
      if (r === 'new' || r === 'updated') this.resolveQuestionGap(q);
      return r;
    }

    // จดคำถามทั้งข้อที่มิ้มตอบไม่ได้ (ไม่ซ้ำ ล่าสุดอยู่ท้าย จำกัดจำนวน)
    noteQuestionGap(q) {
      const t = String(q ?? '').trim().slice(0, LIMITS.question);
      if (!t) return;
      const nt = Text.normalize(t);
      this.qgaps = this.qgaps.filter(x => Text.normalize(x) !== nt);
      this.qgaps.push(t);
      if (this.qgaps.length > LIMITS.qgaps) this.qgaps.splice(0, this.qgaps.length - LIMITS.qgaps);
    }

    resolveQuestionGap(q) {
      const nq = Text.normalize(String(q ?? ''));
      this.qgaps = this.qgaps.filter(x => Text.normalize(x) !== nq);
    }

    _upsert(q, a, map, meta) {
      q = String(q ?? '').trim();
      a = String(a ?? '').trim();
      if (!q || !a) return 'invalid';
      if (q.length > LIMITS.question || a.length > LIMITS.answer) return 'too_long';
      const nq = Text.normalize(q);
      if (!nq) return 'invalid';

      const existing = map ? map.get(nq) : this.find(q);
      if (existing) {
        existing.a = a;
        existing.updated = Date.now();
        this.revision++;
        this._touch();
        return 'updated';
      }
      if (this.entries.length >= LIMITS.entries) return 'full';

      const entry = { q, a, hits: 0, created: Date.now() };
      if (meta && typeof meta.src === 'string' && meta.src) {
        entry.src = meta.src.slice(0, 80);
        if (typeof meta.trust === 'string' && meta.trust) entry.trust = meta.trust.slice(0, 20);
      }
      this.entries.push(entry);
      if (map) map.set(nq, entry);
      this._touch();
      return 'new';
    }

    forget(q) {
      const nq = Text.normalize(q);
      const i = this.entries.findIndex(e => this._prep(e).n === nq);
      if (i < 0) return false;
      this.entries.splice(i, 1);
      this._touch();
      return true;
    }

    // ลบความรู้ทั้งหมดที่มาจากแหล่งนี้ และลบสถานะการติดตั้ง คืนจำนวนรายการที่ลบ
    forgetSource(id) {
      const before = this.entries.length;
      this.entries = this.entries.filter(e => e.src !== id);
      const removed = before - this.entries.length;
      delete this.sources[id];
      this.revision++;
      this._touch();
      return removed;
    }

    hit(entry) {
      entry.hits = (entry.hits || 0) + 1;
      this.totalHits++;
    }

    // ข้อสังเกตหนึ่งคู่คำนับเป็นรายการเดียว (กันซ้ำ) คืน true ถ้าเพิ่มใหม่
    addInsight(rec) {
      const key = [rec.a, rec.b].sort().join('|');
      if (this.insights.some(x => x.key === key)) return false;
      this.insights.push(Object.assign({ key, created: Date.now() }, rec));
      if (this.insights.length > LIMITS.insights) this.insights.splice(0, this.insights.length - LIMITS.insights);
      return true;
    }

    noteGap(w) {
      if (this.gaps.includes(w)) return;
      this.gaps.push(w);
      if (this.gaps.length > LIMITS.gaps) this.gaps.splice(0, this.gaps.length - LIMITS.gaps);
    }

    // เก็บข้อความที่อ่านไว้ (ไม่ซ้ำ จำกัดความยาวและจำนวน) คืน true ถ้าเพิ่มใหม่
    addNote(text) {
      const t = String(text ?? '').trim().slice(0, LIMITS.noteChars);
      const key = Text.normalize(t);
      if (!key) return false;
      if (this.notes.some(n => Text.normalize(n) === key)) return false;
      this.notes.push(t);
      if (this.notes.length > LIMITS.notes) this.notes.splice(0, this.notes.length - LIMITS.notes);
      return true;
    }

    resolveGap(w) {
      const i = this.gaps.indexOf(w);
      if (i >= 0) this.gaps.splice(i, 1);
    }

    // เติมความรู้ตั้งต้นเพียงครั้งเดียวตอนเปิดระบบครั้งแรก (ไม่มีปุ่ม) คืน true ถ้าเติมในครั้งนี้
    ensureSeed(seed) {
      if (this.settings.seeded) return false;
      if (!this.entries.length) this.importData({ knowledge: seed });
      this.settings.seeded = true;
      this.save();
      return true;
    }

    clear() {
      this.entries = [];
      this.insights = [];
      this.gaps = [];
      this.qgaps = [];
      this.notes = [];
      this.sources = {};
      this.candidates = [];
      this.totalHits = 0;
      this._touch();
    }

    setPersona(text) {
      this.settings.persona = String(text ?? '').trim().slice(0, LIMITS.persona);
      return this.settings.persona.length;
    }

    exportData() {
      return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        count: this.entries.length,
        knowledge: this.entries.map(e => ({ q: e.q, a: e.a, hits: e.hits, created: e.created, updated: e.updated })),
        insights: this.insights.map(x => ({ text: x.text, conf: x.conf, a: x.a, b: x.b, via: x.via }))
      };
    }

    // รองรับทั้งรูปแบบเวอร์ชัน 1 (array หรือ {knowledge}) และ 2 โดยใช้ชื่อฟิลด์ q/a, question/answer, key/value
    importData(data) {
      const arr = Array.isArray(data) ? data : (data && Array.isArray(data.knowledge) ? data.knowledge : null);
      if (!arr) return { error: 'ไม่พบรายการความรู้ในไฟล์' };

      const map = new Map();
      for (const e of this.entries) {
        const n = Text.normalize(e.q);
        if (n && !map.has(n)) map.set(n, e);
      }

      let added = 0, updated = 0, skipped = 0;
      for (const item of arr) {
        if (!item || typeof item !== 'object') { skipped++; continue; }
        const q = item.q ?? item.question ?? item.key;
        const a = item.a ?? item.answer ?? item.value;
        const r = this._upsert(q, a, map);
        if (r === 'new') added++;
        else if (r === 'updated') updated++;
        else skipped++;
      }
      this.save();
      return { added, updated, skipped, total: this.entries.length };
    }
  }

  KnowledgeStore.LIMITS = LIMITS;
  NINO.KnowledgeStore = KnowledgeStore;
  NINO.LIMITS = LIMITS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
