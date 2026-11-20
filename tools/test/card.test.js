/* HUD card format + model-controlled stop. Run: node tools/test/card.test.js */
const H = require('./harness.js');
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('  FAIL: ' + name); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const h = await H.start();
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(2500);
  console.log('== card renderer');
  const r = await P.evaluate(() => {
    const H = window.ninoHud;
    const txt = 'ก่อนการ์ด\n[[CARD]]\nสถานะ: ปกติ\nเวลา: 14:20\nวัน: 3\nอากาศ: ฝนเบา\nคำโปรย: เสียงฝนบนหลังคา\nHP: 90/100\nสถานการณ์: 🌧 | ร้านกาแฟเงียบ\nNPC: บาริสต้า\nท่า: นิโนะวางแก้วลง\nพูด: นิโนะ | ยิ้ม | ยินดีต้อนรับค่ะ\nพูด: ลูกค้า | ขอกาแฟหนึ่งแก้ว\nคำสั่งต่อเนื่อง ที่ไม่ใช่ช่อง: และมีโคลอนในข้อความ\nตัวเลือก1: สั่งกาแฟ\nระบบ: <script>alert(1)</script>\nนิโนะพูด: เชิญนั่งก่อนนะคะ\n[[/CARD]] [[END]]';
    const html = H.mixed(txt, s => '<p>' + s + '</p>');
    const part = H.mixed('[[CARD]]\nสถานะ: กำลังเขียน\nเวลา: 1', s => s);
    return { html, part, stopped: H.stopped(txt), cleaned: H.clean(txt), left: (html.match(/\{\{/g) || []).length, opts: (html.match(/class="opt-btn/g) || []).length };
  });
  ok(r.html.indexOf('<p>ก่อนการ์ด</p>') === 0, 'text before the card is rendered normally');
  ok(/SYSTEM_ONLINE \| 14:20/.test(r.html) && /DAY 3/.test(r.html) && /STAMP_ฝนเบา/.test(r.html), 'fields land in the exact template slots');
  ok(/<b>🌧 สถานการณ์:<\/b> ร้านกาแฟเงียบ/.test(r.html) && /<b>นิโนะ:<\/b> \(ยิ้ม\) "ยินดีต้อนรับค่ะ"/.test(r.html) && /<b>ลูกค้า:<\/b> "ขอกาแฟหนึ่งแก้ว คำสั่งต่อเนื่อง ที่ไม่ใช่ช่อง: และมีโคลอนในข้อความ"/.test(r.html), 'situation and dialogue lines are built in template markup');
  ok(/ที่ไม่ใช่ช่อง: และมีโคลอนในข้อความ/.test(r.html) && r.html.indexOf('<b>คำสั่งต่อเนื่อง') < 0, 'a line that is not a field name continues the previous field');
  ok(r.html.indexOf('<script>') < 0 && /&lt;script&gt;/.test(r.html), 'model text is escaped, never injected as HTML');
  ok(r.left === 0, 'no {{placeholder}} is left in the output');
  ok(r.opts === 2 && />5\. NINO SHOP</.test(r.html) && !/data-choice="4"/.test(r.html), 'option 1 from the model plus a full-width fifth option that defaults to NINO SHOP');
  ok(r.stopped && r.html.indexOf('[[END]]') < 0 && r.cleaned.indexOf('[[END]]') < 0, 'the stop marker is detected and hidden');
  ok(/LOG: กำลังเขียน/.test(r.part), 'a card that is still streaming renders what it has so far');
  console.log('== prompts and chat bubbles');
  const p = await P.evaluate(() => {
    localStorage.setItem('nino.focus', 'n');
    const code = buildSystemPrompt();
    const rp = buildRoleplaySystemPrompt(getActiveCharacter());
    currentCharacter = Object.assign({}, currentCharacter || {}, { mode: 'roleplay' });
    session.messages.push({ sender: 'nino', reply: '[[CARD]]\nสถานะ: ทดสอบ\n[[/CARD]]', action: 'explain' });
    renderMessages();
    const rpDom = !!document.querySelector('.nino-hud');
    document.querySelectorAll('.nino-hud').forEach(n => n.remove());
    currentCharacter = Object.assign({}, currentCharacter, { mode: 'code' });
    renderMessages();
    const codeDom = !!document.querySelector('.nino-hud');
    return { code: /NINO_CARD/.test(code) && /"stop":true/.test(code), rp: /NINO_CARD/.test(rp) && /\[\[END\]\]/.test(rp), rpDom, codeDom };
  });
  ok(p.code, 'the code prompt carries the card format and the stop key');
  ok(p.rp, 'the roleplay prompt carries the card format and the stop marker');
  ok(p.rpDom, 'a roleplay bubble shows the card');
  ok(p.codeDom, 'a code-mode bubble shows the card');
  console.log('== option click');
  const c = await P.evaluate(async () => {
    let clicks = 0;
    document.getElementById('btn-send').addEventListener('click', () => clicks++);
    const o = document.querySelector('.nino-hud .opt-btn[data-choice="5"]');
    if (!o) return { err: 'no-card' };
    o.click();
    await new Promise(r => setTimeout(r, 400));
    return { clicks, sent: session.messages.some(m => m.sender === 'user' && /เลือกข้อ 5: NINO SHOP/.test(m.text || '')) };
  });
  ok(c.clicks === 1 && c.sent, 'clicking an option sends it as the next message (' + JSON.stringify(c) + ')');
  console.log('== roleplay stops by itself');
  const run = (seq) => P.evaluate(async (seq) => {
    window.providerHasKey = () => true;
    window.rpLenSpec = () => ({ key: 'long', minChars: 2000, ext: 2, paras: '6-9', label: 'ยาว' });
    let turnCalls = 0;
    window.geminiGenerate = async function (a) {
      const last = (a.contents[a.contents.length - 1].parts[0].text || '');
      if (!/user_single_message/.test(last)) return '';
      const s = seq[Math.min(turnCalls, seq.length - 1)];
      turnCalls++;
      if (s[0] && a.onChunk) a.onChunk(s[0]);
      _lastFinishReason = s[1];
      return s[0];
    };
    currentCharacter = Object.assign({}, currentCharacter || {}, { id: 't1', name: 'T', mode: 'roleplay' });
    await runRoleplayTurn('ทดสอบ');
    return { turnCalls };
  }, seq);
  let s = await run([['คำตอบสั้น [[END]]', 'STOP']]);
  ok(s.turnCalls === 1, 'a reply that ends with [[END]] is not stretched to the length target');
  const longer = 'ส่วนขยายที่ยาวพอจะนับว่าเป็นการเขียนเพิ่มจริง ไม่ใช่แค่คำสั้นๆ';
  s = await run([['คำตอบสั้น', 'STOP'], [longer, 'STOP'], [longer + '2', 'STOP']]);
  ok(s.turnCalls === 3, 'without the marker the old length feedback still applies');
  console.log('== code mode stops by itself');
  const k = (seq, text) => P.evaluate(async ([seq, text]) => {
    window.providerHasKey = () => true;
    localStorage.setItem('nino.focus', 'n');
    let calls = 0;
    window.geminiGenerate = async function (a) { const s = seq[Math.min(calls, seq.length - 1)]; calls++; _lastFinishReason = 'STOP'; if (a.onChunk) a.onChunk(s); return s; };
    currentCharacter = Object.assign({}, currentCharacter || {}, { mode: 'code' });
    let res = null, err = '';
    try { res = await orchestratorRun(text); } catch (e) { err = String(e && e.message || e); }
    return { calls, done: res && res.done, reply: res && String(res.reply || '').slice(0, 60), err };
  }, [seq, text]);
  const j = (o) => JSON.stringify(Object.assign({ reasoning: 'r', thinking: 't', action: 'explain', reply: '', checklist: [], tool_call: null, final: '', done: false }, o));
  let q = await k([j({ reply: 'อธิบายเสร็จแล้ว', stop: true })], 'แก้สีปุ่มส่งในแอปให้เป็นชมพู');
  ok(q.calls === 1 && q.done, 'stop:true ends the task after one call (got ' + q.calls + ', ' + q.err + ')');
  q = await k([j({ reply: 'ตอบแล้ว ไม่มีอะไรค้าง' })], 'แก้สีปุ่มส่งในแอปให้เป็นชมพู');
  ok(q.calls === 1 && q.done, 'with nothing pending and no tool call the app-edit loop is not forced to continue (got ' + q.calls + ')');
  await h.close();
  console.log('\npassed ' + pass + ', failed ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
