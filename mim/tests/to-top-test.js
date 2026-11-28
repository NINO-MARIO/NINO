// มิ้ม | ทดสอบปุ่มเลื่อนกลับไปต้นข้อความของมิ้มในเบราว์เซอร์ (ต้องใช้ playwright เหมือนชุดทดสอบอื่นของ NINO)
// ตรวจ: ทุกฟองคำตอบของมิ้มมีปุ่มหนึ่งปุ่มที่มุมขวาล่าง, ฟองผู้ใช้ไม่มีปุ่ม, กดแล้วขอบบนของฟองนั้นขึ้นมาอยู่บนสุดของกล่อง, ไม่มีข้อผิดพลาดของหน้า
const H = require('../../tools/test/harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }

(async () => {
  console.log('== มิ้ม ปุ่มเลื่อนกลับไปต้นข้อความ');
  const h = await H.start();
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1500);
  await P.click('#mode-mim');
  await sleep(300);

  // สร้างฟองคำตอบจำนวนมากให้รายการยาวเกินกล่องจริง
  const qs = ['สวัสดี', 'ขอบคุณ', 'ทดสอบหนึ่ง', 'ทดสอบสอง', 'ทดสอบสาม', 'ทดสอบสี่', 'ทดสอบห้า', 'ทดสอบหก', 'ทดสอบเจ็ด', 'ทดสอบแปด'];
  for (const q of qs) {
    await P.fill('#mim-input', q);
    await P.click('#mim-send');
    await sleep(120);
  }
  await sleep(300);

  const counts = await P.evaluate(() => ({
    bot: document.querySelectorAll('#mim-msgs .mim-bub-nino').length,
    btn: document.querySelectorAll('#mim-msgs .mim-to-top').length,
    userBtn: document.querySelectorAll('#mim-msgs .mim-bub-user .mim-to-top').length,
    overflow: document.getElementById('mim-msgs').scrollHeight > document.getElementById('mim-msgs').clientHeight
  }));
  ok(counts.bot >= 8, 'มีฟองคำตอบของมิ้มหลายอัน: ' + counts.bot);
  ok(counts.btn === counts.bot, 'ทุกฟองคำตอบมีปุ่มหนึ่งปุ่ม: ' + counts.btn + ' ปุ่ม / ' + counts.bot + ' ฟอง');
  ok(counts.userBtn === 0, 'ฟองของผู้ใช้ไม่มีปุ่ม');
  ok(counts.overflow, 'รายการยาวเกินกล่อง จึงทดสอบการเลื่อนได้');

  // ปุ่มต้องอยู่มุมขวาล่างของฟองนั้น
  const corner = await P.evaluate(() => {
    const b = document.querySelector('#mim-msgs .mim-bub-nino');
    const t = b.querySelector('.mim-to-top').getBoundingClientRect();
    const r = b.getBoundingClientRect();
    return { dx: Math.abs(r.right - t.right), dy: Math.abs(r.bottom - t.bottom) };
  });
  ok(corner.dx <= 20 && corner.dy <= 20, 'ปุ่มอยู่มุมขวาล่างของฟอง: ' + JSON.stringify(corner));

  // เลื่อนลงสุดแล้วกดปุ่มของฟองแรก (ไกลที่สุด) ขอบบนของฟองต้องขึ้นมาอยู่ใกล้บนสุดของกล่อง
  await P.evaluate(() => { const m = document.getElementById('mim-msgs'); m.scrollTop = m.scrollHeight; });
  await sleep(200);
  await P.evaluate(() => document.querySelector('#mim-msgs .mim-bub-nino').parentElement.querySelector('.mim-to-top').click());
  await sleep(1000);
  const gap = await P.evaluate(() => {
    const m = document.getElementById('mim-msgs');
    const b = m.querySelector('.mim-bub-nino').parentElement;
    return b.getBoundingClientRect().top - m.getBoundingClientRect().top;
  });
  ok(gap >= -4 && gap <= 40, 'กดแล้วขอบบนของฟองขึ้นมาอยู่บนสุดของกล่อง ห่าง ' + Math.round(gap) + 'px');

  // ปุ่มกดได้ซ้ำโดยไม่ทำให้เกิดข้อผิดพลาด
  await P.evaluate(() => document.querySelectorAll('#mim-msgs .mim-to-top')[3].click());
  await sleep(400);
  ok(true, 'กดปุ่มกลางรายการได้');

  const errors = (h.errors || []).length;
  ok(errors === 0, 'ไม่มีข้อผิดพลาดของหน้า: ' + errors);
  await h.close();
  console.log('to-top: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL: ' + e.message); process.exit(1); });
