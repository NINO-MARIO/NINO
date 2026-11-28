#!/usr/bin/env node
/* ตรวจว่า URL ของผู้ให้บริการโมเดลที่ฝังในโค้ด มีแหล่งอ้างอิงหรือป้ายกำกับ (ดูบันทึก L4)
   กติกา: บรรทัดที่มีโฮสต์ของผู้ให้บริการในรายการ HOSTS ต้องมี "แหล่ง:" หรือ "ยังไม่ได้ตรวจ"
   ในบรรทัดเดียวกันหรือบรรทัดก่อนหน้า (ค่าจากความจำที่ยังไม่ได้เทียบเอกสารต้องติดป้าย)
   ตรวจไฟล์ .js ใต้ js/ mim/ tools/ ข้ามโฟลเดอร์ test/ tests/ (ข้อมูลตัวอย่างของเทสต์ ไม่ใช่ค่าที่แอปใช้จริง) และข้ามตัวเอง
   รัน: node tools/lessons/lint-provider-source.js  (ออก 1 ถ้าพบ) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const DIRS = ['js', 'mim', 'tools'];
const HOSTS = [
  'api.deepseek.com', 'api.anthropic.com', 'generativelanguage.googleapis.com',
  'dashscope-intl.aliyuncs.com', 'gateway.9arm.co', 'api.tokenme.limited',
  'ollama.com', 'text.pollinations.ai',
];
const TAG = /แหล่ง:|ยังไม่ได้ตรวจ/;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'test' || e.name === 'tests') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js') && p !== __filename) out.push(p);
  }
  return out;
}

const files = DIRS.flatMap(d => walk(path.join(ROOT, d), []));
let checked = 0, bad = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const hit = HOSTS.find(h => line.includes('//' + h));
    if (!hit) return;
    checked++;
    if (TAG.test(line) || (i > 0 && TAG.test(lines[i - 1]))) return;
    bad++;
    console.log(path.relative(ROOT, f) + ':' + (i + 1) + ': ' + hit + ' ไม่มีแหล่งหรือป้าย "ยังไม่ได้ตรวจ"');
  });
}
console.log('ตรวจ URL ผู้ให้บริการ ' + checked + ' จุด · ไม่มีป้าย ' + bad + ' จุด');
if (bad) { console.log('ไม่ผ่าน'); process.exit(1); }
console.log('ผ่าน');
