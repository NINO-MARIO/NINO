// โมเดลภาษาในเครื่อง (js/local-llm.js) ในเบราว์เซอร์จริง โดยใช้ตัวปลอมของ wllama (ไม่มีเครือข่าย)
// สองโมเดลให้เลือก (Gemma 3 270M IQ2_XXS เป็นค่าเริ่มต้น, Qwen2.5-0.5B Q2_K) ปุ่มอยู่ในแท็บ LLM ของ NINO Console (>_)
// ตรวจ: ไม่โหลดก่อนยินยอม, แท็บ LLM บอกขนาดและใบอนุญาต, ยินยอมแล้วโหลดและตอบแทน API,
// noLocal ไม่ใช้โมเดล, ลบได้, ยินยอมเก่าจากไฟล์อื่นไม่นับ, จำการยินยอมหลังรีโหลด, ตัดข้อความยาว,
// โหลดค้างเกินเวลาถูกยกเลิก, โหลดไม่สำเร็จเพราะหน่วยความจำมีข้อความไทย, RAM น้อยไม่เริ่มโหลด,
// การโหลดที่แอปปิดกลางคันไม่โหลดเองรอบถัดไป, นาเดียร์ถูกส่ง noLocal
const fs = require('fs');
const path = require('path');
const H = require('./harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
const FLOOR = 49;

const FAKE = `
export class Wllama {
  constructor(paths, opts) { window.__wl = { paths: paths, opts: opts }; }
  async loadModelFromHF(m, c) {
    window.__loadCalls = (window.__loadCalls || 0) + 1;
    window.__loadArgs = { m: m, n_threads: c && c.n_threads };
    if (window.__oom) throw new Error('out of memory while allocating buffer');
    if (window.__stall) return new Promise(() => {});
    for (const f of [0.3, 0.7, 1]) {
      c.progressCallback({ loaded: f * 88202080, total: 88202080 });
      await new Promise(r => setTimeout(r, 40));
    }
  }
  async createChatCompletion(o) {
    window.__lastMsgs = o.messages;
    return { choices: [{ message: { content: window.__reply || 'ตอบจากโมเดลในเครื่อง' } }] };
  }
  async exit() { window.__exits = (window.__exits || 0) + 1; }
}`;

(async () => {
  console.log('== โมเดลภาษาในเครื่อง (Gemma/Qwen): แท็บ LLM, ยินยอม, โหลด, ตอบแทน API, noLocal, ลบ, ความปลอดภัยการโหลด');
  const h = await H.start();
  const P = h.page;
  await h.ctx.route(u => u.href === 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js',
    r => r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE }));

  const gen = (opts) => P.evaluate((o) => geminiGenerate(Object.assign({
    systemInstruction: 'ระบบ', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], localOk: true
  }, o)).then(t => 'ok:' + t, e => 'err:' + e.message), opts || {});
  const llmText = () => P.evaluate(() => { const p = document.getElementById('nc-p-llm'); return p ? p.textContent : ''; });

  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1500);
  // คอนโซลสร้าง DOM ตอนเปิดครั้งแรก จึงเปิดแล้วปิดก่อนตรวจแท็บ
  await P.evaluate(() => ninoConsole.open('llm'));
  await sleep(150);
  await P.evaluate(() => ninoConsole.close());
  await sleep(100);

  // 0) คอนโซลมีแท็บ LLM พร้อมไอคอนผี
  ok(await P.evaluate(() => !!window.NINOLocalLLM), 'NINOLocalLLM exposed');
  ok(await P.evaluate(() => document.querySelectorAll('#nino-console .nc-tabs button').length === 5), 'console has five tabs');
  ok(await P.evaluate(() => { const b = [...document.querySelectorAll('#nino-console .nc-tabs button')].pop(); return b.textContent.indexOf('LLM') >= 0 && !!b.querySelector('svg'); }), 'LLM tab has a ghost svg icon');
  ok(await P.evaluate(() => NINOLocalLLM.status().state === 'off' && !NINOLocalLLM.consented()), 'starts off and not consented');
  ok(await P.evaluate(() => NINOLocalLLM.MODELS.length === 2 && NINOLocalLLM.MODELS.map(m => m.id).join() === 'gemma3_270m,qwen25_05b'), 'two models offered: Gemma and Qwen');
  ok(await P.evaluate(() => NINOLocalLLM.MODEL.id === 'gemma3_270m' && NINOLocalLLM.MODEL.file === 'gemma-3-270m-it-qat-UD-IQ2_XXS.gguf'), 'default is the smallest Gemma build');
  ok(await P.evaluate(() => NINOLocalLLM.MODEL.license === 'Gemma Terms of Use' && NINOLocalLLM.MODEL.repo === 'unsloth/gemma-3-270m-it-qat-GGUF'), 'Gemma repo and terms are set');
  ok(await P.evaluate(() => typeof NINOLocalLLM.VARIANTS === 'undefined' && typeof NINOLocalLLM.setVariant === 'undefined'), 'no variant switching remains');

  // 1) ไม่มี API และยังไม่ยินยอม: ไม่โหลด เปิดแท็บ LLM ของคอนโซล
  let r = await gen();
  ok(r === 'err:ยังไม่ได้ตั้งค่า API Key', 'without consent: API error, got ' + r);
  ok(await P.evaluate(() => !window.__loadCalls), 'nothing downloaded before consent');
  ok(await P.evaluate(() => ninoConsole.isOpen() && ninoConsole.tab() === 'llm'), 'no-consent call opens the LLM tab');
  let t = await llmText();
  ok(t.indexOf('180 MB') >= 0 && t.indexOf('Gemma Terms of Use') >= 0, 'tab shows size and license');
  ok(t.indexOf('โหมด 2: ปกติ') >= 0 && t.indexOf('มิ้มไม่ใช้') >= 0, 'tab explains mode 2 and that Mim does not use it by default');
  ok(await P.evaluate(() => !document.getElementById('nino-llm-ov')), 'old overlay is gone');

  // 2) ยินยอมแล้วดาวน์โหลดจากแท็บ LLM
  await P.click('#nc-p-llm >> text=ยืนยันและดาวน์โหลด');
  await sleep(700);
  ok(await P.evaluate(() => NINOLocalLLM.status().state === 'ready'), 'ready after consent');
  ok(await P.evaluate(() => window.__loadCalls === 1), 'loaded exactly once');
  ok(await P.evaluate(() => window.__loadArgs.m.file === 'gemma-3-270m-it-qat-UD-IQ2_XXS.gguf' && window.__loadArgs.m.repo === 'unsloth/gemma-3-270m-it-qat-GGUF'), 'loads the pinned Gemma file');
  ok(await P.evaluate(() => window.__loadArgs.n_threads === 1), 'single thread when not cross-origin isolated');
  ok(await P.evaluate(() => window.__wl.paths.default.indexOf('@wllama/wllama@3.8.1/esm/wasm/wllama.wasm') > 0), 'wasm path pinned to 3.8.1');
  ok(await P.evaluate(() => !localStorage.getItem('nino.llm.loading') && !sessionStorage.getItem('nino.llm.loading')), 'loading marker cleared after success');

  // 3) ตอบแทน API เมื่อไม่มีคีย์
  r = await gen();
  ok(r === 'ok:ตอบจากโมเดลในเครื่อง', 'local model answers when no key, got ' + r);
  ok(await P.evaluate(() => window.__lastMsgs[0].role === 'system' && window.__lastMsgs[window.__lastMsgs.length - 1].content === 'hi'), 'system and user messages passed');

  // 3a) ชั้นโค้ด: กติกาการตอบถูกส่งทุกครั้ง และคำตอบที่ไม่ผ่านการตรวจไม่ถูกส่งให้ผู้ใช้
  ok(await P.evaluate(() => window.__lastMsgs[0].content.indexOf('กติกาการตอบ') >= 0), 'code rules sent with system prompt');
  await P.evaluate(() => { window.__reply = '```js\nfunction (\n```'; });
  r = await gen();
  ok(r.indexOf('err:') === 0 && r.indexOf('ไม่ผ่านการตรวจ') >= 0, 'bad js reply is not delivered, got ' + r);
  await P.evaluate(() => { window.__reply = 'ฉันคือ Qwen ค่ะ'; });
  r = await gen();
  ok(r.indexOf('err:') === 0 && r.indexOf('ชื่อโมเดล') >= 0, 'other model name is not delivered, got ' + r);
  await P.evaluate(() => { window.__reply = '```js\nconst a = 1;\n```'; });
  r = await gen();
  ok(r.indexOf('ok:') === 0 && r.indexOf('const a = 1;') >= 0, 'valid js reply delivered, got ' + r);
  await P.evaluate(() => { window.__reply = null; });

  // 3b) งานเสริม (ตั้งชื่อหัวข้อ สรุปโน้ต) ไม่ส่ง localOk จึงไม่ใช้โมเดลแม้มีอยู่แล้ว
  r = await gen({ localOk: false });
  ok(r === 'err:ยังไม่ได้ตั้งค่า API Key', 'side features without localOk never use the model, got ' + r);

  // 4) noLocal ต้องไม่ใช้โมเดล
  r = await gen({ noLocal: true });
  ok(r === 'err:ยังไม่ได้ตั้งค่า API Key', 'noLocal does not use the model, got ' + r);

  // 5) ตัดข้อความยาว และข้ามรูปภาพ
  const trimmed = await P.evaluate(() => NINOLocalLLM.toMessages('sys', [
    { role: 'user', parts: [{ text: 'a'.repeat(5000) }] },
    { role: 'model', parts: [{ text: 'b'.repeat(5000) }] },
    { role: 'user', parts: [{ text: 'last' }] }
  ]));
  ok(trimmed.length === 3 && trimmed[0].role === 'system' && trimmed[1].content[0] === 'b' && trimmed[2].content === 'last', 'long history is trimmed, keeps system and newest messages');
  const imgOnly = await P.evaluate(() => NINOLocalLLM.toMessages('', [{ role: 'user', parts: [{ inlineData: {} }] }]));
  ok(imgOnly.length === 0, 'image-only turn is skipped');

  // 6) ลบได้: ยกเลิกการยินยอมและปิดตัวรัน
  await P.evaluate(() => NINOLocalLLM.forget());
  await sleep(100);
  ok(await P.evaluate(() => NINOLocalLLM.status().state === 'off' && !NINOLocalLLM.consented() && window.__exits === 1), 'forget resets state and exits runner');
  r = await gen();
  ok(r === 'err:ยังไม่ได้ตั้งค่า API Key', 'after forget no local answer, got ' + r);

  // 7) ค่ายินยอมจากไฟล์อื่น (ค่าเก่า '1') ต้องไม่นับ
  await P.evaluate(() => localStorage.setItem('nino.llm.consent', '1'));
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1200);
  ok(await P.evaluate(() => !NINOLocalLLM.consented()), 'legacy consent value is not treated as consent');

  // 8) จำการยินยอมหลังรีโหลด: โหลดเองได้ แล้วตอบได้ในรอบถัดไป
  await P.evaluate(() => localStorage.setItem('nino.llm.consent', 'gemma3_270m'));
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1200);
  ok(await P.evaluate(() => NINOLocalLLM.consented() && NINOLocalLLM.canAutoLoad()), 'consent survives reload and allows auto-load');
  r = await gen();
  ok(r === 'err:กำลังเตรียมโมเดลในเครื่อง ลองอีกครั้งเมื่อโหลดเสร็จ', 'first call after reload starts loading, got ' + r);
  await sleep(700);
  ok(await P.evaluate(() => NINOLocalLLM.status().state === 'ready'), 'auto-loads after reload with consent');
  r = await gen();
  ok(r === 'ok:ตอบจากโมเดลในเครื่อง', 'answers after auto-load, got ' + r);

  // 9) การโหลดที่แอปปิดกลางคัน: รอบถัดไปไม่โหลดเอง ต้องกดเอง
  await P.evaluate(() => NINOLocalLLM.forget());
  await sleep(100);
  await P.evaluate(() => { localStorage.setItem('nino.llm.consent', 'gemma3_270m'); sessionStorage.setItem('nino.llm.loading', JSON.stringify({ id: 'gemma3_270m', t: Date.now() })); });
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1200);
  ok(await P.evaluate(() => NINOLocalLLM.interrupted() && !NINOLocalLLM.canAutoLoad()), 'interrupted load is remembered and blocks auto-load');
  ok(await P.evaluate(() => !sessionStorage.getItem('nino.llm.loading')), 'stale marker moved out of the way');
  const callsBefore = await P.evaluate(() => window.__loadCalls || 0);
  r = await gen();
  ok(r === 'err:ยังไม่ได้ตั้งค่า API Key', 'interrupted: no auto-download, got ' + r);
  await sleep(200);
  ok(await P.evaluate((n) => (window.__loadCalls || 0) === n, callsBefore), 'interrupted: download not started by the chat call');
  t = await llmText();
  ok(t.indexOf('การโหลดครั้งก่อนไม่สำเร็จ') >= 0, 'tab explains the interrupted load');
  await P.click('#nc-p-llm >> text=ยืนยันและดาวน์โหลด');
  await sleep(700);
  ok(await P.evaluate(() => NINOLocalLLM.status().state === 'ready' && !NINOLocalLLM.interrupted()), 'manual retry clears the interrupted flag and loads');

  // 10) โหลดค้างเกินเวลาถูกยกเลิก
  await P.evaluate(() => { NINOLocalLLM.forget(); });
  await sleep(100);
  await P.evaluate(() => { window.__stall = true; NINOLocalLLM.stallMs = 300; localStorage.setItem('nino.llm.consent', 'gemma3_270m'); });
  await P.evaluate(() => NINOLocalLLM.load().catch(() => {}));
  await sleep(700);
  const st = await P.evaluate(() => NINOLocalLLM.status());
  ok(st.state === 'error' && st.error.indexOf('ค้างเกิน') >= 0, 'stalled download is cancelled with a message, got ' + st.state + ' ' + st.error);
  ok(await P.evaluate(() => !sessionStorage.getItem('nino.llm.loading')), 'stalled download clears the marker');
  await P.evaluate(() => { window.__stall = false; NINOLocalLLM.stallMs = 90000; });

  // 11) หน่วยความจำไม่พอ: ข้อความไทยที่เข้าใจได้
  await P.evaluate(() => NINOLocalLLM.forget());
  await sleep(100);
  await P.evaluate(() => { window.__oom = true; localStorage.setItem('nino.llm.consent', 'gemma3_270m'); });
  await P.evaluate(() => NINOLocalLLM.load().catch(() => {}));
  await sleep(300);
  const oom = await P.evaluate(() => NINOLocalLLM.status());
  ok(oom.state === 'error' && oom.error === 'หน่วยความจำไม่พอสำหรับโมเดลนี้', 'out-of-memory becomes a Thai message, got ' + oom.error);
  await P.evaluate(() => { window.__oom = false; });

  // 12) RAM น้อยกว่า 2 GB ไม่เริ่มโหลด
  await P.evaluate(() => NINOLocalLLM.forget());
  await sleep(100);
  await P.evaluate(() => Object.defineProperty(navigator, 'deviceMemory', { get: () => 1, configurable: true }));
  const before = await P.evaluate(() => window.__loadCalls || 0);
  await P.evaluate(() => NINOLocalLLM.load().catch(() => {}));
  await sleep(200);
  const lowRam = await P.evaluate(() => NINOLocalLLM.status());
  ok(lowRam.state === 'error' && lowRam.error.indexOf('RAM') >= 0, 'low RAM refuses to start, got ' + lowRam.error);
  ok(await P.evaluate((n) => (window.__loadCalls || 0) === n, before), 'low RAM: no download started');
  await P.evaluate(() => { delete navigator.deviceMemory; });

  // 13) นาเดียร์ถูกส่ง noLocal: ตรวจที่ต้นทางของ mim.js
  const mimSrc = fs.readFileSync(path.join(H.ROOT, 'mim', 'mim.js'), 'utf8');
  ok(mimSrc.indexOf('noLocal: true') > 0, 'Nadia generate wrapper passes noLocal');

  // 15) เลือกโมเดล: Qwen แยกการยินยอม, เปลี่ยนไม่ได้ระหว่างดาวน์โหลด, จำการเลือกหลังรีโหลด
  await P.evaluate(() => NINOLocalLLM.forget());
  await sleep(100);
  ok(await P.evaluate(() => NINOLocalLLM.setModel('qwen25_05b') === true && NINOLocalLLM.MODEL.id === 'qwen25_05b'), 'switches to Qwen');
  ok(await P.evaluate(() => !NINOLocalLLM.consented() && NINOLocalLLM.status().state === 'off'), 'Qwen needs its own consent');
  ok(await P.evaluate(() => NINOLocalLLM.setModel('nope') === false), 'unknown model id is refused');
  await P.evaluate(() => { localStorage.setItem('nino.llm.consent', 'gemma3_270m'); });
  ok(await P.evaluate(() => !NINOLocalLLM.consented()), 'Gemma consent does not carry over to Qwen');
  t = await llmText();
  ok(t.indexOf('415 MB') >= 0 && t.indexOf('apache-2.0') >= 0, 'tab shows Qwen size and license after switching');
  await P.evaluate(() => { localStorage.setItem('nino.llm.consent', 'qwen25_05b'); });
  await P.evaluate(() => NINOLocalLLM.load().catch(() => {}));
  await sleep(200);
  ok(await P.evaluate(() => window.__loadArgs.m.file === 'qwen2.5-0.5b-instruct-q2_k.gguf' && window.__loadArgs.m.repo === 'Qwen/Qwen2.5-0.5B-Instruct-GGUF'), 'loads the Qwen file when Qwen is selected');
  await sleep(700);
  ok(await P.evaluate(() => NINOLocalLLM.status().state === 'ready'), 'Qwen becomes ready');
  r = await gen();
  ok(r === 'ok:ตอบจากโมเดลในเครื่อง', 'Qwen answers after loading, got ' + r);
  const exitsBefore = await P.evaluate(() => window.__exits || 0);
  ok(await P.evaluate(() => NINOLocalLLM.setModel('gemma3_270m') === true && NINOLocalLLM.status().state === 'off'), 'switching models resets the runner state');
  ok(await P.evaluate((n) => (window.__exits || 0) === n + 1, exitsBefore), 'switching exits the previous runner exactly once');
  await P.evaluate(() => NINOLocalLLM.load().catch(() => {}));
  await sleep(700);
  ok(await P.evaluate(() => window.__loadArgs.m.file === 'gemma-3-270m-it-qat-UD-IQ2_XXS.gguf' && NINOLocalLLM.status().state === 'ready'), 'after switching back, download fetches Gemma (not the old Qwen promise)');
  await P.evaluate(() => { NINOLocalLLM.forget(); localStorage.setItem('nino.llm.consent', 'qwen25_05b'); NINOLocalLLM.setModel('qwen25_05b'); });
  await P.evaluate(() => { window.__stall = true; NINOLocalLLM.stallMs = 60000; NINOLocalLLM.load().catch(() => {}); });
  await sleep(150);
  ok(await P.evaluate(() => NINOLocalLLM.setModel('gemma3_270m') === false && NINOLocalLLM.MODEL.id === 'qwen25_05b'), 'cannot switch model during a download');
  await P.evaluate(() => { window.__stall = false; NINOLocalLLM.stallMs = 90000; NINOLocalLLM.forget(); });
  await sleep(100);
  await P.evaluate(() => { localStorage.setItem('nino.llm.model', 'qwen25_05b'); });
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1200);
  ok(await P.evaluate(() => NINOLocalLLM.MODEL.id === 'qwen25_05b'), 'chosen model survives reload');
  await P.evaluate(() => { localStorage.setItem('nino.llm.model', 'unknown'); });
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1200);
  ok(await P.evaluate(() => NINOLocalLLM.MODEL.id === 'gemma3_270m'), 'unknown saved model falls back to the first');
  await P.evaluate(() => { localStorage.removeItem('nino.llm.model'); });

  // 14) ล้างสถานะก่อนจบ
  await P.evaluate(() => NINOLocalLLM.forget());
  await sleep(100);

  ok(h.errors.length === 0, 'no page errors: ' + JSON.stringify(h.errors.slice(0, 3)));
  await h.close();
  const total = pass + fail;
  console.log('local-llm: ' + pass + '/' + total + ' passed, ' + fail + ' failed (ต้องผ่านอย่างน้อย ' + FLOOR + ')');
  process.exit(fail || total < FLOOR ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
