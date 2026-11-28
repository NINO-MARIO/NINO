#!/usr/bin/env node
/* ตรวจเทสต์เบราว์เซอร์ไม่ให้ page.evaluate ที่ไม่รับอาร์กิวเมนต์อ้างตัวแปรของ Node (ดูบันทึก L5)
   วิธี: หา .evaluate( ที่ฟังก์ชันแรกไม่มีพารามิเตอร์ ตัดเนื้อในวงเล็บของ evaluate ทั้งชุด
   แล้วดูว่ามีชื่อตัวแปรระดับบนของไฟล์ (const/let/var) โผล่เป็นตัวอ้างอิงหรือไม่
   (ไม่นับ .ชื่อ และ ชื่อ: ในออบเจกต์ และไม่นับชื่อที่ประกาศซ้ำในฟังก์ชันนั้นเอง)
   รัน: node tools/lessons/lint-evaluate.js  (ออก 1 ถ้าพบ) */
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.resolve(__dirname, '..', 'test');
const BUILTIN = new Set(['window', 'document', 'localStorage', 'sessionStorage', 'session', 'JSON', 'Math', 'Date', 'Promise',
  'console', 'setTimeout', 'Object', 'Array', 'Number', 'String', 'Set', 'Map', 'Error', 'undefined', 'null', 'true', 'false',
  'new', 'return', 'await', 'async', 'const', 'let', 'var', 'if', 'else', 'for', 'of', 'in', 'function', 'typeof']);
let bad = 0, files = 0;

// หาตำแหน่งวงเล็บปิดที่คู่กับวงเล็บเปิดที่ตำแหน่ง open (ข้ามสตริงแบบหยาบ ๆ)
function closeOf(src, open) {
  let depth = 0, q = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  if (!/\.evaluate\(/.test(src)) continue;
  files++;
  const top = new Set();
  for (const m of src.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) top.add(m[1]);
  for (const m of src.matchAll(/^(?:const|let|var)\s+\{([^}]+)\}/gm)) m[1].split(',').forEach(x => top.add(x.trim().split(/[:=\s]/).pop()));
  for (const m of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) top.add(m[1]);
  for (const name of [...top]) if (BUILTIN.has(name) || name.length < 2) top.delete(name);
  const re = /\.evaluate\(\s*(async\s*)?\(\s*\)\s*=>/g;
  let m;
  while ((m = re.exec(src))) {
    const open = src.indexOf('(', m.index + 9); // วงเล็บของ .evaluate(
    const close = closeOf(src, open);
    if (close < 0) continue;
    let span = src.slice(open + 1, close);
    span = span.replace(/\.[A-Za-z_$][\w$]*/g, ' ');        // ตัด .ชื่อ (ไม่ใช่ตัวแปร)
    span = span.replace(/([A-Za-z_$][\w$]*)\s*:(?!:)/g, ' '); // ตัด ชื่อ: ในออบเจกต์
    span = span.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, ' ');  // ตัดสตริง
    const hits = [...top].filter(n => new RegExp('(^|[^\\w$])' + n.replace(/\$/g, '\\$') + '(?![\\w$])').test(span));
    if (hits.length) {
      bad++;
      const line = src.slice(0, m.index).split('\n').length;
      console.log(f + ':' + line + ': evaluate ไม่รับอาร์กิวเมนต์ แต่อ้าง ' + hits.join(', ') + ' จาก Node (ส่งเป็นอาร์กิวเมนต์แทน)');
    }
  }
}
console.log('ตรวจ ' + files + ' ไฟล์ · พบ ' + bad + ' จุด');
process.exit(bad ? 1 : 0);
