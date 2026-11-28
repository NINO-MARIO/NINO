const H = require('./harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
(async () => {
  console.log('== chat turn: the model sees the CG index only when ON and picks a tag');
  const h = await H.start();
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1800);
  await P.evaluate(async () => {
    window.providerHasKey = () => true;
    localStorage.setItem('nino.focus', 'c');
    await window.ninoCg.add(new File([new Uint8Array(200)], 'happy.png', { type: 'image/png' }), 'HAPPY');
    window.__sent = [];
    window.chatCall = () => window.__sent.filter(x => x.indexOf('คุณคือ NINO ผู้ช่วยในแอปบนมือถือ') === 0).pop() || '';
    window.geminiGenerate = async function (a) {
      window.__sent.push(a.systemInstruction || '');
      const txt = window.__nextReply || 'ดีใจมากเลย 555 [[CG:HAPPY]]';
      if (a.onChunk) a.onChunk(txt);
      _lastFinishReason = 'STOP';
      return txt;
    };
  });
  const send = async (text) => {
    await P.fill('#prompt-input', text);
    await P.click('#btn-send');
    await sleep(1800);
  };
  await P.evaluate(() => localStorage.setItem('nino.cg.on', '0'));
  await P.evaluate(() => window.ninoCgPick.refresh());
  await send('สวัสดีค่ะ วันนี้เป็นไงบ้าง');
  const off = await P.evaluate(() => ({ sys: chatCall(), last: session.messages[session.messages.length - 1] }));
  ok(off.sys && off.sys.indexOf('ห้องฟิล์ม CG') < 0, 'switch OFF: the system prompt has no CG block');
  ok(off.last.reply === 'ดีใจมากเลย 555' && off.last.cg === '', 'switch OFF: tag is stripped and no pick is kept');
  ok(await P.evaluate(() => document.querySelectorAll('.nino-cc').length) === 0, 'switch OFF: no card');
  await P.evaluate(() => { window.ninoCgPick.setOn(true); });
  await sleep(300);
  await send('อยากฟังเรื่องวันนี้หน่อย');
  const on = await P.evaluate(() => ({ sys: chatCall(), last: session.messages[session.messages.length - 1] }));
  ok(on.sys && on.sys.indexOf('ห้องฟิล์ม CG') >= 0 && on.sys.indexOf('HAPPY') >= 0, 'switch ON: the system prompt lists HAPPY');
  ok(on.sys && on.sys.indexOf('[[CG:') >= 0, 'switch ON: the system prompt asks for the tag');
  ok(on.last.reply === 'ดีใจมากเลย 555' && on.last.cg === 'HAPPY', 'switch ON: the model pick is kept and the tag is removed');
  ok(await P.evaluate(() => { const all = [...document.querySelectorAll('.nino-cc-badge')]; return all.length >= 1 && all[all.length - 1].textContent.indexOf('AI เลือก: HAPPY') === 0; }), 'switch ON: the card shows the AI choice');
  await P.evaluate(() => { window.__nextReply = 'ตอบเรื่องอื่น [[CG:SAD]]'; });
  await send('เล่าอีกเรื่องได้ไหม');
  const sadPick = await P.evaluate(() => session.messages[session.messages.length - 1].cg);
  ok(sadPick === 'NONE', 'a category with no items is never kept, got ' + sadPick);
  await P.evaluate(() => { window.__nextReply = 'ตอบแบบไม่มีแท็ก'; });
  await send('คุยต่ออีกนิด');
  const noTag = await P.evaluate(() => session.messages[session.messages.length - 1]);
  ok(noTag.reply === 'ตอบแบบไม่มีแท็ก' && noTag.cg === 'NONE', 'no tag from the model means NONE');
  ok(h.errors.length === 0, 'no page errors: ' + JSON.stringify(h.errors.slice(0, 3)));
  await h.close();
  console.log('passed ' + pass + ', failed ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
