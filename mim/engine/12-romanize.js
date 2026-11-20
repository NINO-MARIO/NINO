/* มิ้ม | 12-romanize
 * ถอดเสียงภาษาไทยเป็นอักษรโรมัน (ประมาณ RTGS) และคีย์เสียงสำหรับเทียบคำ
 *
 * หลักการสำคัญ:
 *   - เข้าใจสระไทยตามรูปที่เขียน: ไ/ใ, แ, โ, เ-า, เ-ีย, เ-ือ, เ-อ, เ-ะ, ะ/ั/า, ำ, ิ/ี, ึ/ื, ุ/ู
 *   - วรรณยุกต์ (่ ้ ๊ ๋) ใส่เป็นเลข 1 ถึง 4 ในผลลัพธ์ เพราะคำพ้องเสียงที่ต่างวรรณยุกต์เป็นคนละคำ
 *     (ข้าว กับ ข่าว) ถ้าตัดวรรณยุกต์ทิ้งจะจับคู่ผิด
 *   - ไม่เติมสระโดยนัย (inherent vowel) ผลลัพธ์จึงไม่ใช่ RTGS ฉบับเต็ม ใช้เป็นคีย์เทียบเสียงเท่านั้น
 *   - คีย์เสียง (key) ใช้เทียบ "การเขียนต่างกันแต่เสียงเดียวกัน" เช่น ใทย กับ ไทย หรือ ทํางาน กับ ทำงาน
 *     ไม่ใช่การเดาคำที่ฟังคล้ายกัน
 *
 * ขอบเขตที่ยังไม่รองรับ: คำยืมที่ออกเสียงผิดรูป, การควบกล้ำบางแบบ, และการตัดพยางค์ที่ต้องรู้ความหมาย
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;

  const ONSET = {
    'ก': 'k', 'ข': 'kh', 'ฃ': 'kh', 'ค': 'kh', 'ฅ': 'kh', 'ฆ': 'kh', 'ง': 'ng',
    'จ': 'ch', 'ฉ': 'ch', 'ช': 'ch', 'ซ': 's', 'ฌ': 'ch', 'ญ': 'y',
    'ฎ': 'd', 'ฏ': 't', 'ฐ': 'th', 'ฑ': 't', 'ฒ': 'th', 'ณ': 'n',
    'ด': 'd', 'ต': 't', 'ถ': 'th', 'ท': 'th', 'ธ': 'th', 'น': 'n',
    'บ': 'b', 'ป': 'p', 'ผ': 'ph', 'ฝ': 'f', 'พ': 'ph', 'ฟ': 'f', 'ภ': 'ph', 'ม': 'm',
    'ย': 'y', 'ร': 'r', 'ล': 'l', 'ว': 'w', 'ศ': 's', 'ษ': 's', 'ส': 's', 'ห': 'h',
    'ฬ': 'l', 'อ': '', 'ฮ': 'h'
  };

  // เสียงท้ายพยางค์ (ตัวสะกด)
  const CODA = {
    'ก': 'k', 'ข': 'k', 'ค': 'k', 'ฆ': 'k',
    'จ': 't', 'ช': 't', 'ซ': 't', 'ฌ': 't', 'ฎ': 't', 'ฏ': 't', 'ฐ': 't', 'ฑ': 't', 'ฒ': 't',
    'ด': 't', 'ต': 't', 'ถ': 't', 'ท': 't', 'ธ': 't', 'ศ': 't', 'ษ': 't', 'ส': 't',
    'บ': 'p', 'ป': 'p', 'พ': 'p', 'ฟ': 'p', 'ภ': 'p', 'ฝ': 'p',
    'ง': 'ng',
    'น': 'n', 'ญ': 'n', 'ณ': 'n', 'ร': 'n', 'ล': 'n', 'ฬ': 'n',
    'ม': 'm',
    'ย': 'i',
    'ว': 'o'
  };

  // สระที่ตามหลังพยัญชนะ
  const VOWEL = {
    'ะ': 'a', 'ั': 'a', 'า': 'a', 'ำ': 'am',
    'ิ': 'i', 'ี': 'i', 'ึ': 'ue', 'ื': 'ue', 'ุ': 'u', 'ู': 'u'
  };
  const LEAD = new Set(['เ', 'แ', 'โ', 'ไ', 'ใ']);
  const TONE = { '่': '1', '้': '2', '๊': '3', '๋': '4' };
  const CLUSTER_SECOND = new Set(['ร', 'ล', 'ว']);

  function isCons(c) {
    return c >= 'ก' && c <= 'ฮ';
  }

  // รูปที่เขียนต่างกันแต่เสียงเดียวกัน ทำให้เป็นรูปเดียวก่อนถอดเสียง
  function normalizeSpelling(s) {
    return String(s ?? '')
      .replace(/ํา/g, 'ำ') // ํ + า เขียนแยกกัน = ำ
      .replace(/ใ/g, 'ไ')            // ใ กับ ไ ออกเสียงเหมือนกัน
      .replace(/ๅ/g, 'ะ');
  }

  // ถอดเสียงทั้งข้อความ คงช่องวรรค อักษรละติน และตัวเลขไว้ตามเดิม
  function toRoman(text) {
    const s = normalizeSpelling(text).toLowerCase();
    const n = s.length;
    const at = k => (k < n ? s[k] : '');
    let out = '';
    let i = 0;

    const tones = k => {
      let t = '';
      while (TONE[at(k)]) { t += TONE[at(k)]; k++; }
      return { t, k };
    };

    while (i < n) {
      const c = s[i];

      // สระนำหน้า: เขียนก่อนพยัญชนะ แต่ออกเสียงหลังพยัญชนะ
      if (LEAD.has(c) && isCons(at(i + 1))) {
        out += ONSET[at(i + 1)] || '';
        let k = i + 2;
        const tn = tones(k);
        out += tn.t;
        k = tn.k;
        let v;
        if (c === 'ไ') v = 'ai';
        else if (c === 'แ') v = 'ae';
        else if (c === 'โ') v = 'o';
        else if (at(k) === 'า') { v = 'ao'; k++; }
        else if (at(k) === 'ี' && at(k + 1) === 'ย') { v = 'ia'; k += 2; }
        else if (at(k) === 'ื' && at(k + 1) === 'อ') { v = 'uea'; k += 2; }
        else if (at(k) === 'อ') { v = 'oe'; k++; }
        else v = 'e';
        if ((v === 'e' || v === 'ae' || v === 'o') && at(k) === 'ะ') k++;
        out += v;
        i = k;
        continue;
      }

      if (isCons(c)) {
        const tn = tones(i + 1);
        const v = VOWEL[at(tn.k)];
        if (v) {
          // พยัญชนะที่มีสระ: พยางค์เปิด เช่น ข้า, สวั
          out += (ONSET[c] || '') + tn.t + v;
          i = tn.k + 1;
          continue;
        }
        // กลุ่มพยัญชนะควบ เช่น กร, ปล, ตว แล้วตามด้วยสระ
        if (CLUSTER_SECOND.has(at(i + 1)) && (VOWEL[at(i + 2)] || LEAD.has(at(i + 2)) || TONE[at(i + 2)])) {
          out += (ONSET[c] || '') + (ONSET[at(i + 1)] || '');
          i += 2;
          continue;
        }
        // ตัวสะกด: ย หลังสระ ไม่เติมซ้ำถ้าสระลงท้ายด้วย i แล้ว (ไทย = thai ไม่ใช่ thaii)
        let coda = CODA[c] || '';
        if (c === 'ย' && out.endsWith('i')) coda = '';
        out += coda;
        i++;
        continue;
      }

      if (VOWEL[c]) { out += VOWEL[c]; i++; continue; }
      if (TONE[c]) { out += TONE[c]; i++; continue; }
      if (s[i] === ' ' || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) { out += c; i++; continue; }
      i++; // เครื่องหมายอื่นของไทย เช่น ็ และ ์ ไม่มีเสียงในผลลัพธ์นี้
    }
    return out;
  }

  // คีย์เสียง: ถอดเสียงแล้วตัดช่องวรรคทิ้ง ใช้เทียบทั้งประโยค
  function key(text) {
    return toRoman(text).replace(/\s+/g, '');
  }

  NINO.Romanize = { toRoman, key, normalizeSpelling };
})(typeof globalThis !== 'undefined' ? globalThis : this);
