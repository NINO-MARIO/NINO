/* มิ้ม | 52-coin
 * สร้างคำใหม่แบบมีกฎ (ไม่ใช่การเดา): ประกอบคำจากคำรากที่มิ้มรู้จักแล้ว ด้วยหน่วยคำที่ใช้บ่อยในภาษาไทย
 *
 *   นัก- + ราก     -> ผู้ที่เชี่ยวชาญหรือทำเรื่องราก      (เช่น นัก + ดนตรี)
 *   ชาว- + ราก     -> คนที่เกี่ยวข้องกับราก
 *   เครื่อง- + ราก -> สิ่งที่ใช้สำหรับราก
 *   ราก + -ศาสตร์  -> วิชาที่ศึกษาเรื่องราก
 *
 * กฎการรับ: รากต้องเป็นคำที่มิ้มรู้จักแล้ว ต้องไม่เป็นคำหน้าที่ (อะไร คือ ฯลฯ) และคำที่ประกอบต้องยังไม่รู้จัก
 * ทุกคำที่เสนอเป็น "คำที่เสนอเอง" ความหมายมาจากกฎ ยังไม่ได้ยืนยัน จนกว่าผู้ใช้จะสอนความหมายจริง
 * เมื่อสอนแล้ว คำนั้นจะเข้าคลังคำและไม่ถูกเสนอซ้ำ
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;

  const PATTERNS = [
    { id: 'nak', kind: 'prefix', affix: 'นัก', gloss: r => 'ผู้ที่เชี่ยวชาญหรือทำเรื่อง' + r },
    { id: 'chao', kind: 'prefix', affix: 'ชาว', gloss: r => 'คนที่เกี่ยวข้องกับ' + r },
    { id: 'krueang', kind: 'prefix', affix: 'เครื่อง', gloss: r => 'สิ่งที่ใช้สำหรับ' + r },
    { id: 'sat', kind: 'suffix', affix: 'ศาสตร์', gloss: r => 'วิชาที่ศึกษาเรื่อง' + r }
  ];
  const AFFIXES = new Set(PATTERNS.map(p => p.affix));
  // คำหน้าที่และคำทั่วไปที่ห้ามเป็นราก (ไม่งั้นได้คำอย่าง "นักอะไร")
  const STOP = new Set(('ฉัน เธอ นาย เรา คุณ มัน เขา ผม หนู ท่าน ดิฉัน พวกเรา พวกเขา ' +
    'อะไร ทำไม ยังไง อย่างไร ที่ไหน เมื่อไร เมื่อไหร่ ใคร เท่าไร เท่าไหร่ ไหน ' +
    'คือ เป็น มี ได้ ทำ ไป มา อยู่ ให้ และ ของ ใน ที่ ก็ จะ ไม่ กับ แต่ หรือ ว่า นี้ นั้น บ้าง ' +
    'ไม่รู้ ค่ะ ครับ นะ จ้ะ').split(/\s+/));

  function isRoot(lex, w) {
    if (!w || w.length < 2 || !/^[฀-๿]+$/.test(w)) return false;
    if (STOP.has(w) || AFFIXES.has(w)) return false;
    return lex.has(w);
  }

  // เสนอคำใหม่จากราก: คืนรายการที่ยังไม่รู้จัก เรียงตามรูปแบบ
  // isTaken (ไม่บังคับ): ตรวจว่าคำนั้นมีในความรู้ที่สอนไว้แล้วหรือไม่ (สอนคำเดี่ยวจะไม่เข้าคลังคำเต็มคำ)
  function propose(lex, rootWord, isTaken) {
    const r = String(rootWord || '').trim();
    if (!lex || !isRoot(lex, r)) return [];
    const out = [];
    const seen = new Set();
    for (const p of PATTERNS) {
      const word = p.kind === 'prefix' ? p.affix + r : r + p.affix;
      if (seen.has(word) || lex.has(word) || (isTaken && isTaken(word))) continue;
      seen.add(word);
      out.push({
        word,
        root: r,
        affix: p.affix,
        pattern: p.id,
        gloss: p.gloss(r),
        status: 'proposed'
      });
    }
    return out;
  }

  // ข้อความตอบเมื่อผู้ใช้ขอคำใหม่ (ไม่มีการอ้างความหมายเกินกว่าที่กฎให้)
  function describe(list, rootWord) {
    if (!list.length) return 'ยังไม่มีคำที่ประกอบจาก "' + rootWord + '" ได้ตามกฎที่มิ้มมีค่ะ';
    const lines = list.map(x => '• ' + x.word + ' = ' + x.gloss);
    return 'คำที่มิ้มเสนอจาก "' + rootWord + '" (ความหมายมาจากกฎ ยังไม่ได้ยืนยัน):\n' + lines.join('\n') +
      '\nถ้าความหมายใช่ สอนได้เลย เช่น สอน ' + list[0].word + ' | ความหมายที่ถูกต้อง';
  }

  NINO.Coin = { PATTERNS, STOP, isRoot, propose, describe };
})(typeof globalThis !== 'undefined' ? globalThis : this);
