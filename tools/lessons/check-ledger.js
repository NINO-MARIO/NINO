#!/usr/bin/env node
/* ตรวจบันทึกความพลาด (tools/lessons/ledger.json)
   - ทุกรายการต้องมีครบ: id อาการ สาเหตุ กฎ ประตู สถานะ
   - สถานะ closed ต้องมีประตูที่เป็นไฟล์จริงในโปรเจกต์ (ความพลาดที่ไม่มีประตูจับ ยังไม่ปิด)
   - สถานะ open ไม่ทำให้ล้ม แต่แสดงจำนวนให้เห็นทุกครั้ง
   รัน: node tools/lessons/check-ledger.js  (ออก 1 ถ้าผิดกติกา) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const LEDGER = path.join(__dirname, 'ledger.json');
const FIELDS = ['id', 'อาการ', 'สาเหตุ', 'กฎ', 'ประตู', 'สถานะ'];
let bad = 0;
const data = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
if (!Array.isArray(data) || !data.length) { console.log('ไม่มีรายการในบันทึก'); process.exit(1); }
const ids = new Set();
for (const e of data) {
  for (const f of FIELDS) if (!(f in e)) { bad++; console.log('ขาดช่อง ' + f + ' ใน ' + (e.id || '?')); }
  if (ids.has(e.id)) { bad++; console.log('รหัสซ้ำ ' + e.id); }
  ids.add(e.id);
  if (e.สถานะ !== 'closed' && e.สถานะ !== 'open') { bad++; console.log(e.id + ': สถานะต้องเป็น closed หรือ open'); }
  if (e.สถานะ === 'closed') {
    const g = e.ประตู || '';
    if (!g || !fs.existsSync(path.join(ROOT, g))) { bad++; console.log(e.id + ': ปิดแล้วแต่ประตู "' + g + '" ไม่มีอยู่จริง'); }
  }
}
const open = data.filter(e => e.สถานะ === 'open');
console.log('บันทึกความพลาด: ' + data.length + ' รายการ · ปิดแล้ว ' + (data.length - open.length) + ' · ยังเปิดอยู่ ' + open.length + (open.length ? ' (' + open.map(e => e.id).join(', ') + ')' : ''));
if (bad) { console.log('ไม่ผ่าน ' + bad + ' รายการ'); process.exit(1); }
console.log('ผ่าน');
