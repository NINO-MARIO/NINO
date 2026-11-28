/* หน้าแชท: ชื่อแถบไม่ดันขึ้นบรรทัด, ช่องพิมพ์เต็มความกว้างอยู่บรรทัดบน, ปุ่ม Build/Commit อยู่ที่ >_ เท่านั้น,
 * โหมดหน้าจอ 4 รอบ (รอบที่ 4 กลับเป็นปกติและลบค่าที่จำไว้), ความกว้างบับเบิลบอท
 * การจัดวางตัวเลขต้องใช้ Tailwind (CDN ในแอป) ถ้าเครื่องนี้ไม่มีไฟล์ Tailwind สำรอง จะข้ามเฉพาะข้อการจัดวาง
 * รัน: node tools/test/chat-layout.test.js */
const H = require('./harness.js');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TW = process.env.TAILWIND_STANDIN || '/opt/npm-tools/node_modules/@zenuml/core/dist/vendor/tailwindcss/tailwindcss.js';
let pass = 0, fail = 0, skip = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }

(async () => {
  console.log('== หน้าแชท: แถบชื่อ, ช่องพิมพ์, Build/Commit, โหมดหน้าจอ, บับเบิล');
  const hasTw = fs.existsSync(TW);
  const h = await H.start();
  const P = h.page;
  const errors = [];
  P.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  if (hasTw) await P.route('https://cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(TW) }));
  await P.setViewportSize({ width: 390, height: 844 });
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(2000);
  await P.evaluate(() => { localStorage.removeItem('nino.uimode'); localStorage.removeItem('nino.bubble'); });
  await P.reload({ waitUntil: 'load' });
  await sleep(1800);

  const state = () => P.evaluate(() => ({
    cls: [...document.documentElement.classList].filter(c => /^(ui-|bub-)/.test(c)).sort().join(' '),
    header: getComputedStyle(document.getElementById('app-header')).display,
    tabs: getComputedStyle(document.getElementById('main-tabs')).display,
    bodyW: Math.round(document.body.getBoundingClientRect().width),
    stored: localStorage.getItem('nino.uimode'),
  }));

  // 3) Build/Commit: ไม่อยู่ในหน้าแชทแล้ว แต่ยังอยู่ในกล่อง >_ (ลูกศรโลโก้)
  ok(await P.evaluate(() => !document.getElementById('fb-b') && !document.getElementById('fb-c')), 'chat row no longer has Build/Commit');
  ok(await P.evaluate(() => !!document.getElementById('nd-build') && !!document.getElementById('nd-commit')), 'the >_ drawer keeps Build and Commit');
  ok(await P.evaluate(() => !!document.querySelector('#nd-focus #music-btn')), 'music button still mounted in the focus row');
  ok(await P.evaluate(() => !!document.querySelector('#chat-input-bar #btn-uimode') && !!document.querySelector('#chat-input-bar #btn-bubble')), 'new buttons are in the input tools row');

  // 4) โหมดหน้าจอ 4 รอบ
  let s = await state();
  ok(s.cls === '' && s.header !== 'none', 'start: normal phone mode, header visible, got ' + JSON.stringify(s));
  await P.click('#btn-uimode'); await sleep(150);
  s = await state();
  ok(s.cls === 'ui-full' && s.header === 'none' && s.tabs === 'none', 'round 1: full phone hides header and tabs, got ' + JSON.stringify(s));
  ok(s.stored === '1', 'round 1 is remembered');
  await P.click('#btn-uimode'); await sleep(150);
  s = await state();
  ok(s.cls === 'ui-desk' && s.header !== 'none' && s.bodyW === 1180, 'round 2: desktop width 1180, header still shown, got ' + JSON.stringify(s));
  await P.click('#btn-uimode'); await sleep(150);
  s = await state();
  ok(s.cls === 'ui-desk ui-full' && s.header === 'none' && s.bodyW === 1180, 'round 3: desktop full screen, got ' + JSON.stringify(s));
  await P.reload({ waitUntil: 'load' }); await sleep(1500);
  s = await state();
  ok(s.cls === 'ui-desk ui-full', 'round 3 survives reload');
  await P.click('#btn-uimode'); await sleep(150);
  s = await state();
  ok(s.cls === '' && s.header !== 'none' && s.tabs !== 'none' && s.bodyW < 500, 'round 4: back to the original layout, got ' + JSON.stringify(s));
  ok(s.stored === null, 'round 4 removes the saved value (as if never pressed)');
  const fresh = await P.evaluate(() => getComputedStyle(document.body).width);
  ok(parseInt(fresh, 10) <= 390, 'body width back to the phone width: ' + fresh);

  // 5) ความกว้างบับเบิลแชทบอท
  await P.evaluate(() => document.getElementById('btn-bubble').click());
  await sleep(120);
  ok(await P.evaluate(() => document.documentElement.classList.contains('bub-wide') && localStorage.getItem('nino.bubble') === '1'), 'bubble wide on and remembered');
  await P.evaluate(() => document.getElementById('btn-bubble').click());
  await sleep(120);
  ok(await P.evaluate(() => !document.documentElement.classList.contains('bub-wide') && localStorage.getItem('nino.bubble') === null), 'bubble back to normal, saved value removed');

  if (hasTw) {
    const bw = () => P.evaluate(() => { const m = document.querySelector('.msg-wrap'); return m ? Math.round(m.getBoundingClientRect().width) : -1; });
    const before = await bw();
    await P.evaluate(() => document.getElementById('btn-bubble').click()); await sleep(150);
    const after = await bw();
    ok(before > 0 && after >= before, 'wide bubble is at least as wide as normal: ' + before + ' -> ' + after);
    await P.evaluate(() => document.getElementById('btn-bubble').click()); await sleep(120);
  }

  // 1-2) การจัดวาง (ต้องใช้ Tailwind)
  if (!hasTw) { skip = 3; console.log('  ข้ามการจัดวาง 3 ข้อ: ไม่มีไฟล์ Tailwind สำรองที่ ' + TW); }
  else {
    const LONG = 'ตัวละครชื่อยาวมากๆ ที่ยาวเกินพื้นที่แถบนี้แน่นอนเลยจริงๆ';
    await P.evaluate((t) => { document.getElementById('active-char-name').textContent = t; document.getElementById('active-char-bar').classList.remove('hidden'); }, LONG);
    await sleep(200);
    const bar = await P.evaluate(() => {
      const b = document.getElementById('active-char-bar').getBoundingClientRect();
      const n = document.getElementById('active-char-name').getBoundingClientRect();
      return { barH: Math.round(b.height), barW: Math.round(b.width), nameH: Math.round(n.height), nameR: Math.round(n.right), barR: Math.round(b.right), docW: document.documentElement.scrollWidth };
    });
    ok(bar.nameH <= 20, 'long name stays on one line (height ' + bar.nameH + ')');
    ok(bar.barH <= 60, 'bar does not grow when the name is long (height ' + bar.barH + ')');
    ok(bar.nameR <= bar.barR && bar.docW <= 390, 'no sideways push: name inside bar, page width ' + bar.docW);
    const inp = await P.evaluate(() => {
      const r = document.getElementById('prompt-input').getBoundingClientRect();
      const c = document.getElementById('chat-input-bar').getBoundingClientRect();
      const s = document.getElementById('btn-send').getBoundingClientRect();
      return { w: Math.round(r.width), cw: Math.round(c.width), inBottom: Math.round(r.bottom), sendTop: Math.round(s.top) };
    });
    ok(inp.w >= inp.cw * 0.9, 'input spans the row: ' + inp.w + ' of ' + inp.cw);
    ok(inp.inBottom <= inp.sendTop, 'input sits above the send button row');
  }

  ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 2).join(' | '));
  console.log('  ผ่าน ' + pass + ' ไม่ผ่าน ' + fail + (skip ? ' ข้าม ' + skip : ''));
  await h.close();
  if (fail) { console.log('chat-layout: FAILED'); process.exit(1); }
  console.log('chat-layout: all ' + pass + ' passed' + (skip ? ' (' + skip + ' skipped)' : ''));
})().catch(async (e) => { console.error(e); process.exit(1); });
