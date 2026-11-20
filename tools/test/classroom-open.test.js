// ห้องเรียนรับข้อความที่พิมพ์แล้วทำงานเบื้องหลัง (เบราว์เซอร์)
// กดปุ่มห้องเรียน: ส่งหัวข้อเข้าห้องเรียนทันที (เรียก ninoResearch.run) โดยหน้าห้องเรียนไม่เปิดทับแชท
// หน้าแชทไม่สลับ ข้อความที่พิมพ์ไม่ถูกล้าง ชิปมุมจอใช้เปิดดูหน้าห้องเรียนได้
// รัน: node tools/test/classroom-open.test.js
const H = require('./harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }

(async () => {
  console.log('== ห้องเรียนเบื้องหลัง: โค้ด โรลเพลย์ มิ้ม');
  const h = await H.start();
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1500);

  // บันทึกการเรียกการวิจัยโดยไม่เรียกเครือข่ายจริง
  await P.evaluate(() => {
    window.__runs = 0;
    window.__topics = [];
    const real = window.ninoResearch;
    window.ninoResearch = Object.assign({}, real || {}, {
      run: async (topics) => { window.__runs++; window.__topics = topics.slice(); return { srcs: [], errs: [] }; }
    });
  });

  const overlayDisplay = () => P.evaluate(() => {
    const o = document.getElementById('nclass');
    return o ? getComputedStyle(o).display : 'absent';
  });
  const closeClass = async () => {
    if (await P.evaluate(() => !!document.getElementById('nclass'))) {
      await P.evaluate(() => document.getElementById('nc-x').click());
      await sleep(200);
    }
  };

  // 1) โหมดโค้ด
  const CODE_Q = 'ทุเรียนมีกี่สายพันธุ์';
  await P.fill('#prompt-input', CODE_Q);
  ok(await P.evaluate(() => !!document.getElementById('btn-web')), 'เว็บเดิมยังอยู่ในแชทหลัก');
  await P.click('#btn-class-open');
  await sleep(600);
  ok(await P.evaluate(() => window.__runs) === 1, 'โค้ด: ส่งหัวข้อเข้าห้องเรียนทันที');
  ok(await P.evaluate(() => (window.__topics || []).indexOf('ทุเรียนมีกี่สายพันธุ์') >= 0), 'โค้ด: หัวข้อตรงกับข้อความที่พิมพ์');
  ok(await overlayDisplay() === 'none', 'โค้ด: หน้าห้องเรียนไม่เปิดทับแชท, got ' + (await overlayDisplay()));
  ok(await P.evaluate(() => document.getElementById('prompt-input').value) === CODE_Q, 'โค้ด: ข้อความในแชทไม่ถูกล้าง');
  ok(await P.evaluate(() => !!document.getElementById('nc-chip')), 'โค้ด: มีชิปมุมจอให้เปิดดู');
  await P.evaluate(() => document.getElementById('nc-chip').click());
  await sleep(200);
  ok(await overlayDisplay() !== 'none', 'โค้ด: แตะชิปแล้วเปิดหน้าห้องเรียนได้');
  ok(await P.evaluate(() => !document.getElementById('nc-chip')), 'โค้ด: ชิปหายเมื่อเปิดหน้าแล้ว');
  await closeClass();
  ok(await P.evaluate(() => !document.getElementById('nclass')), 'โค้ด: ปิดห้องเรียนได้');

  // 2) โหมดโรลเพลย์: ทำงานเบื้องหลังเหมือนกัน
  await P.click('#mode-roleplay');
  await sleep(500);
  await P.fill('#prompt-input', 'หัวข้อจากโรลเพลย์');
  await P.click('#btn-class-open');
  await sleep(600);
  ok(await P.evaluate(() => window.__runs) === 2, 'โรลเพลย์: ส่งหัวข้อเข้าห้องเรียนทันที');
  ok(await overlayDisplay() === 'none', 'โรลเพลย์: หน้าห้องเรียนไม่เปิดทับแชท');
  await closeClass();
  await P.click('#mode-code');
  await sleep(400);

  // 3) มิ้ม
  await P.click('#mode-mim');
  await sleep(400);
  if (await P.evaluate(() => !!document.getElementById('mim-enable'))) {
    await P.click('#mim-enable');
    await sleep(200);
  }
  await P.fill('#mim-input', 'ปัญญาคืออะไร');
  await P.click('#mim-classroom');
  await sleep(600);
  ok(await P.evaluate(() => window.__runs) === 3, 'มิ้ม: ส่งหัวข้อเข้าห้องเรียนทันที');
  ok(await P.evaluate(() => (window.__topics || []).indexOf('ปัญญาคืออะไร') >= 0), 'มิ้ม: หัวข้อตรงกับข้อความที่พิมพ์');
  ok(await overlayDisplay() === 'none', 'มิ้ม: หน้าห้องเรียนไม่เปิดทับแชท');
  ok(await P.evaluate(() => document.getElementById('mim-input').value) === 'ปัญญาคืออะไร', 'มิ้ม: ข้อความในช่องมิ้มไม่ถูกล้าง');
  await closeClass();
  await P.evaluate(() => document.getElementById('mim-close').click());
  await sleep(300);

  // 4) ช่องว่างไม่ส่งอะไรเข้าห้องเรียน
  await P.click('#mode-code');
  await sleep(300);
  await P.fill('#prompt-input', '   ');
  const before = await P.evaluate(() => window.__runs);
  await P.click('#btn-class-open');
  await sleep(300);
  ok(await P.evaluate(() => window.__runs) === before, 'ช่องว่างไม่เริ่มห้องเรียน');
  await closeClass();

  console.log('  ผ่าน ' + pass + ' ไม่ผ่าน ' + fail);
  await h.close();
  if (fail) { console.log('classroom-open: FAILED'); process.exit(1); }
  console.log('classroom-open: all ' + pass + ' passed');
})().catch(async (e) => { console.error(e); process.exit(1); });
