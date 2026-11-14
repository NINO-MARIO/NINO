/* Auto-continue behaviour (real browser, stubbed model). Run: node tools/test/continue.test.js */
const H = require('./harness.js');
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('  FAIL: ' + name); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const h = await H.start();
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(2500);
  console.log('== classify');
  const cls = await P.evaluate(() => ['STOP', null, 'MAX_TOKENS', 'INTERRUPTED', 'OTHER', 'PROHIBITED_CONTENT', 'SAFETY', 'PROMPT_BLOCKED_OTHER', 'tool_calls'].map(r => window.ninoContinue.classify(r)));
  ok(JSON.stringify(cls) === JSON.stringify(['done', 'done', 'cut', 'cut', 'soft', 'policy', 'policy', 'policy', 'done']), 'finish reasons are classified');
  console.log('== roleplay: cut then provider filter');
  const run = (seq, ext) => P.evaluate(async ([seq, ext]) => {
    window.providerHasKey = () => true;
    window.rpLenSpec = () => ext ? { key: 'long', minChars: 2000, ext: 1, paras: '6-9', label: 'ยาว' } : { key: 'normal', minChars: 0, ext: 0, paras: '3-5', label: 'ปกติ' };
    let calls = 0, turnCalls = 0, texts = [];
    window.geminiGenerate = async function (a) {
      const last = (a.contents[a.contents.length - 1].parts[0].text || '');
      const isTurn = /user_single_message/.test(last);
      if (!isTurn) return '';
      const s = seq[Math.min(turnCalls, seq.length - 1)];
      turnCalls++;
      if (s[0] && a.onChunk) a.onChunk(s[0]);
      _lastFinishReason = s[1];
      return s[0];
    };
    currentCharacter = Object.assign({}, currentCharacter || {}, { id: 't1', name: 'T', mode: 'roleplay' });
    const t0 = performance.now();
    await runRoleplayTurn('ทดสอบ');
    const bot = session.messages.filter(m => m.sender === 'nino').pop();
    return { turnCalls, ms: Math.round(performance.now() - t0), notice: bot.notice, blocked: bot.blocked, reply: bot.reply };
  }, [seq, !!ext]);
  let r = await run([['a ', 'MAX_TOKENS'], ['b ', 'MAX_TOKENS'], ['c', 'STOP']]);
  ok(r.turnCalls === 3 && /a b c/.test(r.reply.replace(/\s+/g, ' ')) && !r.notice, 'MAX_TOKENS is continued immediately until STOP');
  r = await run([['x', 'STOP']]);
  ok(r.turnCalls === 1 && !r.notice, 'clean stop makes exactly one call');
  r = await run([['p ', 'PROHIBITED_CONTENT'], ['q', 'STOP']]);
  ok(r.turnCalls === 2 && !r.notice && !r.blocked, 'a spurious provider block recovers on the automatic retry');
  r = await run([['p ', 'PROHIBITED_CONTENT'], ['', 'PROHIBITED_CONTENT'], ['', 'PROHIBITED_CONTENT'], ['', 'PROHIBITED_CONTENT']]);
  ok(r.turnCalls === 3 && r.blocked === 'PROHIBITED_CONTENT' && /PROHIBITED_CONTENT/.test(r.notice) && /2 รอบ/.test(r.notice), 'a persistent provider block stops after 2 retries with an honest notice');
  ok(r.ms < 3000, 'no polling delay (took ' + r.ms + 'ms)');
  r = await run([['s ', 'STOP'], ['more', 'STOP']], true);
  ok(r.turnCalls === 2 && /s more/.test(r.reply.replace(/\s+/g, ' ')), 'length feedback extends a reply that is shorter than the target');
  r = await run([['p ', 'PROHIBITED_CONTENT'], ['', 'PROHIBITED_CONTENT'], ['', 'PROHIBITED_CONTENT'], ['', 'PROHIBITED_CONTENT']], true);
  ok(r.turnCalls === 3, 'length feedback does not call the model again after a provider block');
  r = await run([['m ', 'OTHER'], ['n', 'STOP']]);
  ok(r.turnCalls === 2 && !r.notice, 'transient OTHER stop is retried');
  await h.close();
  console.log('\npassed ' + pass + ', failed ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
