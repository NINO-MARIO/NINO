const H = require('./harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
(async () => {
  console.log('== roleplay bubbles keep their data after direct DOM writes');
  const h = await H.start();
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1800);
  await P.evaluate(() => {
    currentCharacter = Object.assign({}, currentCharacter || {}, { mode: 'roleplay' });
    session.messages.push({ sender: 'user', text: '*เดินเข้าห้อง*', ts: Date.now(), turn: 1 });
    session.messages.push({ sender: 'nino', action: 'explain', reply: '*หันมามอง* "มาแล้วเหรอ" ฉันรอนานแล้วนะ', streaming: false, ts: Date.now(), turn: 1, notice: 'ต่อให้อัตโนมัติ: ขยายความยาวแล้ว' });
    renderMessages();
  });
  await sleep(300);
  const bubble = () => P.evaluate(() => { const all = document.querySelectorAll('.roleplay-msg'); const b = all[all.length - 1]; return b ? b.textContent : null; });
  const first = await bubble();
  ok(first && first.indexOf('มาแล้วเหรอ') >= 0, 'bubble shows the reply after first render');
  ok(await P.evaluate(() => document.querySelectorAll('.nino-cc').length) === 0, 'no chat card inside roleplay');
  await P.evaluate(() => {
    const all = document.querySelectorAll('.roleplay-msg');
    const rp = all[all.length - 1];
    rp.innerHTML = 'กำลังเขียนค้าง<span class="streaming-cursor"></span>';
  });
  await P.evaluate(() => { renderMessages(); });
  await sleep(300);
  const again = await bubble();
  ok(again === first, 'a re-render with unchanged data restores the bubble from data, got: ' + again);
  ok(await P.evaluate(() => document.querySelectorAll('.streaming-cursor').length) === 0, 'stale streaming cursor is removed');
  ok(await P.evaluate(() => document.querySelectorAll('.rp-notice').length) === 1, 'notice line is still shown');
  ok(h.errors.length === 0, 'no page errors: ' + JSON.stringify(h.errors.slice(0, 3)));
  await h.close();
  console.log('passed ' + pass + ', failed ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
