/* มิ้ม | 33-links
 * โหนดต่อเชื่อม: แต่ละโหนดเสนอความรู้ที่อาจตรงกับคำถาม พร้อมเหตุผลและคะแนน
 * ผู้คิด (37-thinker) ถามทุกโหนดแล้วเลือกข้อเสนอที่คะแนนสูงสุด
 *
 * โหนดที่มี:
 *   - ParaphraseLinker: รูปคำถามต่างกันแต่ความหมายเดียวกัน เช่น "ข้าวอร่อยไหม" กับ "ข้าวอร่อยมั้ย"
 *   - SoundLinker: เขียนต่างกันแต่เสียงเดียวกัน เช่น "ไทย" กับ "ใทย" (ใช้ NINO.Romanize)
 *   - ContextLinker: คำอ้างอิงที่ไม่มีเนื้อหา เช่น "มันคืออะไร" "แล้วมันล่ะ" หมายถึงเรื่องที่คุยอยู่ก่อนหน้า
 *     เสนอเฉพาะเมื่อประโยคเหลือแค่คำอ้างอิงกับคำถามเท่านั้น ถ้ามีคำอื่นติดมาจะไม่เสนอ เพราะเป็นเรื่องใหม่
 *
 * กฎความปลอดภัยของทุกโหนด:
 *   - เสนอเฉพาะเมื่อคีย์ตรงกับรายการเดียวเท่านั้น ถ้าคีย์ชนกันหลายรายการจะไม่เสนอ (กำกวม)
 *   - คีย์เสียงต้องยาวอย่างน้อย MIN_SOUND_KEY ตัว กันคีย์สั้นที่ชนกันโดยบังเอิญ
 *   - ดัชนีสร้างใหม่เมื่อคลังเปลี่ยน (store.version) ไม่คำนวณซ้ำทุกคำถาม
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;
  const Text = NINO.Text;

  const MIN_SOUND_KEY = 4;

  // คำลงท้ายที่ไม่เปลี่ยนความหมายของคำถาม (ตัดจากท้ายประโยคซ้ำจนไม่เหลือ)
  const PARTICLES = ['ครับ', 'ค่ะ', 'คะ', 'นะคะ', 'นะครับ', 'นะ', 'จ้า', 'จ้ะ', 'ไหม', 'มั้ย', 'หรือเปล่า', 'หรอ', 'เหรอ', 'บ้าง'];
  // รูปที่เขียนต่างกันแต่ความหมายเดียวกัน
  const SYNONYMS = [
    [/อย่างไร$/, 'ยังไง'],
    [/เท่าไหร่$/, 'เท่าไร'],
    [/เมื่อไหร่$/, 'เมื่อไร']
  ];

  // คีย์ความหมาย: ตัดช่องว่าง ตัดคำลงท้าย แล้วรวมรูปที่เทียบเท่ากัน
  function paraphraseKey(text) {
    let s = Text.normalize(text).replace(/\s+/g, '');
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of PARTICLES) {
        if (s.length > p.length && s.endsWith(p)) {
          s = s.slice(0, -p.length);
          changed = true;
          break;
        }
      }
    }
    for (const [re, rep] of SYNONYMS) s = s.replace(re, rep);
    return s;
  }

  // ดัชนีคีย์ -> รายการเดียว ถ้าคีย์ชนกันหลายรายการเก็บเป็น null (กำกวม จะไม่เสนอ)
  function uniqueIndex(entries, keyOf) {
    const m = new Map();
    for (const e of entries) {
      const k = keyOf(e);
      if (!k) continue;
      if (!m.has(k)) m.set(k, e);
      else if (m.get(k) !== e) m.set(k, null);
    }
    return m;
  }

  // แคชคีย์ต่อรายการ: เมื่อคลังเปลี่ยนต้องสร้างดัชนีใหม่ แต่คีย์ของรายการเดิมไม่ต้องคำนวณซ้ำ
  // เก็บคู่ (ข้อความที่ใช้คำนวณ, คีย์) ไว้ ถ้ารายการถูกแก้ไขข้อความจะไม่ตรง จึงคำนวณใหม่เอง
  // ข้อควรระวัง: keyOf ต้องคืนค่าเดิมเสมอเมื่อข้อความเดิม (เป็นฟังก์ชันบริสุทธิ์)
  function memoizeKey(keyOf) {
    const cache = new WeakMap();
    return e => {
      const hit = cache.get(e);
      if (hit && hit.q === e.q) return hit.k;
      const k = keyOf(e);
      cache.set(e, { q: e.q, k });
      return k;
    };
  }
  const paraphraseKeyOf = memoizeKey(e => paraphraseKey(e.q));
  const soundKeyOf = memoizeKey(e => (NINO.Romanize ? NINO.Romanize.key(e.q) : ''));

  // สร้างดัชนีของโหนดใหม่เฉพาะเมื่อ store.version เปลี่ยน
  function cachedIndex(node, keyOf) {
    const s = node.store;
    if (node._ix && node._ixVersion === s.version) return node._ix;
    node._ix = uniqueIndex(s.entries, keyOf);
    node._ixVersion = s.version;
    return node._ix;
  }

  // ฐานของโหนดเชื่อม: propose(text) คืน [{ entry, score, source, why }] หรือ [] ถ้าไม่มีข้อเสนอ
  class LinkNode extends NINO.Node {
    constructor(id, bus, store, label) {
      super(id, bus);
      this.store = store;
      this.label = label;
    }
    propose() {
      return [];
    }
  }

  class ParaphraseLinker extends LinkNode {
    constructor(id, bus, store) {
      super(id, bus, store, 'ปรับรูปคำถาม');
    }
    propose(text) {
      const k = paraphraseKey(text);
      if (!k) return [];
      const e = cachedIndex(this, paraphraseKeyOf).get(k);
      if (!e) return [];
      return [{ entry: e, score: 0.92, source: 'paraphrase', why: 'รูปคำถามต่างกันแต่ความหมายเดียวกัน' }];
    }
  }

  class SoundLinker extends LinkNode {
    constructor(id, bus, store) {
      super(id, bus, store, 'เทียบเสียง');
    }
    propose(text) {
      if (!NINO.Romanize) return [];
      const k = NINO.Romanize.key(text);
      if (!k || k.length < MIN_SOUND_KEY) return [];
      const e = cachedIndex(this, soundKeyOf).get(k);
      if (!e) return [];
      return [{ entry: e, score: 0.75, source: 'sound', why: 'เขียนต่างกันแต่เสียงเดียวกัน' }];
    }
  }

  // ---- โหนดบริบท ----
  // คำอ้างอิงที่ไม่มีเนื้อหาของตัวเอง เช่น "มันคืออะไร" หรือ "แล้วมันล่ะ" หมายถึงเรื่องที่คุยอยู่ก่อนหน้า
  // ข้อควรระวัง: ต้องเสนอเฉพาะประโยคที่เหลือแค่คำอ้างอิงกับคำถามจริงๆ
  // ถ้ามีคำอื่นติดมา (เช่น "มันเทศคืออะไร") นั่นคือเรื่องใหม่ ห้ามเดาว่าเป็นเรื่องเดิม
  const REFERENCES = ['มัน', 'อันนั้น', 'อันนี้', 'เรื่องนั้น', 'เรื่องนี้', 'สิ่งนั้น', 'สิ่งนี้', 'นั่น', 'นี่'];
  const FILLERS = ['คืออะไร', 'อะไร', 'ยังไง', 'เท่าไหร่', 'เท่าไร', 'ที่ไหน', 'เมื่อไหร่', 'เมื่อไร', 'ใคร', 'ทำไม', 'แล้ว', 'หรือ', 'ล่ะ', 'หรอ', 'เหรอ', 'ไหม', 'มั้ย', 'บ้าง', 'คะ', 'ครับ', 'ค่ะ', 'นะ', 'ละ'];
  // ตัดคำที่ยาวกว่าก่อน กันการตัดคำสั้นไปแทรกกลางคำยาว
  const REF_TOKENS = [...REFERENCES, ...FILLERS].sort((a, b) => b.length - a.length);

  // จริงเมื่อประโยคมีคำอ้างอิง และหลังตัดคำอ้างอิงกับคำถามทิ้งแล้วไม่เหลืออะไร
  function isReferenceOnly(text) {
    let s = Text.normalize(text).replace(/\s+/g, '');
    if (!REFERENCES.some(r => s.includes(r))) return false;
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of REF_TOKENS) {
        if (s.includes(t)) {
          s = s.split(t).join('');
          changed = true;
        }
      }
    }
    return s === '';
  }

  class ContextLinker extends LinkNode {
    constructor(id, bus, store, context) {
      super(id, bus, store, 'อ้างถึงบริบท');
      // context.last คือรายการความรู้ที่ตอบไปล่าสุด (ผู้คิดเป็นผู้ตั้งค่า)
      this.context = context;
    }
    propose(text) {
      const last = this.context && this.context.last;
      if (!last) return [];
      // ถ้ารายการนี้ถูกลืมไปแล้ว ต้องไม่อ้างถึงอีก
      if (this.store.entries.indexOf(last) < 0) return [];
      if (!isReferenceOnly(text)) return [];
      return [{ entry: last, score: 0.7, source: 'context', why: 'คำถามอ้างถึงเรื่องที่คุยอยู่ก่อนหน้า' }];
    }
  }

  // ชุดโหนดเชื่อมมาตรฐานของผู้คิดหนึ่งตัว
  function defaultLinkers(bus, store, context) {
    return [
      new ParaphraseLinker('link.paraphrase', bus, store),
      new SoundLinker('link.sound', bus, store),
      new ContextLinker('link.context', bus, store, context || { last: null })
    ];
  }

  NINO.LinkNode = LinkNode;
  NINO.ParaphraseLinker = ParaphraseLinker;
  NINO.SoundLinker = SoundLinker;
  NINO.ContextLinker = ContextLinker;
  NINO.defaultLinkers = defaultLinkers;
  NINO.Paraphrase = { key: paraphraseKey, MIN_SOUND_KEY };
})(typeof globalThis !== 'undefined' ? globalThis : this);
