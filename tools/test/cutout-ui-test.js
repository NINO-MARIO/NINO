// ทดสอบปุ่มกรรไกรในถาดรูปจริงในเบราว์เซอร์: แนบรูป กดกรรไกร ลากกรอบ ตัดเลย ใช้รูปนี้
// ตรวจ: ปุ่มขึ้นเฉพาะตอนมีรูปที่ยังไม่ส่ง, หน้าตัดเปิดได้, ตัดได้ (เวิร์กเกอร์ทำงาน), ผลมีพื้นหลังโปร่งใสที่มุม,
// ขนาดเดิม, และหน้าไม่มีข้อผิดพลาด
const H = require('./harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }

async function waitFor(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(150); }
  return false;
}

(async () => {
  console.log('== ปุ่มกรรไกรตัดพื้นหลังในถาดรูป');
  const h = await H.start();
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1500);

  ok(await P.evaluate(() => !document.querySelector('#nino-img-tray .nino-tray-cut')), 'no scissors button before an image is attached');

  // รูปทดสอบ: วงกลมแดงบนพื้นน้ำเงิน 320×240
  await P.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240;
    const x = c.getContext('2d');
    x.fillStyle = '#2860c8'; x.fillRect(0, 0, 320, 240);
    x.fillStyle = '#dc2828'; x.beginPath(); x.arc(160, 120, 60, 0, Math.PI * 2); x.fill();
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await window.ninoImg.handleFile(new File([blob], 'test.png', { type: 'image/png' }));
  });
  ok(await waitFor(() => P.evaluate(() => !!document.querySelector('#nino-img-tray .nino-tray-cut')), 5000), 'scissors button appears on the attached image');

  await P.click('#nino-img-tray .nino-tray-cut');
  ok(await waitFor(() => P.evaluate(() => document.querySelector('.nino-cut') && document.querySelector('.nino-cut').classList.contains('open')), 3000), 'cutout editor opens');
  await sleep(300);

  // ลากกรอบรอบวงกลม (ทำให้ผู้ใช้เห็นการลากจริง)
  const bb = await P.locator('.nino-cut-cv').boundingBox();
  await P.mouse.move(bb.x + bb.width * 0.2, bb.y + bb.height * 0.12);
  await P.mouse.down();
  await P.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5, { steps: 6 });
  await P.mouse.move(bb.x + bb.width * 0.8, bb.y + bb.height * 0.88, { steps: 6 });
  await P.mouse.up();
  await sleep(150);

  await P.click('.nino-cut [data-act="cut"]');
  ok(await waitFor(() => P.evaluate(() => /ตัดแล้ว/.test((document.querySelector('.nino-cut-msg') || {}).textContent || '')), 25000), 'cutting finishes through the worker');
  const applyEnabled = await P.evaluate(() => !document.querySelector('.nino-cut [data-act="apply"]').disabled);
  ok(applyEnabled, 'apply enabled after cutting');

  await P.click('.nino-cut [data-act="apply"]');
  ok(await waitFor(() => P.evaluate(() => !document.querySelector('.nino-cut').classList.contains('open')), 20000), 'apply closes the editor');

  const result = await P.evaluate(async () => {
    const p = window.ninoImg.getPending();
    if (!p) return { none: true };
    const img = new Image();
    img.src = p.dataUrl;
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const a = (px, py) => x.getImageData(px, py, 1, 1).data[3];
    return {
      mime: p.mime, w: p.w, h: p.h, natW: img.naturalWidth, natH: img.naturalHeight,
      corner: a(2, 2), centre: a(Math.floor(img.naturalWidth / 2), Math.floor(img.naturalHeight / 2)),
      hasThumb: !!document.querySelector('#nino-img-tray .nino-tray-cut')
    };
  });
  ok(!result.none, 'the cut image replaces the pending attachment');
  ok(result.mime === 'image/webp' || result.mime === 'image/png', 'result is webp or png with alpha: ' + result.mime);
  ok(result.corner === 0, 'background corner is transparent: alpha ' + result.corner);
  ok(result.centre === 255, 'object centre stays opaque: alpha ' + result.centre);
  ok(result.w === 320 && result.h === 240 && result.natW <= 1280, 'size kept within the attach limits: ' + result.natW + 'x' + result.natH);
  ok(result.hasThumb, 'scissors button still shown for the cut image before sending');

  ok(h.errors.length === 0, 'no page errors: ' + h.errors.join(' | '));
  await h.close();
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL: crashed: ' + e.stack); process.exit(1); });
