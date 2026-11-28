const H = require('./harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
(async () => {
  console.log('== chat card across streaming');
  const h = await H.start();
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1800);
  await P.evaluate(() => { localStorage.setItem('nino.cg.on', '1'); window.ninoCgPick.refresh(); });
  const base = await P.evaluate(() => document.querySelectorAll('.nino-cc').length);
  await P.evaluate(() => {
    session.messages.push({ sender: 'nino', action: 'explain', reply: 'กำลังคิด', streaming: true, ts: Date.now(), turn: 9 });
    renderMessages();
  });
  await sleep(300);
  ok(await P.evaluate(() => document.querySelectorAll('.nino-cc').length) === base, 'no new card while streaming');
  await P.evaluate(() => {
    const m = session.messages[session.messages.length - 1];
    m.reply = 'ดีใจจังเลย ขอบคุณนะคะ';
    m.streaming = false;
    m.cg = 'HAPPY';
    renderMessages();
  });
  await sleep(400);
  const last = await P.evaluate(() => { const c = document.querySelectorAll('.nino-cc'); return c.length ? c[c.length - 1].querySelector('.nino-cc-badge').textContent : ''; });
  ok(last.indexOf('HAPPY') >= 0, 'card appears after the stream completes: ' + last);
  await P.evaluate(() => { for (let i = 0; i < 6; i++) session.messages.push({ sender: 'user', text: 'x' + i, ts: Date.now(), turn: i }); renderMessages(); });
  await sleep(300);
  ok(await P.evaluate(() => document.querySelectorAll('.nino-cc').length >= 1), 'cards survive more messages');
  ok(h.errors.length === 0, 'no page errors: ' + JSON.stringify(h.errors.slice(0, 3)));
  await h.close();
  console.log('passed ' + pass + ', failed ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
