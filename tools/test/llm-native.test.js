// โมเดลในแอป Android (llama.cpp บนเครื่อง) ผ่าน ninoNative bridge 5 ในเบราว์เซอร์จริง (ตัวจำลองแอปใน native-mock.js)
// ตรวจ: เว็บเดิมไม่มีโมเดลในแอป, แอปที่รองรับ llm มีโมเดลในแอปเป็นค่าเริ่มต้น, ดาวน์โหลดแล้วโหลดเข้า llama.cpp,
// ตอบและส่งข้อความเป็นชิ้น, ส่งชื่อโมเดลที่ปักไว้ทุกครั้ง, ลบแล้วปิดโมเดล, ดาวน์โหลดผิดพลาดแสดงเป็นข้อความไทย
// ห้องเรียนขอคำตอบยาว (longOut 1536 โทเคน) เฉพาะเมื่อโมเดลในแอปพร้อมและไม่มีคีย์ API; ข้อความเกินเพดานต้องแจ้ง error ไม่ตัดเงียบ
const H = require('./harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
const FLOOR = 14;
const NATIVE_ID = 'native_qwen25_05b_q4km';

(async () => {
  console.log('== โมเดลในแอป Android (llama.cpp บนเครื่อง) ผ่าน ninoNative bridge 5');

  // 1) เว็บเดิม (แอปที่รองรับ bridge 2): ไม่มีโมเดลในแอป ค่าเริ่มต้นยังเป็น Gemma
  {
    const h = await H.start();
    const P = h.page;
    await P.goto(h.base + '/index.html', { waitUntil: 'load' });
    await sleep(1500);
    ok(await P.evaluate(() => NINOLocalLLM.status().models.length === 2), 'bridge 2 (web): two models, no native model');
    ok(await P.evaluate(() => !NINOLocalLLM.MODELS.some(m => m.backend === 'native')), 'bridge 2 (web): native model not listed');
    ok(await P.evaluate(() => NINOLocalLLM.MODEL.id === 'gemma3_270m'), 'bridge 2 (web): default stays Gemma');
    ok(await P.evaluate(() => !(window.ninoNative && window.ninoNative.llm)), 'bridge 2: llm flag not set');
    await h.close();
  }

  // 2) แอปที่รองรับ llm (bridge 5)
  const h = await H.start();
  await h.ctx.addInitScript(() => { window.__mockLLM = true; });
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1500);
  ok(await P.evaluate(() => window.ninoNative && window.ninoNative.llm === true), 'bridge 5: llm flag set after info');
  ok(await P.evaluate((id) => NINOLocalLLM.status().models[0].id === id, NATIVE_ID), 'bridge 5: native model listed first');
  ok(await P.evaluate((id) => NINOLocalLLM.MODEL.id === id, NATIVE_ID), 'bridge 5: app default is the native model');
  ok(await P.evaluate(() => NINOLocalLLM.status().state === 'off'), 'bridge 5: starts off');
  ok(await P.evaluate(() => NINOLocalLLM.MODEL.repo === 'Qwen/Qwen2.5-0.5B-Instruct-GGUF' && NINOLocalLLM.MODEL.bytes === 491400032), 'native model repo and size match the Android pin');

  // โหลด: ดาวน์โหลดแล้วโหลดเข้า llama.cpp
  await P.evaluate(() => NINOLocalLLM.load().catch(() => 0));
  const st = await P.evaluate(() => NINOLocalLLM.status());
  ok(st.state === 'ready', 'load ends ready: ' + st.state + ' ' + st.error);
  const ops = await P.evaluate(() => (window.__llmCalls || []).map(c => c.op));
  ok(ops.slice(0, 2).join() === 'llm.download,llm.load', 'download then load: ' + ops.join());
  ok(ops.slice(2).every(o => o === 'llm.chat'), 'only the hub warm-up (llm.chat) follows the load');
  ok(await P.evaluate((id) => (window.__llmCalls || []).every(c => c.model === id), NATIVE_ID), 'every llm call names the pinned model');

  // ตอบ: ข้อความจากชิ้นสตรีมรวมกัน และส่ง system + user พร้อม maxTokens
  const reply = await P.evaluate(() => NINOLocalLLM.generate({ systemInstruction: 'ระบบ', contents: [{ role: 'user', parts: [{ text: 'สวัสดี' }] }], maxTokens: 100 }).then(t => 'ok:' + t, e => 'err:' + e.message));
  ok(reply === 'ok:ตอบจากแอป', 'generate joins streamed chunks: ' + reply);
  const chat = await P.evaluate(() => (window.__llmCalls || []).filter(c => c.op === 'llm.chat' && c.maxTokens === 100));
  ok(chat.length === 1 && chat[0].messages === 2, 'chat sends system + user with maxTokens: ' + JSON.stringify(chat));

  // ลบ: ปิดโมเดลในแอปด้วย llm.unload
  await P.evaluate(() => NINOLocalLLM.forget());
  ok(await P.evaluate(() => (window.__llmCalls || []).some(c => c.op === 'llm.unload')), 'forget unloads the native model');
  ok(await P.evaluate(() => NINOLocalLLM.status().state === 'off'), 'after forget: off');

  // ดาวน์โหลดผิดพลาด: ข้อความไทยที่อ่านรู้เรื่อง
  await P.evaluate(() => { window.__llmFail = 'CHECKSUM'; });
  await P.evaluate(() => NINOLocalLLM.load().catch(() => 0));
  const err = await P.evaluate(() => NINOLocalLLM.status());
  ok(err.state === 'error' && err.error.indexOf('ไม่ตรงกับค่าตรวจสอบ') >= 0, 'checksum failure shows Thai text: ' + err.error);
  ok(await P.evaluate(() => sessionStorage.getItem('nino.llm.loading') === null), 'failed load clears the loading marker');

  // 3) ห้องเรียน (ninoResearch.llm) บนโมเดลในแอป: ก่อนพร้อมคงข้อความเดิม, พร้อมแล้วขอ 1536 โทเคน, เกินเพดานแจ้ง error
  {
    const h3 = await H.start();
    await h3.ctx.addInitScript(() => { window.__mockLLM = true; });
    const Q = h3.page;
    await Q.goto(h3.base + '/index.html', { waitUntil: 'load' });
    await sleep(1500);
    const before = await Q.evaluate(() => window.ninoResearch.llm('ระบบ', 'ค้นหา').then(t => 'ok:' + t, e => 'err:' + e.message));
    ok(before.indexOf('err:') === 0 && before.indexOf('ยังไม่ได้ตั้งค่า API Key') >= 0, 'classroom before native is ready keeps the old error: ' + before);
    await Q.evaluate(() => NINOLocalLLM.load().catch(() => 0));
    ok(await Q.evaluate(() => NINOLocalLLM.isReady()), 'native model ready for the classroom test');
    const out = await Q.evaluate(() => window.ninoResearch.llm('ระบบ', 'ค้นหา').then(t => 'ok:' + t, e => 'err:' + e.message));
    ok(out === 'ok:ตอบจากแอป', 'classroom reply comes from the native model: ' + out);
    const longCalls = await Q.evaluate(() => (window.__llmCalls || []).filter(c => c.op === 'llm.chat' && c.maxTokens === 1536).length);
    ok(longCalls === 1, 'classroom asks for 1536 output tokens (longOut): ' + longCalls);
    const tooLong = await Q.evaluate(() => window.ninoResearch.llm('ระบบ', 'ก'.repeat(9000)).then(t => 'ok', e => 'err:' + e.message));
    ok(tooLong.indexOf('ข้อความยาวเกินบริบท') >= 0, 'over-long classroom prompt fails loudly, not silently cut: ' + tooLong);
    await Q.evaluate(() => NINOLocalLLM.generate({ systemInstruction: 'ระบบ', contents: [{ role: 'user', parts: [{ text: 'สวัสดี' }] }], maxTokens: 9999 }).catch(() => 0));
    const plain = await Q.evaluate(() => (window.__llmCalls || []).filter(c => c.op === 'llm.chat' && c.maxTokens === 512).length);
    ok(plain >= 1, 'normal chat is still capped at 512 tokens');
    await h3.close();
  }

  await h.close();
  console.log('  ' + pass + ' passed, ' + fail + ' failed (ต้องผ่านอย่างน้อย ' + FLOOR + ')');
  process.exit(fail || pass < FLOOR ? 1 : 0);
})().catch(e => { console.log('  FAIL: crashed: ' + e.message); process.exit(1); });
