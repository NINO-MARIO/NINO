/* มิ้ม | 30-retrieval
 * โหนดค้นหาคำตอบ: ตรงตัวก่อน แล้วค่อยใช้คะแนนความคล้าย ถ้าได้คะแนนถึงเกณฑ์จึงตอบ
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;
  const Text = NINO.Text;

  // วลีถามทั่วไปที่ไม่ใช่หัวข้อ ตัดออกก่อนดูว่าคำถามพูดถึงอะไร (ยาวก่อนสั้น)
  const TEMPLATE_PHRASES = ['หรือเปล่า', 'คืออะไร', 'อย่างไร', 'ยังไง', 'ได้ไหม', 'เท่าไหร่', 'เท่าไร',
    'มั้ย', 'ไหม', 'อะไร', 'ไหน', 'ทำไม', 'เหรอ', 'หรอ', 'ไง', 'กี่', 'บ้าง', 'นะ', 'คะ', 'ครับ', 'ค่ะ'];
  // bigram ของตัวอักษรที่เขียนจริง (ไม่ใช่ค่าเสียงจากการแปลงอักษร เพราะจะจับคู่เกินจริง)
  function charGrams(str) {
    const out = new Set();
    for (let i = 0; i + 1 < str.length; i++) out.add(str.slice(i, i + 2));
    return out;
  }
  function stripTemplates(qn) {
    let t = qn;
    for (const p of TEMPLATE_PHRASES) t = t.split(p).join('');
    return t;
  }

  class RetrievalNode extends NINO.Node {
    constructor(id, bus, store) {
      super(id, bus);
      this.store = store;
    }

    // ตรงตัวเท่านั้น (ชื่อที่ทำให้เป็นรูปมาตรฐานเหมือนกันทุกตัวอักษร) ใช้เป็นชั้นแรกสุดของการตอบ
    exact(input) {
      const qn = Text.normalize(input);
      if (!qn) return null;
      const e = this.store.index().exact.get(qn);
      return e ? { entry: e, score: 1 } : null;
    }

    match(input) {
      const qn = Text.normalize(NINO.Aliases ? NINO.Aliases.apply(input) : input);
      if (!qn) return null;

      const idx = this.store.index();
      const exact = idx.exact.get(qn);
      if (exact) return { entry: exact, score: 1 };

      const qp = Text.profile(qn);
      // แกนของคำถามคือส่วนที่ไม่ใช่คำถามทั่วไป (เช่น "คืออะไร") ต้องมี bigram ร่วมกับรายการจริง
      // กันรายการที่ตรงกันเพียงเพราะคำลงท้ายแบบเดียวกัน เช่น "ความรักคืออะไร" ไม่ควรได้ "มิ้มคืออะไร"
      const coreText = stripTemplates(qn);
      const coreGrams = coreText.length >= 2 ? charGrams(coreText) : null;
      // คัดเฉพาะรายการที่มีคำหรือ bigram ร่วมกับคำถาม (รายการอื่นคะแนนเป็นศูนย์อยู่แล้ว)
      // เรียงตามลำดับเดิมเพื่อให้รายการที่คะแนนเท่ากันยังเลือกตัวแรกเหมือนเดิม
      const cand = new Set();
      for (const key of qp.b) for (const i of idx.post.get(key) || []) cand.add(i);
      for (const key of qp.t) for (const i of idx.post.get(key) || []) cand.add(i);
      let best = null;
      let bestScore = 0;
      for (const i of [...cand].sort((a, b) => a - b)) {
        const item = idx.profiles[i];
        if (coreGrams && item.entry && item.entry.q) {
          const eg = charGrams(stripTemplates(Text.normalize(item.entry.q)));
          if (eg.size && ![...coreGrams].some(g => eg.has(g))) continue;
        }
        const s = Text.score(qp, item.p);
        if (s > bestScore) {
          bestScore = s;
          best = item.entry;
        }
      }
      // เกณฑ์ที่ใช้จริงปรับตามสัญญาณการใช้งาน (31-calibrate) ค่าเริ่มต้นเท่ากับเกณฑ์เดิม
      const limit = NINO.Calibrator ? NINO.Calibrator.effective(this.store) : this.store.settings.threshold;
      if (best && bestScore >= limit) {
        return { entry: best, score: bestScore };
      }
      return null;
    }
  }

  NINO.RetrievalNode = RetrievalNode;
})(typeof globalThis !== 'undefined' ? globalThis : this);
