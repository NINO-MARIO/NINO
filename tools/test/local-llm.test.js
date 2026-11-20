// โมเดลภาษาในเครื่อง (js/local-llm.js) ในเบราว์เซอร์จริง โดยใช้ตัวปลอมของ wllama (ไม่มีเครือข่าย)
// โมเดลเดียว: SmolLM2-135M Q2_K (88,202,080 ไบต์) ปุ่มอยู่ในแท็บ LLM ของ NINO Console (>_)
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
  console.log('== โมเดลภาษาในเครื่อง Q2_K: แท็บ LLM, ยินยอม, โหลด, ตอบแทน API, noLocal, ลบ, ความปลอดภัยการโหลด');
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
  ok(await P.evaluate(() => NINOLocalLLM.MODEL.bytes === 88202080 && NINOLocalLLM.MODEL.file === 'SmolLM2-135M-Instruct-Q2_K.gguf'), 'the only model is Q2_K with exact bytes');
  ok(await P.evaluate(() => NINOLocalLLM.MODEL.license === 'apache-2.0' && NINOLocalLLM.MODEL.repo === 'bartowski/SmolLM2-135M-Instruct-GGUF'), 'license and repo are exact');
  ok(await P.evaluate(() => typeof NINOLocalLLM.VARIANTS === 'undefined' && typeof NINOLocalLLM.setVariant === 'undefined'), 'no variant switching remains');

  // 1) ไม่มี API และยังไม่ยินยอม: ไม่โหลด เปิดแท็บ LLM ของคอนโซล
  let r = await gen();
  ok(r === 'err:ยังไม่ได้ตั้งค่า API Key', 'without consent: API error, got ' + r);
  ok(await P.evaluate(() => !window.__loadCalls), 'nothing downloaded before consent');
  ok(await P.evaluate(() => ninoConsole.isOpen() && ninoConsole.tab() === 'llm'), 'no-consent call opens the LLM tab');
  let t = await llmText();
  ok(t.indexOf('88 MB') >= 0 && t.indexOf('apache-2.0') >= 0, 'tab shows size and license');
  ok(t.indexOf('โหมด 2: ปกติ') >= 0 && t.indexOf('มิ้มไม่ใช้') >= 0, 'tab explains mode 2 and that Mim does not use it by default');
  ok(await P.evaluate(() => !document.getElementById('nino-llm-ov')), 'old overlay is gone');

  // 2) ยินยอมแล้วดาวน์โหลดจากแท็บ LLM
  await P.click('#nc-p-llm >> text=ยืนยันและดาวน์โหลด');
  await sleep(700);
  ok(await P.evaluate(() => NINOLocalLLM.status().state === 'ready'), 'ready after consent');
  ok(await P.evaluate(() => window.__loadCalls === 1), 'loaded exactly once');
  ok(await P.evaluate(() => window.__loadArgs.m.file === 'SmolLM2-135M-Instruct-Q2_K.gguf' && window.__loadArgs.m.repo === 'bartowski/SmolLM2-135M-Instruct-GGUF'), 'loads the pinned Q2_K file');
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
  await P.evaluate(() => localStorage.setItem('nino.llm.consent', 'q2_k'));
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
  await P.evaluate(() => { localStorage.setItem('nino.llm.consent', 'q2_k'); sessionStorage.setItem('nino.llm.loading', JSON.stringify({ id: 'q2_k', t: Date.now() })); });
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
  await P.evaluate(() => { window.__stall = true; NINOLocalLLM.stallMs = 300; localStorage.setItem('nino.llm.consent', 'q2_k'); });
  await P.evaluate(() => NINOLocalLLM.load().catch(() => {}));
  await sleep(700);
  const st = await P.evaluate(() => NINOLocalLLM.status());
  ok(st.state === 'error' && st.error.indexOf('ค้างเกิน') >= 0, 'stalled download is cancelled with a message, got ' + st.state + ' ' + st.error);
  ok(await P.evaluate(() => !sessionStorage.getItem('nino.llm.loading')), 'stalled download clears the marker');
  await P.evaluate(() => { window.__stall = false; NINOLocalLLM.stallMs = 90000; });

  // 11) หน่วยความจำไม่พอ: ข้อความไทยที่เข้าใจได้
  await P.evaluate(() => NINOLocalLLM.forget());
  await sleep(100);
  await P.evaluate(() => { window.__oom = true; localStorage.setItem('nino.llm.consent', 'q2_k'); });
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

  // 14) ล้างสถานะก่อนจบ
  await P.evaluate(() => NINOLocalLLM.forget());
  await sleep(100);

  ok(h.errors.length === 0, 'no page errors: ' + JSON.stringify(h.errors.slice(0, 3)));
  await h.close();
  const total = pass + fail;
  console.log('local-llm: ' + pass + '/' + total + ' passed, ' + fail + ' failed (ต้องผ่านอย่างน้อย ' + FLOOR + ')');
  process.exit(fail || total < FLOOR ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
