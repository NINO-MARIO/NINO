/* มิ้ม | 47-compose
 * ผู้เรียบเรียง: สร้างประโยคใหม่สั้นๆ จากคำตอบที่เคยสอนไว้ ที่เกี่ยวกับหัวเรื่องเดียวกัน
 * ใช้เฉพาะเมื่อผู้คิดหาคำตอบเดิมไม่เจอ และทุกคำในคำถามเป็นคำที่รู้จักแล้ว (ผู้คิดเป็นผู้ตัดสิน)
 *
 * วิธี:
 *   1. เลือกหัวเรื่อง = คำเนื้อหาที่ปรากฏในคำตอบหลายรายการ แต่ไม่ใช่คำที่พบทั่วไป (คำเชื่อม คำลงท้าย)
 *   2. เก็บเฉพาะคำตอบที่มีหัวเรื่องนั้น แล้วนับว่าแต่ละคำมักตามด้วยคำใด (สถิติคู่คำ) ไม่ข้ามเรื่อง
 *   3. เดินจากหัวเรื่องแบบสุ่มถ่วงน้ำหนัก โดยเมล็ดสุ่มมาจากคำถาม คำถามเดิมจึงได้ผลเดิมเสมอ
 * กฎความปลอดภัย (ไม่ผ่านข้อใดข้อหนึ่ง = ไม่ตอบ):
 *   - ต้องจบด้วยคำลงท้ายประโยคภาษาไทย ยาวพอ ไม่ซ้ำคำตอบเดิมทั้งข้อความ และเป็นภาษาไทยเกินร้อยละ 90
 *   - ทุกข้อความที่สร้างจะถูกติดป้าย "ทดลอง ยังไม่ยืนยัน" ที่ฝั่งผู้เรียก
 * ผลลัพธ์เป็นการจัดลำดับคำที่เคยเห็นเท่านั้น จึงอาจไม่เป็นความจริง และจะไม่ถูกจำเข้าคลังเอง
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;
  const Text = NINO.Text;

  const FINAL = /(?:ค่ะ|คะ|ครับ|นะคะ|นะ|จ้ะ|จ้า|น้า)$/;
  const THAI = /[ก-๛]/;
  const MAX_TOKENS = 16;
  const MIN_TOKENS = 4;
  const MIN_CHARS = 8;
  const MAX_CHARS = 160;
  const MIN_TOPIC_DOCS = 2;     // หัวเรื่องต้องปรากฏในคำตอบอย่างน้อยกี่รายการ
  const MAX_TOPIC_SHARE = 0.25; // ถ้าปรากฏในคำตอบเกินสัดส่วนนี้ ถือเป็นคำทั่วไป ไม่ใช่หัวเรื่อง
  const TRIES = 8;              // จำนวนเมล็ดสุ่มต่อหัวเรื่อง
  const SCOPE_CACHE = 32;       // จำนวนหัวเรื่องที่เก็บสถิติไว้ในหน่วยความจำ
  // คำที่ไม่นับเป็นหัวเรื่องแม้จะพบบ่อย (คำเชื่อม คำช่วย คำลงท้าย คำถาม)
  const TOPIC_STOP = new Set([
    'มี', 'ให้', 'ช่วย', 'ไหม', 'อะไร', 'บ้าง', 'เป็น', 'ได้', 'คือ', 'ของ', 'กับ', 'และ',
    'ค่ะ', 'คะ', 'ครับ', 'นะ', 'ฉัน', 'คุณ', 'ชื่อ', 'อยู่', 'ทำ', 'ไป', 'มา', 'ที่', 'ใน', 'จะ', 'ก็',
    'ว่า', 'ไม่', 'ยัง', 'แล้ว', 'เพราะ', 'เมื่อ', 'ถ้า', 'หรือ', 'ซึ่ง', 'นี้', 'นั้น', 'กับ'
  ]);

  // เมล็ดสุ่มที่ทำซ้ำได้ (mulberry32) เพื่อให้คำถามเดิมได้ผลเดิม
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(s) {
    let h = 2166136261;
    for (const ch of String(s)) {
      h ^= ch.codePointAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  class Composer {
    // seg(text) คืนรายการ { w } จากเครื่องแยกคำของผู้คิด
    constructor(store, seg) {
      this.store = store;
      this.seg = seg;
      this._v = -1;
      this._rows = [];           // [{ n, seq }] ทุกคำตอบที่แยกคำแล้ว (สร้างใหม่เมื่อความรู้เปลี่ยน)
      this._answers = new Set();  // ข้อความคำตอบที่ทำให้เป็นมาตรฐานแล้ว ใช้กันการคัดลอกคำตอบเดิม
      this._scopes = new Map();   // หัวเรื่อง -> สถิติคู่คำเฉพาะเรื่องนั้น
    }

    _sync() {
      const s = this.store;
      if (this._v === s.version) return;
      this._answers = new Set();
      this._rows = [];
      // เรียนจากคำตอบที่ไม่ซ้ำกันเท่านั้น รูปคำถามที่ขยายจากการสอนครั้งเดียวใช้คำตอบเดียวกัน จึงไม่ควรนับซ้ำ
      const seen = new Set();
      for (const e of s.entries) {
        const text = String(e.a || '');
        const key = Text.normalize(text);
        this._answers.add(key);
        if (seen.has(key)) continue;
        seen.add(key);
        const seq = this.seg(text).map(t => t.w).filter(w => w && THAI.test(w));
        this._rows.push({ seq });
      }
      // จำนวนคำตอบที่มีแต่ละคำ (นับครั้งเดียวต่อรายการ) ใช้คัดคำทั่วไปออกจากหัวเรื่อง
      this._df = new Map();
      for (const r of this._rows) {
        for (const w of new Set(r.seq)) this._df.set(w, (this._df.get(w) || 0) + 1);
      }
      this._scopes = new Map();
      this._v = s.version;
    }

    // หัวเรื่องที่เป็นไปได้: คำเนื้อหาที่ปรากฏในคำตอบหลายรายการ แต่ไม่ใช่คำทั่วไป
    _isTopic(w, docs, total) {
      if (!w || w.length < 2 || TOPIC_STOP.has(w) || FINAL.test(w)) return false;
      if (docs < MIN_TOPIC_DOCS) return false;
      return docs / Math.max(1, total) <= MAX_TOPIC_SHARE;
    }

    _docCount(w) {
      return this._df.get(w) || 0;
    }

    // สถิติคู่คำของเฉพาะคำตอบที่มีหัวเรื่องนั้น
    _scope(topic) {
      if (this._scopes.has(topic)) return this._scopes.get(topic);
      const next = new Map();
      const count = new Map();
      for (const r of this._rows) {
        const seq = r.seq;
        if (!seq.includes(topic)) continue;
        for (let i = 0; i < seq.length; i++) {
          const w = seq[i];
          count.set(w, (count.get(w) || 0) + 1);
          if (i + 1 >= seq.length) continue;
          const nx = seq[i + 1];
          let m = next.get(w);
          if (!m) next.set(w, (m = new Map()));
          m.set(nx, (m.get(nx) || 0) + 1);
        }
      }
      const scope = { next, count };
      if (this._scopes.size >= SCOPE_CACHE) this._scopes.delete(this._scopes.keys().next().value);
      this._scopes.set(topic, scope);
      return scope;
    }

    // known: คำในคำถามที่อยู่ในกราฟแล้ว input: คำถามเดิม (ใช้เป็นเมล็ดสุ่ม) คืน { text, topic } หรือ null
    say(known, input) {
      if (!known || !known.length) return null;
      this._sync();
      if (!this._rows.length) return null;
      const total = this._rows.length;
      const topics = known
        .map(w => ({ w, docs: this._docCount(w) }))
        .filter(x => this._isTopic(x.w, x.docs, total))
        .sort((a, b) => (b.docs - a.docs) || (a.w < b.w ? -1 : a.w > b.w ? 1 : 0));
      const salt = hash(String(input || ''));
      for (const { w: t } of topics.slice(0, 3)) {
        const scope = this._scope(t);
        for (let k = 0; k < TRIES; k++) {
          const text = this._walk(scope, t, (salt + k * 7919) >>> 0);
          if (text) return { text, topic: t };
        }
      }
      return null;
    }

    // เดินจากหัวเรื่องภายในเรื่องเดียวกัน เลือกคำถัดไปตามน้ำหนักการพบร่วม และไม่ใช้คำเดิมซ้ำ
    _walk(scope, start, seed) {
      const rnd = rng(seed);
      const out = [start];
      const used = new Set([start]);
      let cur = start;
      while (out.length < MAX_TOKENS) {
        const cands = scope.next.get(cur);
        if (!cands) break;
        const options = [];
        let total = 0;
        for (const [w, c] of cands) {
          if (used.has(w)) continue;
          options.push([w, c]);
          total += c;
        }
        if (!options.length) break;
        // เรียงตามอักษรก่อนเลือก เพื่อให้ผลขึ้นกับเมล็ดสุ่มเท่านั้น ไม่ขึ้นกับลำดับที่เรียนมา
        options.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        let r = rnd() * total;
        let pick = options[options.length - 1][0];
        for (const [w, c] of options) {
          r -= c;
          if (r < 0) {
            pick = w;
            break;
          }
        }
        out.push(pick);
        used.add(pick);
        cur = pick;
        if (FINAL.test(pick) && out.length >= MIN_TOKENS) break;
      }
      const text = out.join('');
      return this._passes(text, out) ? text : null;
    }

    _passes(text, toks) {
      if (toks.length < MIN_TOKENS) return false;
      if (!FINAL.test(text)) return false;
      if (text.length < MIN_CHARS || text.length > MAX_CHARS) return false;
      if (this._answers.has(Text.normalize(text))) return false;
      const compact = text.replace(/\s/g, '');
      const thai = (compact.match(/[ก-๛]/g) || []).length;
      return thai / compact.length >= 0.9;
    }
  }

  NINO.Composer = Composer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
