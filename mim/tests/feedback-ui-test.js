// มิ้ม | ทดสอบปุ่มตอบถูก/ไม่ถูกในเบราว์เซอร์จริง (ต้องใช้ playwright เหมือนชุดทดสอบอื่นของ NINO)
// ตรวจ: สอนคำถามแล้วถาม คำตอบจากความรู้มีปุ่มตอบถูก/ไม่ถูก, คำตอบจากการสอนของคำถามที่ตอบไม่ได้ไม่มีปุ่ม,
// กดแล้วปุ่มทั้งคู่ถูกล็อกและเปลี่ยนเป็นบันทึกแล้ว, ไม่มีข้อผิดพลาดของหน้า
// รัน: node mim/tests/feedback-ui-test.js
const H = require('../../tools/test/harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }

(async () => {
  console.log('== มิ้ม ปุ่มตอบถูก/ไม่ถูกในหน้าจริง');
  const h = await H.start();
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1500);
  await P.click('#mode-mim');
  await sleep(300);
  // เปิดใช้งานมิ้มก่อน (ค่าเริ่มต้นปิดอยู่ ตามที่ผู้ใช้เห็น)
  await P.evaluate(() => { const b = document.getElementById('mim-enable'); if (b && !b.hidden) b.click(); });
  await sleep(300);

  const Q = 'ทดสอบปุ่มผลตอบรับหน้าจอ';
  const send = async (t) => { await P.fill('#mim-input', t); await P.click('#mim-send'); await sleep(250); };
  await send('สอน ' + Q + ' | คำตอบทดสอบปุ่มผลตอบรับ');
  await send(Q);
  await sleep(300);

  // ฟองล่าสุดของมิ้มคือคำตอบจากความรู้ ต้องมีปุ่มตอบถูกและไม่ถูกคู่กัน
  const row = await P.evaluate(() => {
    const bubs = Array.from(document.querySelectorAll('#mim-msgs .mim-bub-nino'));
    const last = bubs[bubs.length - 1];
    if (!last) return null;
    const labels = Array.from(last.querySelectorAll('.mim-bub-acts button')).map(b => b.textContent.trim());
    return labels;
  });
  ok(row && row.indexOf('ตอบถูก') >= 0 && row.indexOf('ไม่ถูก') >= 0, 'answer bubble has ตอบถูก and ไม่ถูก: ' + JSON.stringify(row));

  // กดตอบถูก: ปุ่มทั้งคู่ถูกล็อก ปุ่มที่กดเปลี่ยนเป็นบันทึกแล้ว
  await P.evaluate(() => {
    const bubs = Array.from(document.querySelectorAll('#mim-msgs .mim-bub-nino'));
    const last = bubs[bubs.length - 1];
    Array.from(last.querySelectorAll('.mim-bub-acts button')).find(b => b.textContent.trim() === 'ตอบถูก').click();
  });
  await sleep(200);
  const after = await P.evaluate(() => {
    const bubs = Array.from(document.querySelectorAll('#mim-msgs .mim-bub-nino'));
    const last = bubs[bubs.length - 1];
    return Array.from(last.querySelectorAll('.mim-bub-acts button')).filter(b => ['ตอบถูก', 'ไม่ถูก', 'บันทึกแล้ว'].indexOf(b.textContent.trim()) >= 0).map(b => ({ t: b.textContent.trim(), d: b.disabled }));
  });
  ok(after.length === 2 && after.every(b => b.d) && after[0].t === 'บันทึกแล้ว' && after[1].t === 'ไม่ถูก', 'after click: both locked, chosen shows บันทึกแล้ว: ' + JSON.stringify(after));

  // ผลตอบรับเข้าไปในที่เก็บของหน้า: มีค่า fb ของคำถามนั้นอยู่ใน localStorage
  const saved = await P.evaluate((q) => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const v = localStorage.getItem(localStorage.key(i)) || '';
        if (v.indexOf(q) >= 0 && v.indexOf('"fb"') >= 0) return true;
      }
    } catch (e) { return false; }
    return false;
  }, Q);
  ok(saved === true, 'feedback saved to the page store');

  // คำถามที่ตอบไม่ได้: ไม่มีปุ่มตอบถูก/ไม่ถูก
  await send('ถามเรื่องที่ไม่มีอยู่จริงแน่นอนxyz');
  await sleep(300);
  const none = await P.evaluate(() => {
    const bubs = Array.from(document.querySelectorAll('#mim-msgs .mim-bub-nino'));
    const last = bubs[bubs.length - 1];
    return Array.from(last.querySelectorAll('.mim-bub-acts button')).map(b => b.textContent.trim()).filter(t => t === 'ตอบถูก' || t === 'ไม่ถูก');
  });
  ok(none.length === 0, 'unanswered reply has no feedback buttons: ' + JSON.stringify(none));

  ok(h.errors.length === 0, 'no page errors: ' + h.errors.join(' | '));
  await h.close();
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL: crashed: ' + e.message); process.exit(1); });
