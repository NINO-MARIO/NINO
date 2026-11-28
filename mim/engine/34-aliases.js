/* มิ้ม | 34-aliases: แปลงคำพ้องที่ตรวจแล้วเป็นคำมาตรฐานก่อนค้นหา
 * ใช้เฉพาะขั้นค้นหาและการตัดสินว่ารู้จักคำหรือไม่ ไม่เปลี่ยนข้อความที่แสดงให้ผู้ใช้เห็น
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;
  let rules = null;

  function load() {
    if (rules) return rules;
    const src = root.NINO_ALIASES && Array.isArray(root.NINO_ALIASES.pairs) ? root.NINO_ALIASES.pairs : [];
    rules = src
      .filter(p => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string' && p[0].length >= 2)
      .sort((a, b) => b[0].length - a[0].length); // คำยาวก่อน กันการแทนที่คำสั้นทับคำยาว
    return rules;
  }

  NINO.Aliases = {
    apply(text) {
      let t = String(text || '');
      for (const [from, to] of load()) {
        if (t.indexOf(from) !== -1) t = t.split(from).join(to);
      }
      return t;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
