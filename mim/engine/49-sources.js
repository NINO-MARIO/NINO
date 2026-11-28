/* มิ้ม | 49-sources
 * แหล่งข้อมูลที่ผู้ใช้ติดตั้งเอง และการใช้งานสองแบบ:
 *
 *   ก. เรียนนิยามจากแหล่ง: ประโยค "X คือ/เป็น/ใช้ ..." ในแหล่งที่ติดตั้ง ถูกเรียนเป็นความรู้ (มีที่มาติดไว้)
 *      ก่อนเก็บต้องตรวจกลับด้วยคำถามรูปอื่น ไม่เขียนทับความรู้เดิม และไม่เก็บซ้ำจากแหล่งอื่น
 *   ข. อ่านจากแหล่ง: ถ้าคำถามไม่มีคำตอบในความรู้ มิ้มค้นประโยคในแหล่งที่ติดตั้งที่ตรงกับคำถาม
 *      ตอบด้วยประโยคนั้นพร้อมชื่อแหล่ง ไม่เรียนจากประโยคนี้ (เป็นการอ้างอิง ไม่ใช่ความรู้ที่มิ้มยืนยันเอง)
 *
 * ไม่มีแหล่งใดถูกติดตั้งเริ่มต้น ผู้ใช้เป็นคนสั่ง "โหลดแหล่ง" ทุกครั้ง
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;
  const Text = NINO.Text;

  const MAX_SOURCES = 20;
  const MAX_LINES = 200;
  const TRUST_TH = {
    high: 'ตรวจกับต้นฉบับแล้ว',
    medium: 'สรุปจากหน้าเว็บ ยังไม่ได้เทียบทุกคำ',
    low: 'ยังไม่ได้ยืนยัน'
  };

  function validSource(s) {
    return Boolean(s && typeof s.id === 'string' && /^[a-z0-9-]{3,40}$/.test(s.id)
      && typeof s.title === 'string' && Array.isArray(s.lines));
  }

  function registry() {
    const all = root.NINO_SOURCES;
    return Array.isArray(all) ? all.filter(validSource).slice(0, MAX_SOURCES) : [];
  }

  function get(id) {
    return registry().find(s => s.id === id) || null;
  }

  function trustOf(s) {
    return TRUST_TH[s.trust] ? s.trust : 'low';
  }

  function isLoaded(store, id) {
    return Boolean(store.sources && store.sources[id]);
  }

  function loadedSources(store) {
    return registry().filter(s => isLoaded(store, s.id));
  }

  // ติดตั้งแหล่ง: เรียนนิยามที่ตรวจผ่าน คืนสรุป
  function load(store, thinker, id) {
    const src = get(id);
    if (!src) return { id, error: 'ไม่พบแหล่งชื่อ "' + id + '"' };
    if (isLoaded(store, id)) return { id, title: src.title, error: 'ติดตั้งแล้ว', already: true };
    const trust = trustOf(src);
    const meta = { src: src.id, trust };
    const learned = [];
    const skipped = [];
    for (const raw of src.lines.slice(0, MAX_LINES)) {
      const line = String(raw ?? '').trim();
      if (!line) continue;
      const item = NINO.SelfStudy.extract(line);
      if (!item) continue; // ไม่ใช่นิยาม ยังใช้ตอบแบบอ่านจากแหล่งได้
      const existing = store.find(item.q);
      if (existing) {
        skipped.push({ q: item.q, reason: existing.src ? 'มีจากแหล่งอื่นแล้ว' : 'มีความรู้เดิมแล้ว ไม่เขียนทับ' });
        continue;
      }
      const status = store.teach(item.q, item.a, meta);
      if (status !== 'new') {
        skipped.push({ q: item.q, reason: 'เก็บไม่ได้ (' + status + ')' });
        continue;
      }
      if (NINO.SelfStudy.verify(thinker, item)) {
        NINO.SelfStudy.registerWord(thinker, item.subject);
        learned.push({ q: item.q, a: item.a });
      } else {
        store.forget(item.q);
        skipped.push({ q: item.q, reason: 'ตรวจกลับไม่ผ่าน' });
      }
    }
    store.sources[id] = { loaded: Date.now(), learned: learned.length, skipped: skipped.length, trust };
    store.save();
    return { id, title: src.title, trust, learned, skipped };
  }

  function loadAll(store, thinker) {
    return registry().filter(s => !isLoaded(store, s.id)).map(s => load(store, thinker, s.id));
  }

  function unload(store, id) {
    if (!isLoaded(store, id) && !get(id)) return { id, error: 'ไม่พบแหล่งชื่อ "' + id + '"' };
    const removed = store.forgetSource(id);
    store.save();
    return { id, removed };
  }

  // อ่านจากแหล่งที่ติดตั้ง: words คือคำเฉพาะของคำถาม (ที่ไม่ใช่คำทั่วไป) คืนประโยคที่ตรงที่สุด หรือ null
  // การให้คะแนนถ่วงด้วยความหายาก (คำที่ปรากฏในหลายประโยคน้อย นับมากกว่า) เหมือนการจัดอันดับในชั้นหนังสือ
  // ของแอปอ้างอิงที่ได้ศึกษา แต่เขียนขึ้นใหม่เองและอิงกับโครงสร้างของมิ้ม ไม่ได้คัดลอกโค้ด
  function openBook(store, words) {
    const want = [...new Set((words || []).map(w => Text.normalize(w)).filter(w => w.length >= 2))];
    if (!want.length) return null;
    const loaded = loadedSources(store);
    const lines = [];
    for (const src of loaded) {
      for (const raw of src.lines.slice(0, MAX_LINES)) {
        const line = String(raw ?? '').trim();
        if (line) lines.push({ src, line, ln: Text.normalize(line) });
      }
    }
    // จำนวนประโยคที่มีคำแต่ละคำ (ใช้หาความหายาก)
    const df = new Map();
    for (const w of want) df.set(w, lines.filter(l => l.ln.includes(w)).length);
    const N = Math.max(lines.length, 1);
    const idf = (w) => Math.log(1 + N / (1 + df.get(w)));
    const totalW = want.reduce((s, w) => s + idf(w), 0) || 1;
    let best = null;
    for (const l of lines) {
      const matched = want.filter(w => l.ln.includes(w));
      if (!matched.length) continue;
      if (!matched.some(w => w.length >= 3)) continue;
      const cov = matched.length / want.length;
      if (cov < 0.6) continue;
      const wcov = matched.reduce((s, w) => s + idf(w), 0) / totalW;
      const score = wcov * 10 + cov * 2 + matched.length * 0.01;
      if (!best || score > best.score) best = { score, text: l.line, source: l.src, cov, matched };
    }
    return best;
  }

  // คำอธิบายที่มาของคำตอบ ใช้ต่อท้ายคำตอบ คืนข้อความหรือ ''
  function describe(store, res) {
    if (!res) return '';
    const srcId = (res.entry && res.entry.src) || res.source || '';
    const src = srcId ? get(srcId) : null;
    if (!src) return '';
    const trust = res.entry && res.entry.trust ? res.entry.trust : trustOf(src);
    return 'แหล่ง: ' + src.title + ' (' + (TRUST_TH[trust] || TRUST_TH.low) + ')';
  }

  // รายการแหล่งทั้งหมดพร้อมสถานะ
  function listing(store) {
    return registry().map(s => {
      const st = store.sources && store.sources[s.id];
      return {
        id: s.id,
        title: s.title,
        url: s.url || '',
        trust: trustOf(s),
        loaded: Boolean(st),
        learned: st ? st.learned : 0,
        skipped: st ? st.skipped : 0
      };
    });
  }

  // ค้นประโยคในทุกแหล่งที่ลงทะเบียน (ไม่ว่าจะติดตั้งแล้วหรือไม่) สำหรับการดูก่อนติดตั้ง
  function search(term, limit) {
    const t = Text.normalize(term);
    if (t.length < 2) return [];
    const out = [];
    for (const s of registry()) {
      for (const line of s.lines) {
        if (Text.normalize(line).includes(t)) out.push({ source: s, line });
        if (out.length >= (limit || 5)) return out;
      }
    }
    return out;
  }

  NINO.Sources = { registry, get, load, loadAll, unload, openBook, describe, listing, search, trustLabel: (t) => TRUST_TH[t] || TRUST_TH.low, isLoaded };
})(typeof globalThis !== 'undefined' ? globalThis : this);
