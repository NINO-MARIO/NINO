// ศูนย์กลาง LLM (js/llm-hub.js) ในเบราว์เซอร์จริง: เส้นทาง (อัตโนมัติ / API / โมเดล), คิว, แคช, อุ่นเครื่อง,
// พรีเซ็ต, log (ไม่เก็บข้อความ), ตรวจระบบ, หน้าจอในแท็บ LLM ของคอนโซล, และไม่แตะความจำของมิ้ม/นาเดียร์
// ใช้ตัวปลอมของ wllama และไม่มีเครือข่ายจริง
const H = require('./harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
const FLOOR = 40;

const FAKE = `
export class Wllama {
  constructor(paths, opts) { window.__wl = { paths: paths, opts: opts }; }
  async loadModelFromHF(m, c) {
    window.__loadCalls = (window.__loadCalls || 0) + 1;
    window.__loadArgs = { m: m };
    for (const f of [0.5, 1]) { c.progressCallback({ loaded: f * 1000, total: 1000 }); await new Promise(r => setTimeout(r, 20)); }
  }
  async createChatCompletion(o) {
    window.__ccCalls = (window.__ccCalls || 0) + 1;
    window.__inflight = (window.__inflight || 0) + 1;
    window.__maxInflight = Math.max(window.__maxInflight || 0, window.__inflight);
    window.__lastMax = o.max_tokens;
    window.__lastMsgs = o.messages;
    try {
      await new Promise(r => setTimeout(r, 40));
      return { choices: [{ message: { content: window.__reply || 'ตอบจากโมเดลในเครื่อง' } }], usage: { completion_tokens: 7 } };
    } finally { window.__inflight--; }
  }
  async exit() { window.__exits = (window.__exits || 0) + 1; }
}`;

(async () => {
  console.log('== llm-hub: เส้นทาง, คิว, แคช, อุ่นเครื่อง, พรีเซ็ต, log, ตรวจระบบ, หน้าจอ');
  const h = await H.start();
  const P = h.page;
  await h.ctx.route(u => u.href === 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js',
    r => r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE }));
  let apiHits = 0;
  const apiUrls = [];
  await h.ctx.route(u => u.hostname === 'generativelanguage.googleapis.com', r => { apiHits++; apiUrls.push(r.request().url()); r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); });

  const gen = (opts) => P.evaluate((o) => geminiGenerate(Object.assign({
    systemInstruction: 'ระบบ', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], localOk: true
  }, o)).then(t => 'ok:' + t, e => 'err:' + e.message), opts || {});
  const snapNonLlm = () => P.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.indexOf('nino.llm') === 0 || k === 'nino-config-v3') continue;
      o[k] = localStorage.getItem(k);
    }
    return o;
  });
  const setCfgKey = (key) => P.evaluate((k) => { const c = getCfg(); c.apiKey = k; c.provider = 'gemini'; setCfg(c); }, key);
  const resetAll = () => P.evaluate(() => { NINOLocalLLM.forget(); ninoLLMHub.setRoute('auto'); ninoLLMHub.setPreset('normal'); ninoLLMHub.clearLog(); });

  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1500);
  const cfgBefore = await P.evaluate(() => localStorage.getItem('nino-config-v3'));
  const nonLlmBefore = await snapNonLlm();

  // A) ชั้นเชื่อมต่อ
  ok(await P.evaluate(() => !!window.ninoLLMHub && typeof ninoLLMHub.pick === 'function'), 'hub exposed');
  ok(await P.evaluate(() => ninoLLMHub.route() === 'auto' && ninoLLMHub.preset() === 'normal'), 'defaults: route auto, preset normal');
  ok(await P.evaluate(() => Object.keys(ninoLLMHub.ROUTES).join() === 'auto,api,model'), 'three routes offered');

  // B) อัตโนมัติ ไม่มีคีย์ ไม่มีโมเดล = ข้อความเดิมของแอป
  await resetAll();
  await setCfgKey('');
  let r = await gen();
  ok(r === 'err:ยังไม่ได้ตั้งค่า API Key', 'auto with nothing: original message, got ' + r);
  ok(await P.evaluate(() => !window.__loadCalls), 'auto with nothing: no download');

  // C) โหมด API ไม่มีคีย์: โมเดลถูกปิด ไม่ดาวน์โหลด
  await P.evaluate(() => ninoLLMHub.setRoute('api'));
  r = await gen();
  ok(r.indexOf('err:') === 0 && r.indexOf('โหมด API ยังไม่มี API Key') >= 0, 'api route without key: no model fallback, got ' + r);
  ok(await P.evaluate(() => !window.__loadCalls), 'api route: model never loaded');
  ok(await P.evaluate(() => ninoLLMHub.pick({ localOk: true }).kind === 'off'), 'api route without key picks off');

  // D) โหมดโมเดล ยังไม่ยินยอม: ไม่โหลด บอกให้ไปแท็บ LLM
  await P.evaluate(() => ninoLLMHub.setRoute('model'));
  r = await gen();
  ok(r.indexOf('err:') === 0 && r.indexOf('โหมดโมเดลในเครื่องยังไม่พร้อม') >= 0, 'model route without consent: clear message, got ' + r);
  ok(await P.evaluate(() => !window.__loadCalls), 'model route without consent: no download');

  // E) โหมดโมเดล ยินยอมแล้ว: โหลดตามต้องการและตอบ
  await P.evaluate(() => localStorage.setItem('nino.llm.consent', 'gemma3_270m'));
  r = await gen({ contents: [{ role: 'user', parts: [{ text: 'สวัสดี' }] }] });
  ok(r === 'ok:ตอบจากโมเดลในเครื่อง', 'model route with consent answers after on-demand load, got ' + r);
  ok(await P.evaluate(() => window.__loadCalls === 1 && NINOLocalLLM.status().state === 'ready'), 'loaded exactly once');
  ok(await P.evaluate(() => ninoLLMHub.log().some(e => e.kind === 'call' && e.backend === 'model' && e.ok)), 'call logged with backend model');
  await sleep(200); // อุ่นเครื่องทำงานต่อจากคำตอบแรกในคิว
  ok(await P.evaluate(() => ninoLLMHub.log().some(e => e.kind === 'warmup' && e.ok)), 'warm-up ran after the model became ready and is logged');

  // F) โหมดโมเดลทั้งที่มี API: API ถูกปิด ไม่ยิงเครือข่าย Gemini
  await setCfgKey('fake-key');
  const hitsBefore = apiHits;
  r = await gen();
  ok(r === 'ok:ตอบจากโมเดลในเครื่อง', 'model route with API key still answers from the model, got ' + r);
  ok(apiHits === hitsBefore, 'model route never calls the API');
  ok(await P.evaluate(() => ninoLLMHub.pick({}).kind === 'model'), 'pick: model route with key picks model');

  // F2) ห่วงโซ่ API ต้องไม่ถูกเปลี่ยนเป็นสตรีมโดยที่ผู้เรียกไม่ได้ขอ (เคยเป็นข้อบกพร่องใน r41 แก้แล้ว)
  await P.evaluate(() => ninoLLMHub.setRoute('api'));
  await setCfgKey('fake-key');
  apiUrls.length = 0;
  await gen();
  ok(apiUrls.length >= 1 && apiUrls.every(u => u.indexOf(':generateContent') >= 0 && u.indexOf('stream') < 0), 'api call without onChunk uses generateContent, not the stream endpoint');
  apiUrls.length = 0;
  await P.evaluate(() => geminiGenerate({ systemInstruction: 'ระบบ', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], onChunk: function () {} }).catch(() => 'x'));
  ok(apiUrls.length >= 1 && apiUrls.every(u => u.indexOf('streamGenerateContent') >= 0), 'api call with onChunk uses the stream endpoint as before');
  await setCfgKey('');
  await P.evaluate(() => ninoLLMHub.setRoute('model'));

  // G) โหมด API: มีคีย์ = ห่วงโซ่ API (เลือกทาง ไม่ยิงจริง); พี่นาเดียร์ใช้ API เสมอ
  await setCfgKey('fake-key');
  await P.evaluate(() => ninoLLMHub.setRoute('api'));
  ok(await P.evaluate(() => ninoLLMHub.pick({}).kind === 'prev'), 'api route with key picks the API chain');
  await P.evaluate(() => ninoLLMHub.setRoute('model'));
  ok(await P.evaluate(() => ninoLLMHub.pick({ noLocal: true }).kind === 'prev'), 'noLocal (Nadia) never picks the model');
  await P.evaluate(() => ninoLLMHub.setRoute('auto'));
  ok(await P.evaluate(() => ninoLLMHub.pick({ localOk: true }).kind === 'prev'), 'auto with key uses the original chain');
  await setCfgKey('');
  ok(await P.evaluate(() => ninoLLMHub.pick({ localOk: true }).kind === 'model'), 'auto without key + ready model + localOk picks model');
  ok(await P.evaluate(() => ninoLLMHub.pick({ localOk: false }).kind === 'prev'), 'auto without localOk keeps the original behaviour');

  // H) พรีเซ็ต: เร็ว ตัดคำตอบและบริบท
  await P.evaluate(() => ninoLLMHub.setRoute('model'));
  const long = 'ก'.repeat(1500);
  const multi = [
    { role: 'user', parts: [{ text: long }] },
    { role: 'model', parts: [{ text: long }] },
    { role: 'user', parts: [{ text: 'last' }] }
  ];
  await P.evaluate(() => ninoLLMHub.setPreset('normal'));
  await gen({ contents: multi, maxTokens: 512 });
  const normalMax = await P.evaluate(() => window.__lastMax), normalMsgs = await P.evaluate(() => window.__lastMsgs.length);
  ok(normalMax === 512, 'normal preset keeps max output 512, got ' + normalMax);
  await P.evaluate(() => ninoLLMHub.setPreset('fast'));
  await gen({ contents: multi, maxTokens: 512 });
  const fastMax = await P.evaluate(() => window.__lastMax), fastMsgs = await P.evaluate(() => window.__lastMsgs.length);
  ok(fastMax === 200, 'fast preset caps max output at 200, got ' + fastMax);
  ok(fastMsgs < normalMsgs && fastMsgs >= 2, 'fast preset trims history (' + normalMsgs + ' -> ' + fastMsgs + ')');
  ok(await P.evaluate(() => window.__lastMsgs[window.__lastMsgs.length - 1].content === 'last'), 'fast preset keeps the newest message');

  // I) แคช: อุณหภูมิต่ำเท่านั้น และไม่เก็บ log ข้อความ
  await P.evaluate(() => { ninoLLMHub.setPreset('normal'); ninoLLMHub.clearLog(); });
  const cc0 = await P.evaluate(() => window.__ccCalls || 0);
  await gen({ temperature: 0.1, contents: [{ role: 'user', parts: [{ text: 'cache-q' }] }] });
  await gen({ temperature: 0.1, contents: [{ role: 'user', parts: [{ text: 'cache-q' }] }] });
  const cc1 = await P.evaluate(() => window.__ccCalls || 0);
  ok(cc1 - cc0 === 1, 'low temperature repeat is answered from cache (model calls ' + (cc1 - cc0) + ')');
  ok(await P.evaluate(() => ninoLLMHub.log().filter(e => e.kind === 'call').pop().cached === true), 'cache hit is marked in the log');
  await gen({ temperature: 0.7, contents: [{ role: 'user', parts: [{ text: 'cache-q' }] }] });
  await gen({ temperature: 0.7, contents: [{ role: 'user', parts: [{ text: 'cache-q' }] }] });
  const cc2 = await P.evaluate(() => window.__ccCalls || 0);
  ok(cc2 - cc1 === 2, 'high temperature is never cached (model calls ' + (cc2 - cc1) + ')');

  // J) คิว: เรียกพร้อมกันหลายงาน โมเดลตัวเดียวทำทีละงาน
  await P.evaluate(() => { window.__maxInflight = 0; });
  await Promise.all([1, 2, 3].map(i => gen({ temperature: 0.9, contents: [{ role: 'user', parts: [{ text: 'q' + i }] }] })));
  ok(await P.evaluate(() => window.__maxInflight === 1), 'concurrent calls run one at a time, max in flight ' + await P.evaluate(() => window.__maxInflight));

  // K) อุ่นเครื่องตรวจแล้วในข้อ E

  // L) log ไม่เก็บข้อความของผู้ใช้
  await gen({ temperature: 0.9, contents: [{ role: 'user', parts: [{ text: 'คำถามลับABC' }] }] });
  const stored = await P.evaluate(() => localStorage.getItem('nino.llm.log') || '');
  ok(stored.indexOf('ลับABC') < 0 && JSON.stringify(await P.evaluate(() => ninoLLMHub.log())).indexOf('ลับABC') < 0, 'log stores measurements only, never message text');
  ok(await P.evaluate(() => ninoLLMHub.log().every(e => e.t && e.backend && typeof e.ms === 'number')), 'every log entry has time, backend and ms');

  // M) สถิติ
  const st = await P.evaluate(() => ninoLLMHub.stats());
  ok(st.calls >= 5 && st.ok >= 5 && typeof st.p50 === 'number' && typeof st.p95 === 'number', 'stats computed: ' + JSON.stringify(st));
  ok(st.tps > 0, 'model tokens per second estimated from usage');

  // N) ตรวจระบบ
  await setCfgKey('');
  const items = await P.evaluate(async () => (await ninoLLMHub.check()).map(i => ({ name: i.name, ok: i.ok })));
  const byName = n => (items.find(i => i.name === n) || {}).ok;
  ok(byName('WebAssembly') === true, 'check: WebAssembly reported');
  ok(byName('ยินยอมโหลดโมเดล') === true, 'check: consent reported');
  ok(byName('โมเดลพร้อม') === true, 'check: model ready reported');
  ok(byName('ทดสอบตอบจริง (โมเดล)') === true, 'check: real answer test passes on a ready model');
  ok(byName('API') === false, 'check: no API key is reported as a failure, not hidden');
  ok(items.some(i => i.name === 'เส้นทางตอนนี้'), 'check: current route described');

  // O) หน้าจอในแท็บ LLM ของคอนโซล
  await P.evaluate(() => ninoConsole.open('llm'));
  await sleep(200);
  const clickBtn = (label) => P.evaluate((t) => {
    const b = [...document.querySelectorAll('#nino-console button')].find(x => x.textContent.trim() === t);
    if (!b) return false; b.click(); return true;
  }, label);
  ok(await P.evaluate(() => (document.getElementById('nino-console').textContent || '').indexOf('เส้นทาง LLM') >= 0), 'console LLM tab shows the route card');
  ok(await clickBtn('API อย่างเดียว'), 'route button found');
  await sleep(100);
  ok(await P.evaluate(() => ninoLLMHub.route() === 'api'), 'route button switches to api');
  ok(await clickBtn('เร็ว'), 'preset button found');
  await sleep(100);
  ok(await P.evaluate(() => ninoLLMHub.preset() === 'fast'), 'preset button switches to fast');
  ok(await clickBtn('โมเดลในเครื่องอย่างเดียว'), 'model route button found');
  await sleep(100);
  ok(await P.evaluate(() => ninoLLMHub.route() === 'model'), 'model route selected from the screen');
  ok(await clickBtn('ตรวจระบบ'), 'check button found');
  await sleep(1200);
  const checkText = await P.evaluate(() => (document.getElementById('nino-console').textContent || ''));
  ok(checkText.indexOf('WebAssembly') >= 0 && checkText.indexOf('เส้นทางตอนนี้') >= 0, 'check results are shown on screen');
  await P.evaluate(() => { const t = [...document.querySelectorAll('#nino-console textarea')].pop(); t.value = 'ทดสอบจากหน้าจอ'; t.dispatchEvent(new Event('input')); });
  ok(await clickBtn('ส่งทดลอง'), 'send test button found');
  await sleep(400);
  const shown = await P.evaluate(() => (document.getElementById('nino-console').textContent || ''));
  ok(shown.indexOf('ตอบจากโมเดลในเครื่อง') >= 0, 'test chat shows the answer from the model');
  ok(shown.indexOf('ทาง model') >= 0, 'test chat shows which backend answered and how long it took');
  await P.evaluate(() => ninoConsole.close());

  // P) ความจำของมิ้ม/นาเดียร์และคีย์อื่นไม่ถูกแตะ
  const nonLlmAfter = await snapNonLlm();
  const changed = Object.keys(Object.assign({}, nonLlmBefore, nonLlmAfter)).filter(k => nonLlmBefore[k] !== nonLlmAfter[k]);
  ok(changed.length === 0, 'no unrelated stored keys changed' + (changed.length ? ': ' + changed.join(',') : ''));

  // Q) คืนค่าเริ่มต้น
  await P.evaluate((c) => { if (c == null) localStorage.removeItem('nino-config-v3'); else localStorage.setItem('nino-config-v3', c); }, cfgBefore);
  await resetAll();

  ok(h.errors.length === 0, 'no page errors: ' + JSON.stringify(h.errors.slice(0, 3)));
  await h.close();
  const total = pass + fail;
  console.log('llm-hub: ' + pass + '/' + total + ' passed, ' + fail + ' failed (ต้องผ่านอย่างน้อย ' + FLOOR + ')');
  process.exit(fail || total < FLOOR ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
