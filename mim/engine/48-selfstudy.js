/* มิ้ม | 48-selfstudy
 * การเรียนเองจากข้อความที่ได้อ่าน (ไม่ต้องพิมพ์ "สอน คำถาม | คำตอบ" ทีละข้อ)
 *
 *   1. อ่าน: เก็บข้อความไว้เป็นบันทึก (store.notes) แล้วแยกประโยค
 *   2. ดึงนิยาม: ประโยครูปแบบ "X คือ/หมายถึง/เป็น ..." กลายเป็นคู่ "X คืออะไร" -> ประโยคนั้น
 *      ประโยครูปแบบ "X ใช้ ..." กลายเป็นคู่ "X ใช้ทำอะไร" -> ประโยคนั้น
 *   3. ตรวจตัวเอง: ถามด้วยคำถามเดียวกันในรูปที่ต่างออกไป ต้องได้ประโยคเดิมกลับมา
 *      ถ้าไม่ผ่านจะไม่เก็บ และไม่เขียนทับความรู้เดิม
 *   4. เมื่อคำถามมีคำที่ไม่รู้จัก มิ้มค้นบันทึกหาคำนั้น ถ้าเจอนิยามที่ตรวจผ่าน จะเรียนแล้วตอบใหม่
 *
 * ข้อจำกัด: มิ้มเรียนได้เฉพาะสิ่งที่อยู่ในข้อความที่ได้อ่าน ไม่สร้างข้อเท็จจริงขึ้นเอง
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;
  const Text = NINO.Text;

  const DEF_RE = /^(.{2,40}?)\s*(คือ|หมายถึง|ได้แก่|เป็น)\s*(.{2,})$/;
  const USE_RE = /^(.{2,40}?)\s*(ใช้|เอาไว้)\s*(.{2,})$/;
  // คำที่ไม่ใช่ชื่อเรื่อง แม้อยู่หน้าคำว่า "คือ"
  const NOT_SUBJECT = new Set(['เขา', 'มัน', 'นี่', 'นั่น', 'นี้', 'นั้น', 'อันนี้', 'อันนั้น', 'สิ่งนี้', 'สิ่งนั้น',
    'ฉัน', 'เรา', 'คุณ', 'ที่นี่', 'ที่นั่น', 'ตรงนี้', 'ตรงนั้น', 'แบบนี้', 'แบบนั้น', 'ทุกอย่าง', 'มิ้ม', 'ฉันคือ']);

  function sentences(text) {
    return String(text ?? '')
      .split(/[\r\n]+|(?<=[.!?])\s+/)
      .map(s => s.replace(/^[-•*\s]+/, '').replace(/[.!?。]+$/, '').trim())
      .filter(s => s.length >= 6 && s.length <= 300 && !s.startsWith('#'));
  }

  // ต้นประโยคที่บอกว่าเป็นส่วนของประโยค ไม่ใช่ชื่อเรื่อง (เช่น "แม้ทุเรียนจะ..." "แถมยัง...")
  const BAD_START = ['แม้', 'แถม', 'แต่', 'และ', 'ซึ่ง', 'จึง', 'ทั้ง', 'เมื่อ', 'ถ้า', 'หาก', 'เพราะ', 'ปัจจุบัน',
    'ทุก', 'บาง', 'ยัง', 'ก็', 'จะ', 'ที่', 'ใน', 'ของ', 'กับ', 'โดย', 'ตาม', 'เป็น', 'คือ', 'มี', 'ได้', 'ไม่',
    'นอกจาก', 'ส่วน', 'สำหรับ'];
  // ส่วนที่ทำให้ไม่ใช่ชื่อเรื่องเมื่ออยู่ข้างใน (กริยาช่วย คำเชื่อม เครื่องหมายคำพูด)
  const BAD_INSIDE = ['ถูก', 'จะ', 'ที่', 'ซึ่ง', 'ได้', '“', '”', '"', "'"];

  function validSubject(subj) {
    if (!subj || subj.length < 2 || subj.length > 30) return false;
    if (NOT_SUBJECT.has(subj)) return false;
    // ชื่อเรื่องควรสั้น ไม่เป็นประโยคทั้งท่อน
    if (subj.split(/\s+/).length > 3) return false;
    if (/\d/.test(subj)) return false;
    if (BAD_START.some(p => subj.startsWith(p))) return false;
    if (BAD_INSIDE.some(p => subj.includes(p))) return false;
    return !/[|:：]/.test(subj);
  }

  // ดึงหนึ่งรายการจากประโยค คืน { subject, q, a, kind } หรือ null
  function extract(sentence) {
    if (/[|:：]/.test(sentence)) return null;
    let m = sentence.match(DEF_RE);
    if (m) {
      const subject = m[1].trim();
      if (validSubject(subject)) return { subject, q: subject + 'คืออะไร', a: sentence, kind: 'def' };
    }
    m = sentence.match(USE_RE);
    if (m) {
      const subject = m[1].trim();
      if (validSubject(subject)) return { subject, q: subject + 'ใช้ทำอะไร', a: sentence, kind: 'use' };
    }
    return null;
  }

  // คำถามเดียวกันในรูปที่ต่างออกไป ใช้ตรวจว่ามิ้มดึงความรู้นี้กลับมาได้จริง
  function paraphrase(q) {
    return q.endsWith('คืออะไร') ? q + 'บ้าง' : q.replace(/ใช้ทำอะไร$/, 'ใช้ทำอะไรบ้าง');
  }

  function runThink(thinker, text) {
    const g = thinker._think(text);
    let r = g.next();
    while (!r.done) r = g.next();
    return r.value;
  }

  // ตรวจว่าคำถามรูปอื่นได้ประโยคเดิมกลับมา (ด้วยท่อจริง)
  function verify(thinker, item) {
    // ระหว่างตรวจห้ามเรียนซ้อน (กันวนซ้ำ)
    const was = thinker._learning;
    thinker._learning = true;
    try {
      const r = runThink(thinker, paraphrase(item.q));
      return !!(r && r.entry && r.entry.a === item.a);
    } finally {
      thinker._learning = was;
    }
  }

  // ชื่อเรื่องที่เรียนแล้วเป็นคำหนึ่งคำ ไม่ถูกตัดเป็นพยางค์เมื่อคิดรอบถัดไป (เช่น "ทุเรียน" ไม่ใช่ "ทุ | เรียน")
  function registerWord(thinker, word) {
    const lx = thinker && thinker.lexicon;
    if (lx && typeof lx.add === 'function' && /\p{L}/u.test(word) && word.length >= 2) lx.add(Text.normalize(word));
  }

  // ค้นนิยามของคำที่ไม่รู้จักจากบันทึก คืนรายการแรกที่ยังไม่มีในความรู้ หรือ null
  function findFor(store, words) {
    const targets = words.map(w => Text.normalize(w)).filter(w => w.length >= 2);
    if (!targets.length) return null;
    for (let i = store.notes.length - 1; i >= 0; i--) {
      for (const s of sentences(store.notes[i])) {
        const item = extract(s);
        if (!item) continue;
        const sn = Text.normalize(item.subject);
        const hit = targets.some(t => sn === t || (sn.length >= 3 && t.length >= 3 && (sn.includes(t) || t.includes(sn))));
        if (hit && !store.find(item.q)) return item;
      }
    }
    return null;
  }

  // อ่านข้อความใหม่: เก็บบันทึก แล้วเรียนนิยามที่ตรวจผ่าน คืนสรุป
  function ingest(store, thinker, text) {
    const added = store.addNote(text);
    const learned = [];
    const skipped = [];
    for (const s of sentences(text)) {
      const item = extract(s);
      if (!item) continue;
      if (store.find(item.q)) {
        skipped.push({ q: item.q, reason: 'มีความรู้เดิมแล้ว ไม่เขียนทับ' });
        continue;
      }
      const status = store.teach(item.q, item.a);
      if (status !== 'new') {
        skipped.push({ q: item.q, reason: 'เก็บไม่ได้ (' + status + ')' });
        continue;
      }
      registerWord(thinker, item.subject);
      if (verify(thinker, item)) {
        learned.push({ q: item.q, a: item.a });
      } else {
        store.forget(item.q);
        skipped.push({ q: item.q, reason: 'ตรวจกลับไม่ผ่าน' });
      }
    }
    // คำที่เคยถามแล้วไม่รู้ (gaps) และข้อความนี้อธิบายไว้: เรียนเองทันทีโดยไม่ต้องถามซ้ำ
    for (const w of store.gaps.slice()) {
      const item = findFor(store, [w]);
      if (!item) continue;
      const was = store.find(item.q);
      if (was) continue;
      if (store.teach(item.q, item.a) !== 'new') continue;
      if (verify(thinker, item)) {
        registerWord(thinker, item.subject);
        store.resolveGap(w);
        learned.push({ q: item.q, a: item.a, fromGap: w });
      } else {
        store.forget(item.q);
      }
    }
    if (learned.length) store.save();
    return { noteAdded: added, learned, skipped };
  }

  NINO.SelfStudy = { sentences, extract, paraphrase, verify, findFor, ingest, registerWord };
})(typeof globalThis !== 'undefined' ? globalThis : this);
