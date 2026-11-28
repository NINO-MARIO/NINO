// เทสต์สูตรประสิทธิภาพ (ไม่ต้องใช้เบราว์เซอร์): ค่ากลาง ความกระจาย และการตัดสิน
// รัน: node tools/test/perf-formula.test.js
const F = require('../perf-formula.js');
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
console.log('== สูตรประสิทธิภาพ');
ok(F.median([3, 1, 2]) === 2, 'ค่ากลางของจำนวนคี่');
ok(F.median([1, 2, 3, 4]) === 2.5, 'ค่ากลางของจำนวนคู่เป็นค่าเฉลี่ยสองค่ากลาง');
ok(F.median([]) !== F.median([]), 'ไม่มีข้อมูลได้ NaN');
ok(Math.abs(F.spread([100, 120, 110]) - (20 / 110)) < 1e-9, 'ความกระจาย = (มาก−น้อย)÷ค่ากลาง');
ok(F.verdict({ base: 0, cur: 500 }).status === 'nobase', 'ไม่มีค่าพื้นฐานไม่ตัดสิน');
ok(F.verdict({ base: 1000, cur: 1200, runs: [1000, 2000, 1200], floor: 300 }).status === 'noisy', 'รอบกระจายมากเกินไปถูกมองว่าไม่น่าเชื่อถือ');
ok(F.verdict({ base: 1000, cur: 1100, runs: [1090, 1100, 1110], floor: 300 }).status === 'ok', 'ช้าลงไม่ถึง 20% เป็น ok');
ok(F.verdict({ base: 1000, cur: 1300, runs: [1290, 1300, 1310], floor: 300 }).status === 'ok', 'ช้าลงพอดีขีดแต่ไม่เกินพื้น เป็น ok');
ok(F.verdict({ base: 1000, cur: 1400, runs: [1390, 1400, 1410], floor: 300 }).status === 'regress', 'ช้าลงเกิน 20% และเกินพื้น เป็น regress');
ok(F.verdict({ base: 10, cur: 14, runs: [14, 14, 14], floor: 300 }).status === 'ok', 'ตัวเลขเล็กที่ผลต่างต่ำกว่าพื้นไม่ถูกตัดสินว่า regress');
ok(F.verdict({ base: 1000, cur: 800, runs: [800, 800, 800], floor: 300 }).status === 'ok', 'เร็วขึ้นไม่ถูกตัดสินว่า regress');
console.log('  ผ่าน ' + pass + ' ไม่ผ่าน ' + fail);
if (fail) { console.log('perf-formula: FAILED'); process.exit(1); }
console.log('perf-formula: all ' + pass + ' passed');
