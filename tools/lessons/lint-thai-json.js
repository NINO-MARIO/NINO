#!/usr/bin/env node
/* ตรวจค่าและชื่อคีย์ในไฟล์ JSON ทั้งโปรเจกต์ ไม่ให้มีอักขระแปลกปลอม (ดูบันทึก L3)
   กติกา: ค่าภาษาไทยต้องมีเฉพาะอักขระไทย ละติน ตัวเลข และสัญลักษณ์พื้นฐาน
   ที่อนุญาต: ไทย (U+0E00-0E7F), ASCII ที่พิมพ์ได้และช่องว่าง, สัญลักษณ์ที่โปรเจกต์ใช้จริง (· และลูกศร),
   เครื่องหมายวรรคตอนทั่วไป (U+2010-2027, U+2030-205E)
   อักขระอื่น เช่น จีน เกาหลี ซีริลลิก หรืออักขระไม่แสดงผล (U+200B-200F, U+FEFF) จะถูกจับ
   ข้าม node_modules และ .git
   รัน: node tools/lessons/lint-thai-json.js  (ออก 1 ถ้าพบ) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const SKIP = new Set(['node_modules', '.git']);
const ALLOWED = /^[฀-๿\u0009\u000A\u000D -~ ·‐-‧‰-⁞←-↙]$/u;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

// คืนรายการ { ch, at, text } ของอักขระที่ไม่อนุญาตในทุกค่าและชื่อคีย์ของ JSON
function badChars(value, found) {
  const strings = [];
  (function collect(v) {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { strings.push(k); collect(x); }
  })(value);
  for (const s of strings) {
    for (const ch of s) {
      if (!ALLOWED.test(ch)) {
        const at = s.indexOf(ch);
        found.push({ ch, at: s.slice(Math.max(0, at - 12), at + 12) });
      }
    }
  }
  return found;
}

const files = walk(ROOT, []);
let bad = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f);
  let data;
  try { data = JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (err) { bad++; console.log(rel + ': อ่าน JSON ไม่ได้ (' + err.message + ')'); continue; }
  const found = badChars(data, []);
  if (found.length) {
    bad += found.length;
    for (const x of found.slice(0, 5))
      console.log(rel + ': อักขระ U+' + x.ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + ' ใน "' + x.at + '"');
  }
}
console.log('ตรวจ JSON ' + files.length + ' ไฟล์ · อักขระแปลกปลอม ' + bad + ' ตำแหน่ง');
if (bad) { console.log('ไม่ผ่าน'); process.exit(1); }
console.log('ผ่าน');
