/* มิ้ม | 35-lexicon
 * ตัวแยกคำภาษาไทย (ภาษาไทยไม่มีช่องว่างระหว่างคำ)
 *
 * วิธี: แบ่งข้อความเป็น "กลุ่มอักขระ" (cluster) ก่อน เช่น พยัญชนะ + สระ + วรรณยุกต์ อยู่ด้วยกันเสมอ
 * แล้วหาทางแบ่งที่มีต้นทุนรวมต่ำสุดด้วย Viterbi
 *   - คำในคลังมีต้นทุน = log(รวมความถี่ / ความถี่ของคำ) คำที่พบบ่อยจึงถูกเลือกก่อน
 *   - กลุ่มอักขระที่ไม่อยู่ในคลังมีต้นทุนคงที่ UNK_COST (สูงกว่าคำในคลัง)
 *   - ช่วงที่ไม่รู้จักติดกันจะถูกรวมเป็นคำเดียวในผลลัพธ์
 *
 * การเรียนรู้: เรียนเฉพาะช่วงที่ไม่รู้จัก ไม่เรียนทั้งประโยค
 * (เดิมเรียนทั้งประโยคเป็นคำเดียว ทำให้กราฟคำไม่มีความหมายเชิงองค์ประกอบ)
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;

  const BASE_WORDS = `
    ฉัน เธอ นาย เรา คุณ มัน เขา พวกเรา พวกเขา ท่าน ผม ดิฉัน หนู
    อะไร ทำไม ยังไง อย่างไร ที่ไหน เมื่อไร เมื่อไหร่ ใคร เท่าไร เท่าไหร่ ไหน
    เป็น คือ มี ได้ ทำ ไป มา กิน นอน รัก ชอบ คิด รู้ ตอบ สอน ถาม เรียน อยู่ ให้ จำ เข้าใจ
    เห็น ฟัง พูด อ่าน เขียน ใช้ เกิด ซื้อ ขาย ขอ ช่วย ลอง เริ่ม จบ
    ข้าว น้ำ บ้าน คน เงิน วัน เวลา ปี เดือน ชั่วโมง โลก ประเทศ ไทย ภาษา ความรู้ ข้อมูล คำถาม คำตอบ
    ระบบ เครื่อง โปรแกรม เบราว์เซอร์ ปัญญา ประดิษฐ์ โมเดล เน็ต อินเทอร์เน็ต
    ดี เก่ง เร็ว ช้า ใหญ่ เล็ก ใหม่ เก่า สวย ร้อน หนาว สูง ต่ำ มาก น้อย ทั้งหมด
    สวัสดี ขอบคุณ บาย ยินดี เพื่อน ครอบครัว แมว หมา สัตว์ สัตว์เลี้ยง อาหาร
    ทวีป เอเชีย ทอง ราคา ตลาด โลก ท้องฟ้า สี จันทร์ อังคาร พุธ วันนี้ ต่าง กัน ที่น่ารัก ซื่อสัตย์ อธิบาย
    หมายถึง ย่อมาจาก อุณหภูมิ สังเคราะห์ ละลาย เดือด เริ่ม ใบ ห้อง ดวง
    ที่ ของ และ หรือ แต่ ก็ จะ กับ ใน บน นี้ นั้น ไหม นะ ครับ ค่ะ จ้า แล้ว ยัง ไม่ ว่า เพราะ ถ้า
  `.split(/\s+/).filter(Boolean);

  // คำที่ไม่นับเป็นคำสำคัญในการเชื่อมโยงความหมาย
  const STOP_WORDS = new Set(`
    ที่ ของ และ หรือ แต่ ก็ จะ กับ ใน บน นี้ นั้น ไหม นะ ครับ ค่ะ จ้า แล้ว ยัง ไม่ ว่า เพราะ ถ้า
    เป็น คือ มี ได้ ให้ อยู่ ไป มา ทำ ฉัน เธอ นาย เรา คุณ มัน เขา ผม ดิฉัน หนู
    อะไร ยังไง อย่างไร ทำไม ไหน
  `.split(/\s+/).filter(Boolean));

  const MAX_WORD = 30;
  const UNK_COST = 12;
  // กลุ่มอักขระ: ลำดับตัวเลขหรืออักษรละติน, อักษรหนึ่งตัวพร้อมเครื่องหมายกำกับ, ตัวเลขไทย, เครื่องหมายอื่นทีละตัว
  const CLUSTER_RE = /[A-Za-z0-9]+|\p{L}\p{M}*|\p{N}+|\p{M}+|[^\s]/gu;

  function clusterEnds(s) {
    const ends = new Array(s.length);
    for (const m of s.matchAll(CLUSTER_RE)) {
      const e = m.index + m[0].length;
      for (let k = m.index; k < e; k++) ends[k] = e;
    }
    return ends;
  }

  function mergeUnknown(pieces) {
    const out = [];
    for (const p of pieces) {
      const last = out[out.length - 1];
      if (!p.known && last && !last.known) last.w += p.w;
      else out.push({ w: p.w, known: p.known });
    }
    return out;
  }

  class Lexicon {
    constructor(words) {
      this.freq = new Map();
      this.total = 0;
      this.maxLen = 1;
      this.prefixes = new Set(); // ทุกคำนำหน้าของคำในคลัง ใช้ตัดการค้นหาที่ไม่มีทางเจอคำ (ผลลัพธ์เหมือนเดิม)
      for (const w of words || []) this.add(w);
    }

    // คืน true ถ้าเป็นคำใหม่
    add(w, n) {
      w = String(w ?? '').trim();
      const k = n || 1;
      if (!w || w.length > MAX_WORD) return false;
      const prev = this.freq.get(w) || 0;
      this.freq.set(w, prev + k);
      this.total += k;
      if (w.length > this.maxLen) this.maxLen = w.length;
      if (prev === 0) for (let j = 1; j <= w.length; j++) this.prefixes.add(w.slice(0, j));
      return prev === 0;
    }

    has(w) {
      return this.freq.has(w);
    }

    _cost(w) {
      return Math.log(this.total) - Math.log(this.freq.get(w));
    }

    // แบ่งช่วงที่ไม่มีช่องว่างด้วย Viterbi คืนรายการ {w, known}
    segmentChunk(s) {
      const n = s.length;
      if (!n) return [];
      const ends = clusterEnds(s);
      const best = new Float64Array(n + 1).fill(Infinity);
      const back = new Array(n + 1).fill(null);
      best[0] = 0;
      // ต้นทุน = log(รวม) - log(ความถี่) คำนวณ log(รวม) ครั้งเดียวต่อช่วง ให้ค่าเหมือน _cost() ทุกบิต
      const logTotal = Math.log(this.total);
      for (let i = 0; i < n; i++) {
        if (best[i] === Infinity) continue;
        const maxL = Math.min(this.maxLen, n - i);
        for (let L = 1; L <= maxL; L++) {
          const w = s.substr(i, L);
          // ถ้าไม่มีคำในคลังขึ้นต้นด้วย w ก็ไม่มีคำที่ยาวกว่านี้เช่นกัน จึงหยุดได้
          if (!this.prefixes.has(w)) break;
          const f = this.freq.get(w);
          if (f === undefined) continue;
          const c = best[i] + (logTotal - Math.log(f));
          if (c < best[i + L]) {
            best[i + L] = c;
            back[i + L] = { from: i, w, known: true };
          }
        }
        const e = ends[i];
        const cu = best[i] + UNK_COST;
        if (cu < best[e]) {
          best[e] = cu;
          back[e] = { from: i, w: s.slice(i, e), known: false };
        }
      }
      const pieces = [];
      let pos = n;
      while (pos > 0 && back[pos]) {
        const b = back[pos];
        pieces.push(b);
        pos = b.from;
      }
      pieces.reverse();
      return mergeUnknown(pieces);
    }

    segment(text) {
      const out = [];
      for (const chunk of String(text ?? '').split(/\s+/)) {
        if (chunk) out.push(...this.segmentChunk(chunk));
      }
      return out;
    }

    // เหมือน learn แต่คืนคำที่แยกได้ด้วย (words) เพื่อให้ผู้เรียกใช้ซ้ำได้ ไม่ต้องแยกข้อความเดิมอีกรอบ
    // ใช้ได้เฉพาะเมื่อ learned ว่าง: แปลว่าคลังไม่เปลี่ยนระหว่างแยก ผลจึงเหมือนการแยกใหม่ทุกประการ
    learnTokens(text) {
      const learned = [];
      const words = [];
      for (const chunk of String(text ?? '').split(/\s+/)) {
        if (!chunk) continue;
        for (const t of this.segmentChunk(chunk)) {
          words.push(t.w);
          if (!t.known && t.w.length >= 2 && /\p{L}/u.test(t.w) && this.add(t.w)) learned.push(t.w);
        }
      }
      return { learned, words };
    }

    // เรียนเฉพาะช่วงที่ไม่รู้จักและมีตัวอักษรอย่างน้อยสองตัว คืนรายการคำที่เพิ่มใหม่
    learn(text) {
      const learned = [];
      for (const chunk of String(text ?? '').split(/\s+/)) {
        if (!chunk) continue;
        for (const t of this.segmentChunk(chunk)) {
          if (!t.known && t.w.length >= 2 && /\p{L}/u.test(t.w) && this.add(t.w)) learned.push(t.w);
        }
      }
      return learned;
    }
  }

  NINO.BASE_WORDS = BASE_WORDS;
  NINO.STOP_WORDS = STOP_WORDS;
  NINO.Lexicon = Lexicon;
  NINO.clusterEnds = clusterEnds;
})(typeof globalThis !== 'undefined' ? globalThis : this);
