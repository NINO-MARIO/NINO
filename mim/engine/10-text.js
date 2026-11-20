/* มิ้ม | 10-text
 * เครื่องมือข้อความ: ทำให้เป็นรูปมาตรฐาน, ตัดอิโมจิ, คัดเฉพาะภาษาไทย, คำนวณความคล้าย
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;
  const Text = {};

  // อักขระที่อนุญาตในข้อความภาษาไทยล้วน: อักษรไทย, เลขอารบิก, เว้นวรรค, ขึ้นบรรทัด, เครื่องหมายวรรคตอนพื้นฐาน
  const NON_THAI_RE = /[^฀-๿0-9 \n.,!?()"'\-:;%\/]/g;
  const THAI_ONLY_RE = /^[฀-๿0-9 \n.,!?()"'\-:;%\/]*$/;
  const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍️⃣]/gu;

  // แก้บั๊กเดิม: regex เดิมตัดสระและวรรณยุกต์ไทย (อยู่ในหมวด \p{M}) ทิ้ง ทำให้ "สวัสดี" กลายเป็น "สวสด"
  Text.normalize = function (s) {
    return String(s ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  Text.stripEmoji = function (s) {
    return String(s ?? '').replace(EMOJI_RE, '').replace(/[ \t]{2,}/g, ' ').trim();
  };

  // เก็บเฉพาะภาษาไทย ตัวอักษรอื่นเปลี่ยนเป็นช่องว่าง
  Text.keepThai = function (s) {
    return String(s ?? '')
      .replace(NON_THAI_RE, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ *\n */g, '\n')
      .trim();
  };

  Text.isThaiOnly = function (s) {
    return THAI_ONLY_RE.test(String(s ?? ''));
  };

  Text.bigrams = function (s) {
    const t = s.replace(/\s+/g, '');
    const set = new Set();
    if (t.length < 2) {
      if (t) set.add(t);
      return set;
    }
    for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
    return set;
  };

  Text.jaccard = function (a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter);
  };

  // โปรไฟล์ของข้อความที่ทำให้เป็นรูปมาตรฐานแล้ว (คำนวณครั้งเดียวแล้วเก็บไว้)
  Text.profile = function (normalized) {
    return {
      n: normalized,
      b: Text.bigrams(normalized),
      t: normalized.split(' ').filter(Boolean)
    };
  };

  // คะแนนความคล้ายแบบเดียวกับเวอร์ชันแรก: Jaccard ของ bigram + ทับซ้อนของคำ + โบนัสเมื่อข้อความอยู่ในกันและกัน
  Text.score = function (qp, kp) {
    if (!qp.n || !kp.n) return 0;
    let s = Text.jaccard(qp.b, kp.b);
    if (qp.t.length && kp.t.length) {
      const set = new Set(kp.t);
      let overlap = 0;
      for (const t of qp.t) if (set.has(t)) overlap++;
      s += 0.30 * (overlap / Math.max(qp.t.length, kp.t.length));
    }
    if (Math.min(qp.n.length, kp.n.length) >= 2 && (qp.n.includes(kp.n) || kp.n.includes(qp.n))) {
      s += 0.35;
    }
    return s;
  };

  NINO.Text = Text;
})(typeof globalThis !== 'undefined' ? globalThis : this);
