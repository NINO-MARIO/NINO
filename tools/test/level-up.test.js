// ป๊อปอัพเลเวลอัปหลังรีบูต (js/level-up.js) ในเบราว์เซอร์จริง
// ตรวจ: ขึ้นเมื่อมีเครื่องหมายหลังรีบูตจริง, นับเลเวลเมื่ออัปเกรด, ไม่นับเมื่อถอยกลับ/สลับเวอร์ชัน,
// เครื่องหมายเก่าเกิน 10 นาทีไม่ขึ้น, โหลดปกติไม่ขึ้น, ลดการเคลื่อนไหวแล้วยังอ่านได้, จอเริ่มรีบูตขึ้นก่อน reload
const H = require('./harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }

(async () => {
  console.log('== เลเวลอัปหลังรีบูต: ขึ้นเมื่ออัปเกรด, ไม่นับถอยกลับ, เครื่องหมายเก่าไม่ขึ้น, ลดการเคลื่อนไหว');
  const h = await H.start();
  const P = h.page;

  async function freshLoad() {
    await P.goto(h.base + '/index.html', { waitUntil: 'load' });
    await sleep(1200);
  }
  const overlay = () => P.evaluate(() => {
    const o = document.getElementById('nino-lvl');
    if (!o) return null;
    return {
      on: o.classList.contains('on'),
      title: (o.querySelector('.lv-title') || {}).textContent || '',
      stage: (o.querySelector('.lv-stage') || {}).textContent || '',
      level: (o.querySelector('.lv-n') || {}).textContent || ''
    };
  });
  const setMark = (why, from, ageMs) => P.evaluate(([why, from, ageMs]) => {
    localStorage.setItem('nino.ota.rebooted', JSON.stringify({ t: Date.now() - ageMs, why: why, from: from }));
  }, [why, from, ageMs || 0]);

  // 1) โหลดปกติ ไม่มีเครื่องหมาย: ไม่มีป็อปอัพ
  await freshLoad();
  ok((await overlay()) === null, 'no overlay on a normal load');
  ok(await P.evaluate(() => typeof window.ninoLevelUp === 'object' && typeof window.ninoLevelUp.begin === 'function'), 'ninoLevelUp API exposed');

  // 2) เครื่องหมายอัปเกรดสด: ขึ้น LEVEL UP และนับเลเวลเป็น 1 (เคยไม่มีค่า จึงเริ่มที่ 1 ในฐานะอัปเกรดแรก = เลเวล 2)
  await P.evaluate(() => { localStorage.removeItem('nino.level'); });
  await setMark('build v-test', 'v1.0.0', 0);
  await freshLoad();
  await sleep(3800);
  let o = await overlay();
  ok(o && o.title === 'LEVEL UP!', 'upgrade shows LEVEL UP title, got: ' + JSON.stringify(o));
  ok(o && o.level === '2', 'first upgrade counts to level 2, got: ' + (o && o.level));
  ok(await P.evaluate(() => localStorage.getItem('nino.ota.rebooted') === null), 'marker is cleared after showing');
  ok(await P.evaluate(() => JSON.parse(localStorage.getItem('nino.level')).upgrades === 1), 'upgrade count saved as 1');
  ok(await P.evaluate(() => window.ninoLevelUp.level().level === 2), 'level() reports 2');

  // ปุ่มไปต่อปิดป็อปอัพ
  await P.click('#nino-lvl .lv-btn');
  await sleep(700);
  ok((await overlay()) === null, 'ไปต่อ button removes the overlay');

  // 3) ถอยกลับ: ขึ้นแต่ไม่นับเลเวล
  await setMark('back to v0.9', 'v1.0.0', 0);
  await freshLoad();
  await sleep(3000);
  o = await overlay();
  ok(o && o.title === 'ถอยกลับแล้ว', 'rollback shows its own title, got: ' + JSON.stringify(o));
  ok(await P.evaluate(() => JSON.parse(localStorage.getItem('nino.level')).upgrades === 1), 'rollback does not add a level');
  await P.evaluate(() => window.ninoLevelUp.hide());
  await sleep(500);

  // 4) สลับเวอร์ชัน (use): ไม่นับเลเวล
  await setMark('use v2', 'v1.0.0', 0);
  await freshLoad();
  await sleep(3000);
  o = await overlay();
  ok(o && o.title === 'สลับเวอร์ชันแล้ว', 'version switch has its own title, got: ' + JSON.stringify(o));
  ok(await P.evaluate(() => JSON.parse(localStorage.getItem('nino.level')).upgrades === 1), 'version switch does not add a level');
  await P.evaluate(() => window.ninoLevelUp.hide());
  await sleep(500);

  // 5) เครื่องหมายเก่าเกิน 10 นาที: ไม่ขึ้น และถูกลบ
  await setMark('build old', 'v1.0.0', 11 * 60 * 1000);
  await freshLoad();
  await sleep(1200);
  ok((await overlay()) === null, 'stale marker (over 10 min) does not show');
  ok(await P.evaluate(() => localStorage.getItem('nino.ota.rebooted') === null), 'stale marker is still removed');

  // 6) จอเริ่มรีบูตขึ้นก่อน reload (begin)
  await freshLoad();
  P.evaluate(() => window.ninoLevelUp.begin('build test')).catch(() => {});
  await sleep(350);
  o = await overlay();
  ok(o && o.on, 'begin() shows the reboot screen');
  ok(o && o.stage.indexOf('กำลังบันทึก') >= 0, 'first stage text shown, got: ' + (o && o.stage));
  await P.evaluate(() => window.ninoLevelUp.hide());

  // 7) ลดการเคลื่อนไหว: ยังอ่านเลเวลได้ ไม่ต้องรอแอนิเมชัน
  await P.emulateMedia({ reducedMotion: 'reduce' });
  await setMark('build rm', 'v1.0.0', 0);
  await freshLoad();
  await sleep(1500);
  o = await overlay();
  ok(o && o.title === 'LEVEL UP!' && o.level === '3', 'reduced motion still shows title and final level 3, got: ' + JSON.stringify(o));
  await P.emulateMedia({ reducedMotion: 'no-preference' });

  // 8) จอแคบ: ไม่มีการเลื่อนแนวนอน
  await P.setViewportSize({ width: 360, height: 740 });
  await setMark('build narrow', 'v1.0.0', 0);
  await freshLoad();
  await sleep(3800);
  ok(await P.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll with overlay on 360px width');

  // 9) ไม่มีข้อผิดพลาดของหน้า
  ok(h.errors.length === 0, 'no page errors: ' + JSON.stringify(h.errors.slice(0, 3)));

  await h.close();
  console.log('level-up: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
