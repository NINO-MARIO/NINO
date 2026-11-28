#!/usr/bin/env node
/* ล็อกค่าที่คาดหวังในเทสต์ (บรรทัดที่มี ok( ) ไม่ให้เปลี่ยนเงียบ ๆ (ดูบันทึก L1)
   รัน:
     node tools/lessons/expect-lock.js init                       สร้างล็อกให้ไฟล์ที่ยังไม่มี
     node tools/lessons/expect-lock.js check                      ตรวจ (ออก 1 ถ้ามีบรรทัดคาดหวังเปลี่ยนโดยไม่มีเหตุผล)
     node tools/lessons/expect-lock.js accept FILE --reason "..."  รับการเปลี่ยนแปลงพร้อมเหตุผลที่อ้างสเปกหรือนิยามได้
   เหตุผลต้องยาวอย่างน้อย 15 ตัวอักษร และจะถูกเก็บเป็นประวัติในไฟล์ล็อก */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const LOCK = path.join(__dirname, 'expect.lock.json');
const FILES = ['tools/test/chat-memory.test.js', 'tools/test/llm-roster.test.js', 'tools/test/cutout-core.test.js'];

function expectLines(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return src.split('\n').filter(l => /\bok\(/.test(l)).join('\n');
}
function digest(rel) { return crypto.createHash('sha256').update(expectLines(rel)).digest('hex').slice(0, 16); }
function readLock() { try { return JSON.parse(fs.readFileSync(LOCK, 'utf8')); } catch (e) { return {}; } }
function writeLock(l) { fs.writeFileSync(LOCK, JSON.stringify(l, null, 2) + '\n', 'utf8'); }

const cmd = process.argv[2] || 'check';
const lock = readLock();
if (cmd === 'init') {
  let n = 0;
  for (const f of FILES) if (!lock[f]) { lock[f] = { sha: digest(f), reasons: [{ at: new Date().toISOString(), reason: 'สร้างล็อกครั้งแรก' }] }; n++; }
  writeLock(lock); console.log('ล็อกใหม่ ' + n + ' ไฟล์'); process.exit(0);
}
if (cmd === 'accept') {
  const file = process.argv[3];
  const i = process.argv.indexOf('--reason');
  const reason = i > 0 ? String(process.argv[i + 1] || '').trim() : '';
  if (!FILES.includes(file)) { console.log('ไม่ได้อยู่ในรายการที่ล็อก: ' + file); process.exit(2); }
  if (reason.length < 15) { console.log('เหตุผลต้องยาวอย่างน้อย 15 ตัวอักษร'); process.exit(2); }
  lock[file] = lock[file] || { sha: '', reasons: [] };
  lock[file].sha = digest(file);
  lock[file].reasons.push({ at: new Date().toISOString(), reason: reason });
  writeLock(lock); console.log('รับการเปลี่ยนแปลงของ ' + file + ' แล้ว'); process.exit(0);
}
// check
let bad = 0;
for (const f of FILES) {
  if (!lock[f]) { bad++; console.log(f + ': ยังไม่ได้ล็อก (รัน init)'); continue; }
  const now = digest(f);
  if (now !== lock[f].sha) {
    bad++;
    console.log(f + ': บรรทัดที่คาดหวังเปลี่ยนไป ถ้าตั้งใจ ให้รัน accept พร้อมเหตุผลที่อ้างสเปกหรือนิยาม');
  }
}
if (bad) { console.log('ไม่ผ่าน ' + bad + ' ไฟล์'); process.exit(1); }
console.log('ค่าที่คาดหวังตรงกับที่ล็อกไว้ ' + FILES.length + ' ไฟล์');
