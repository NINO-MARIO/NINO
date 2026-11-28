// ห้องเรียนจดสกิลแล้ว มิ้มอ่านอัตโนมัติ (เบราว์เซอร์)
// r72: ข้อความยืนยันการจดต้องไม่ถูกทับทันที · ไม่มีโมเดลในเครื่องต้องเงียบ · รีวิวทีละชิ้นไม่เกิน 3 ชิ้นรอ
//      · กดหยุดหรือปิดแล้วรีวิวที่ค้างต้องหยุด · เส้นทาง reviewSkill จริงต้องไม่ส่งสกิลส่วนตัวออกเครือข่าย
// รัน: node tools/test/classroom-review.test.js (ต้องมี Chromium ดู tools/TESTS.md ข้อ 5)
const H = require('./harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
const SKILL_PATH = 'skills/lab/research/t1/Skill.md';

(async () => {
  console.log('== ห้องเรียนจดสกิลแล้ว มิ้มอ่านอัตโนมัติ');
  const h = await H.start();
  const P = h.page;
  P.on('dialog', d => d.accept());
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1500);

  await P.evaluate((path) => {
    window.__realRS = ninoRoster.reviewSkill;
    window.__rv = [];
    window.__mode = 'ok';
    window.__saves = 1;
    window.__probeAt = false;
    window.__inflight = 0;
    window.__maxIn = 0;
    const realFs = window.ninoLib.fs;
    window.ninoLib.fs = Object.assign({}, realFs, {
      read: (k) => (k === path ? '# สกิลทดสอบ\nบรรทัดเนื้อหา' : realFs.read(k))
    });
    ninoRoster.reviewSkill = async (sk) => {
      window.__rv.push(sk.name);
      window.__inflight++; window.__maxIn = Math.max(window.__maxIn, window.__inflight);
      try {
        if (window.__mode === 'slow') await new Promise(r => setTimeout(r, 500));
        if (window.__mode === 'fail') throw new Error('ไม่มีโมเดลในเครื่อง');
        if (window.__mode === 'noroute') { const e = new Error('ยังไม่มีโมเดลในเครื่องสำหรับบทบาท worker'); e.code = 'NO_ROUTE'; throw e; }
        return { text: 'สรุปทดสอบ\nจุดแข็ง', label: 'ในเครื่อง', by: 'lw' };
      } finally { window.__inflight--; }
    };
    window.ninoResearch = Object.assign({}, window.ninoResearch || {}, {
      run: async (topics, ev) => {
        const n = window.__saves || 1;
        for (let i = 0; i < n; i++) ev({ t: 'saved', name: 'สกิลทดสอบ' + i, path });
        if (window.__probeAt) {
          await new Promise(r => setTimeout(r, 400));
          window.__probe = (document.getElementById('nc-bub') || {}).textContent || '';
        }
        ev({ t: 'end', saved: n });
        return { srcs: [], errs: [] };
      }
    });
  }, SKILL_PATH);

  await P.click('#mode-code');
  await sleep(300);
  const bubText = () => P.evaluate(() => (document.getElementById('nc-bub') || {}).textContent || '');
  const logText = () => P.evaluate(() => (document.getElementById('nc-log') || {}).textContent || '');
  const startRun = async (t) => { await P.fill('#prompt-input', t); await P.click('#btn-class-open'); };

  // A: ข้อความยืนยันการจดขึ้นก่อน แล้วจึงรีวิวผลขึ้นตามหลัง
  await P.evaluate(() => { window.__probeAt = true; window.__rv = []; });
  await startRun('ทดสอบ');
  await sleep(2600);
  ok(await P.evaluate(() => /จดลงห้องสมุดแล้ว/.test(window.__probe || '')), 'ข้อความยืนยันการจดขึ้นและไม่ถูกทับทันที');
  ok(await P.evaluate(() => window.__rv.length === 1 && window.__rv[0] === 'สกิลทดสอบ'), 'สกิลที่จดแล้วถูกส่งให้มิ้มอ่านหนึ่งครั้ง');
  ok((await bubText()).indexOf('สรุปทดสอบ') >= 0, 'ผลรีวิวขึ้นในบับเบิลห้องเรียน');
  ok(await P.evaluate(() => /จบการเรียน/.test((document.getElementById('nc-stat') || {}).textContent || '')), 'ห้องเรียนยังไปถึงขั้นจบการเรียนตามปกติ');

  // B: รีวิวพลาดแบบทั่วไป แสดงข้อความสั้น ห้องเรียนทำงานต่อ
  await P.evaluate(() => { window.__probeAt = false; window.__mode = 'fail'; });
  await startRun('ทดสอบสอง');
  await sleep(2600);
  ok(/ยังอ่านสกิลนี้ไม่ได้/.test(await bubText()), 'รีวิวพลาดแสดงข้อความสั้น ห้องเรียนยังทำงานต่อ');
  ok(await P.evaluate(() => window.__rv.length === 2), 'ทุกการจดสกิลเรียกรีวิวหนึ่งครั้งเท่านั้น');

  // C: ไม่มีโมเดลในเครื่อง (NO_ROUTE) เงียบบนบับเบิล บันทึกลงบันทึกการเรียนอย่างเดียว
  await P.evaluate(() => { window.__mode = 'noroute'; });
  await startRun('ทดสอบสาม');
  await sleep(2600);
  ok(!/ยังอ่านสกิลนี้ไม่ได้/.test(await bubText()), 'ไม่มีโมเดลในเครื่องไม่ขึ้นข้อความรบกวนบนบับเบิล');
  ok(/มิ้มยังอ่านสกิลนี้ไม่ได้/.test(await logText()), 'ไม่มีโมเดลในเครื่องยังบันทึกลงบันทึกการเรียน');

  // D: คิวทีละชิ้น จำกัดไม่เกิน 3 ชิ้นที่รอ (ชิ้นเก่าสุดถูกทิ้ง)
  await P.evaluate(() => { window.__mode = 'slow'; window.__saves = 5; window.__rv = []; window.__maxIn = 0; });
  await startRun('ทดสอบสี่');
  await sleep(4500);
  ok(await P.evaluate(() => window.__rv.length === 3), 'รีวิวรอคิวไม่เกิน 3 ชิ้น');
  ok(await P.evaluate(() => window.__maxIn === 1), 'รีวิวทำทีละชิ้น ไม่ยิงซ้อนบนโมเดลในเครื่องตัวเดียวกับแชท');

  // E: กดหยุดแล้วรีวิวที่ค้างต้องหยุด ผลของงานที่ถูกยกเลิกไม่ขึ้น
  await P.evaluate(() => { window.__saves = 3; window.__rv = []; window.__mode = 'slow'; const b = document.getElementById('nc-bub'); if (b) b.textContent = 'ตั้งต้น'; });
  await startRun('ทดสอบห้า');
  for (let i = 0; i < 40 && (await P.evaluate(() => window.__rv.length)) < 1; i++) await sleep(100);
  await P.evaluate(() => document.getElementById('nc-stop').click());
  await sleep(2500);
  ok(await P.evaluate(() => window.__rv.length === 1), 'กดหยุดแล้วรีวิวที่รออยู่ในคิวถูกทิ้ง');
  ok((await bubText()).indexOf('สรุปทดสอบ') < 0, 'กดหยุดแล้วผลรีวิวที่ค้างไม่ขึ้นบับเบิล');

  // F: เส้นทาง reviewSkill จริงกับสกิลส่วนตัว ต้องไม่ส่งข้อมูลออกเครือข่ายเลย
  const real = await P.evaluate(async () => {
    let calls = 0; const of = window.fetch;
    window.fetch = function (u) {
      if (typeof u === 'string' && /^https?:\/\//.test(u) && u.indexOf(location.origin) !== 0) calls++;
      return Promise.reject(new Error('ปิดเครือข่ายในการทดสอบ'));
    };
    try {
      const out = await Promise.race([
        window.__realRS({ name: 'ส่วนตัว', body: '# ส่วนตัว\nข้อมูลภายในที่ไม่ใช่สาธารณะ' }).then(() => ({ ok: true, code: '' }), e => ({ ok: false, code: (e && e.code) || '' })),
        new Promise(res => setTimeout(() => res({ ok: null, code: 'timeout' }), 15000))
      ]);
      return Object.assign({ calls }, out);
    } finally { window.fetch = of; }
  });
  ok(real.ok === false && (real.code === 'NO_ROUTE' || real.code === 'ALL_FAILED'), 'สกิลส่วนตัวไม่มีโมเดลในเครื่องจะไม่ผ่านไปคลาวด์ (' + real.code + ')');
  ok(real.calls === 0, 'สกิลส่วนตัวไม่มีการเรียกเครือข่ายออกไปเลย');

  // G: ปุ่มเปิดปิดรีวิว: ค่าเริ่มต้นเปิด (เท่าเดิม) ปิดแล้วไม่รีวิวและทิ้งคิว และค่าถูกจำไว้ในเครื่อง
  ok(await P.evaluate(() => { const b = document.getElementById('nc-rv'); return !!b && b.checked === true; }), 'ค่าเริ่มต้นของปุ่มรีวิวเปิดอยู่ เท่าพฤติกรรมเดิม');
  await P.evaluate(() => { document.getElementById('nc-rv').click(); });
  ok(await P.evaluate(() => localStorage.getItem('nino.review.auto') === '0'), 'ปิดปุ่มแล้วจำค่าไว้ในเครื่อง');
  await P.evaluate(() => { window.__rv = []; window.__mode = 'ok'; window.__saves = 2; });
  await startRun('ทดสอบหก');
  await sleep(2600);
  ok(await P.evaluate(() => window.__rv.length === 0), 'ปิดปุ่มแล้วสกิลที่จดไม่ถูกรีวิว');
  await P.evaluate(() => { document.getElementById('nc-rv').click(); });
  ok(await P.evaluate(() => localStorage.getItem('nino.review.auto') === '1'), 'เปิดปุ่มกลับแล้วจำค่าเป็นเปิด');
  await P.evaluate(() => { window.__rv = []; window.__saves = 1; });
  await startRun('ทดสอบเจ็ด');
  await sleep(2600);
  ok(await P.evaluate(() => window.__rv.length === 1), 'เปิดปุ่มกลับแล้วรีวิวทำงานตามเดิม');

  console.log('  ผ่าน ' + pass + ' ไม่ผ่าน ' + fail);
  await h.close();
  if (fail) { console.log('classroom-review: FAILED'); process.exit(1); }
  console.log('classroom-review: all ' + pass + ' passed');
})().catch(async (e) => { console.error(e); process.exit(1); });
