/* มิ้ม | 39-learn
 * การเรียนรู้จากการสอนครั้งเดียว และชื่อของระบบ
 *  - สอนครั้งเดียว ได้รูปคำถามใกล้เคียงอีกหลายรูป (ตัดคำลงท้าย ตัดคำถามเช่น อะไร/ยังไง ตัดคำนำ เช่น ช่วย/บอกหน่อยว่า)
 *    ทุกรูปชี้ไปยังคำตอบเดียวกัน ทำเครื่องหมาย derived ไว้ ไม่เขียนทับความรู้เดิมที่มีคำถามรูปนั้นอยู่แล้ว
 *  - ชื่อของระบบคือ "มิ้ม" ไม่ใช่ NINO การแสดงผลแทนชื่อเดิมในประโยคที่พูดถึงตัวเองเท่านั้น
 *    ไม่แก้ข้อมูลที่เก็บไว้ (ความรู้เดิมของผู้ใช้ยังอยู่เหมือนเดิม)
 *  - ชุดความรู้เริ่มต้น (pack) เติมเฉพาะคำถามที่ยังไม่มี และบันทึกรุ่นของ pack ไว้ จึงเติมซ้ำได้โดยไม่เขียนทับ
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;
  const Text = NINO.Text;

  // ตัวเลือกการขยายรูปคำถาม (ตัวกำหนดอยู่ที่นี่ที่เดียว)
  const MAX_VARIANTS = 4;
  const MIN_VARIANT_CHARS = 3;
  const TAIL_PARTICLES = /(?:\s*(?:ไหม|มั้ย|มั๊ย|หรือเปล่า|หรือไม่|หรือยัง|หรอ|เหรอ|คะ|ค่ะ|ครับ|นะ|น้า|บ้าง))+\s*$/;
  const QUESTION_WORDS = /(?:\s*(?:อะไร|ยังไง|อย่างไร|ใคร|ที่ไหน|เมื่อไหร่|เมื่อไร|ทำไม|กี่|เท่าไหร่|เท่าไร))+\s*$/;
  const LEAD_WORDS = /^(?:ช่วย|บอก(?:หน่อย|ที)?(?:ว่า)?|ขอทราบ|อยากรู้ว่า|รู้ไหม(?:ว่า)?)\s*/;

  function clean(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
  }

  // รูปคำถามใกล้เคียงของคำถามหนึ่ง เรียงตามความสำคัญ ไม่รวมคำถามเดิม
  function variants(q) {
    const base = clean(q);
    const baseN = Text.normalize(base);
    const out = [];
    const seen = new Set([baseN]);
    const add = (s) => {
      s = clean(s);
      const n = Text.normalize(s);
      if (!n || n.length < MIN_VARIANT_CHARS || seen.has(n)) return;
      seen.add(n);
      out.push(s);
    };
    const noTail = base.replace(TAIL_PARTICLES, '');
    add(noTail);
    add(noTail.replace(QUESTION_WORDS, ''));
    add(base.replace(LEAD_WORDS, ''));
    add(noTail.replace(LEAD_WORDS, '').replace(QUESTION_WORDS, ''));
    return out.slice(0, MAX_VARIANTS);
  }

  // สอนหนึ่งคู่ และขยายรูปคำถาม คืน { status, derived }
  // status เหมือน store.teach: 'new' | 'updated' | 'invalid' | 'too_long' | 'full'
  // การอัปเดตความรู้เดิมไม่สร้างรูปคำถามเพิ่ม (รูปเดิมยังอยู่)
  function teach(store, q, a) {
    const status = store.teach(q, a);
    if (status !== 'new') return { status, derived: [] };
    const answer = clean(a);
    const derived = [];
    for (const v of variants(q)) {
      if (store.entries.length >= NINO.LIMITS.entries) break;
      if (store.find(v)) continue;
      store.entries.push({ q: v, a: answer, hits: 0, created: Date.now(), derived: clean(q) });
      derived.push(v);
    }
    if (derived.length) store._touch();
    return { status, derived };
  }

  // เติมชุดความรู้เริ่มต้น เฉพาะคำถามที่ยังไม่มี คืนจำนวนรายการที่เพิ่ม
  function ensurePack(store, pack) {
    if (!pack || !Array.isArray(pack.entries)) return 0;
    if (store.settings.packVersion === pack.version) return 0;
    let added = 0;
    for (const pair of pack.entries) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      if (store.entries.length >= NINO.LIMITS.entries) break;
      const q = clean(pair[0]);
      const a = clean(pair[1]);
      if (!q || !a || store.find(q)) continue;
      store.entries.push({ q, a, hits: 0, created: Date.now(), source: 'pack' });
      added++;
    }
    store.settings.packVersion = pack.version;
    store._touch();
    return added;
  }

  // ชื่อที่ระบบใช้เรียกตัวเองคือ "มิ้ม" ใช้ตอนแสดงผลเท่านั้น (ข้อความเก่าที่เก็บไว้ไม่ถูกแก้)
  const SELF_NAME_RULES = [
    [/NINO\s+Local\s+AI/gi, 'มิ้ม'],
    [/(ฉันคือ|นี่คือ|ชื่อ|ผู้ช่วย|ชื่อฉัน)\s*NINO\b/g, '$1มิ้ม']
  ];

  function displayName(text) {
    let s = String(text ?? '');
    for (const [re, rep] of SELF_NAME_RULES) s = s.replace(re, rep);
    return s;
  }

  NINO.Learn = { variants, teach, ensurePack, displayName };
})(typeof globalThis !== 'undefined' ? globalThis : this);
