/* ทะเบียนโมเดลหลายตัว (js/llm-roster.js) ไม่ใช้เครือข่ายจริง: fetch และโมเดลในเครื่องเป็นของจำลอง
   รัน: node tools/test/llm-roster.test.js */
'use strict';
const path = require('path');
const MOD = path.resolve(__dirname, '../../js/llm-roster.js');
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }

// localStorage จำลอง (ใช้ทดสอบการเก็บและโหลดซ้ำ)
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
function freshRoster() { delete require.cache[MOD]; return require(MOD); }
let R = freshRoster();

// fetch จำลอง: handler คืน {status, body} หรือ {hang:true} (ค้างจนถูกยกเลิก)
function mockFetch(handler) {
  const f = async (url, opts) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    f.calls.push({ url, headers: opts.headers || {}, body });
    const r = await handler(url, opts, body);
    if (r.hang) return new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    if (r.stream) return { ok: true, status: 200, body: r.stream, text: async () => '' };
    if (r.delay) await new Promise(res => setTimeout(res, r.delay));
    const status = r.status || 200;
    return { ok: status < 400, status: status, headers: r.headers, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) };
  };
  f.calls = [];
  return f;
}
const okChat = text => ({ choices: [{ message: { content: text } }] });
const REQ = { systemInstruction: 'คุณคือ NINO', contents: [
  { role: 'user', parts: [{ text: 'สวัสดี' }] }, { role: 'model', parts: [{ text: 'ดีจ้า' }] }, { role: 'user', parts: [{ text: 'รหัสคืออะไร' }] }
], maxTokens: 300, temperature: 0.4 };

(async () => {
  console.log('== การตรวจและเก็บรายการ');
  ok(!R.add({ kind: 'compat', url: 'ftp://x.y', model: 'm' }).ok, 'URL ที่ไม่ใช่ http(s) ถูกปฏิเสธ');
  ok(!R.add({ kind: 'compat', url: 'https://x.y', model: '' }).ok, 'compat ต้องมีชื่อโมเดล');
  ok(!R.add({ kind: 'anthropic', url: 'https://api.anthropic.com', model: 'claude-x', key: '' }).ok, 'Claude ต้องมี key');
  ok(!R.add({ kind: 'constructor', url: 'https://x.y', model: 'm' }).ok, 'ชนิดที่ไม่มีจริง (แม้ชื่อซ้ำกับ prototype) ถูกปฏิเสธ');
  const a = R.add({ id: 'ds', label: 'DeepSeek', kind: 'compat', url: 'https://api.deepseek.com/v1/', model: 'deepseek-chat', key: 'sk-SECRET-1', roles: ['chat'], enabled: true, priority: 1 });
  ok(a.ok && a.entry.url === 'https://api.deepseek.com/v1', 'เก็บรายการที่ถูกต้องและตัด / ท้าย URL');
  ok(!R.add({ id: 'ds', kind: 'compat', url: 'https://x.y', model: 'm' }).ok, 'รหัสซ้ำถูกปฏิเสธ');
  R.add({ id: 'qw', label: 'Qwen', kind: 'compat', url: 'https://dashscope.example/v1', model: 'qwen-max', key: 'sk-SECRET-2', roles: ['chat', 'worker'], enabled: true, priority: 2 });
  R.add({ id: 'od', label: 'ในเครื่อง', kind: 'on-device', roles: ['chat', 'summary'], enabled: true, priority: 3 });
  R.add({ id: 'cl', label: 'Claude', kind: 'anthropic', url: 'https://api.anthropic.com', model: 'claude-x', key: 'sk-ant-SECRET-3', roles: ['chat'], enabled: false, priority: 0 });
  ok(R.list().length === 4, 'เก็บได้หลายตัวพร้อมกัน');

  console.log('== การเลือกตามบทบาท');
  ok(R.route('chat').map(e => e.id).join() === 'ds,qw,od', 'chat: เรียงตามลำดับความสำคัญ และข้ามตัวที่ปิดอยู่ (Claude ปิด)');
  ok(R.route('summary').map(e => e.id).join() === 'od', 'summary มีแค่ตัวที่รับบทบาทนั้น');
  ok(R.hasRoute('memory') === false, 'ไม่มีตัวไหนรับ memory: hasRoute เป็น false (ผู้เรียกใช้ทางเดิม)');
  R.setEnabled('cl', true);
  ok(R.route('chat')[0].id === 'cl', 'เปิด Claude (priority 0) แล้วขึ้นเป็นตัวแรก');
  R.setEnabled('cl', false);

  console.log('== คำขอแบบ OpenAI-compatible');
  let f = mockFetch(() => ({ body: okChat('<think>คิดก่อน</think>รหัสคือ NIM-4100') }));
  let res = await R.generate('chat', REQ, { fetch: f, onDevice: async () => { throw new Error('ไม่ควรถูกเรียก'); }, active: async () => { throw new Error('ไม่ควรถูกเรียก'); } });
  ok(res.by === 'ds' && res.text === 'รหัสคือ NIM-4100', 'ตัวแรกตอบ และตัด <think> ออก');
  const c0 = f.calls[0];
  ok(c0.url === 'https://api.deepseek.com/v1/chat/completions', 'ยิงไปที่ /chat/completions ของผู้ให้บริการนั้น');
  ok(c0.headers.Authorization === 'Bearer sk-SECRET-1', 'ส่งคีย์ในหัวข้อ Authorization');
  ok(c0.body.model === 'deepseek-chat' && c0.body.stream === false && c0.body.max_tokens === 300 && c0.body.temperature === 0.4, 'โมเดล ค่าส่งออก และ stream ปิด');
  ok(c0.body.messages.map(m => m.role).join() === 'system,user,assistant,user', 'system อยู่หัว และแปลง model เป็น assistant');
  ok(c0.body.messages[3].content === 'รหัสคืออะไร', 'เนื้อหาข้อความล่าสุดถูกต้อง');

  console.log('== ล้มแล้วไปตัวถัดไป และไม่รั่วคีย์');
  f = mockFetch((url) => url.indexOf('deepseek') >= 0 ? { status: 500, body: 'เซิร์ฟเวอร์พัง คีย์ของคุณคือ sk-SECRET-1' } : { body: okChat('จากควเวน') });
  res = await R.generate('chat', REQ, { fetch: f });
  ok(res.by === 'qw' && res.tried.length === 2 && res.tried[0].ok === false, 'DeepSeek พลาด แล้ว Qwen ตอบ');
  ok(!res.tried[0].error.includes('sk-SECRET-1') && res.tried[0].error.includes('[คีย์]'), 'ข้อความผิดพลาดไม่มีคีย์ (ถูกแทนด้วย [คีย์])');
  ok(res.text === 'จากควเวน', 'คืนข้อความของตัวที่ตอบได้');

  f = mockFetch(() => ({ body: okChat('') }));
  let allErr = null;
  try { await R.generate('chat', REQ, { fetch: f, onDevice: async () => { throw new Error('โมเดลในเครื่องยังไม่พร้อม'); } }); } catch (e) { allErr = e; }
  ok(allErr && allErr.code === 'ALL_FAILED' && allErr.tried.length === 3, 'ทุกตัวพลาด: โยน ALL_FAILED พร้อมรายการที่ลอง');
  ok(allErr && !/sk-SECRET/.test(allErr.message), 'ข้อความของ ALL_FAILED ไม่มีคีย์');
  ok(allErr && allErr.tried.some(t => t.error === 'คำตอบว่าง') && allErr.tried.some(t => /ยังไม่พร้อม/.test(t.error)), 'คำตอบว่างและโมเดลในเครื่องที่ไม่พร้อมถูกนับเป็นความล้มเหลว');

  console.log('== ไม่มีบทบาทที่เปิดไว้');
  let noRoute = null;
  try { await R.generate('memory', REQ, { fetch: mockFetch(() => ({ body: {} })) }); } catch (e) { noRoute = e; }
  ok(noRoute && noRoute.code === 'NO_ROUTE', 'บทบาทที่ไม่มีตัวเปิดไว้ โยน NO_ROUTE ให้ผู้เรียกใช้ทางเดิม');

  console.log('== Claude (Anthropic Messages)');
  f = mockFetch(() => ({ body: { content: [{ type: 'text', text: 'สวัสดีจาก Claude' }] } }));
  R.setEnabled('cl', true);
  res = await R.generate('chat', { contents: [{ role: 'user', parts: [{ text: 'ก' }] }, { role: 'user', parts: [{ text: 'ข' }] }, { role: 'model', parts: [{ text: 'ค' }] }, { role: 'user', parts: [{ text: 'ง' }] }], systemInstruction: 'ระบบ' }, { fetch: f });
  const cl = f.calls[0];
  ok(res.by === 'cl' && res.text === 'สวัสดีจาก Claude', 'Claude ตอบและดึงเฉพาะบล็อกข้อความ');
  ok(cl.url === 'https://api.anthropic.com/v1/messages' && cl.headers['x-api-key'] === 'sk-ant-SECRET-3' && cl.headers['anthropic-version'] === '2023-06-01', 'หัวข้อและ URL ของ Anthropic ถูกต้อง');
  ok(cl.body.system === 'ระบบ' && cl.body.messages.length === 3, 'system แยกออกจากข้อความ');
  ok(cl.body.messages[0].role === 'user' && cl.body.messages[0].content === 'ก\nข', 'รวมข้อความ user ติดกันเป็นบรรทัดเดียว');
  ok(cl.body.messages[1].role === 'assistant' && cl.body.messages[2].role === 'user', 'สลับบทบาทถูกต้อง');
  f = mockFetch(() => ({ body: { content: [{ type: 'text', text: 'ok' }] } }));
  R.setEnabled('cl', true);
  await R.generate('chat', { contents: [{ role: 'model', parts: [{ text: 'เริ่ม' }] }] }, { fetch: f });
  ok(f.calls[0].body.messages[0].content === '(เริ่มบทสนทนา)' && f.calls[0].body.messages[0].role === 'user', 'ถ้าเริ่มด้วย assistant จะเติม user ขึ้นต้นให้ Claude');
  R.setEnabled('cl', false);

  console.log('== ยกเลิกและหมดเวลา');
  R.update('ds', { timeoutMs: 1000 });
  f = mockFetch((url) => url.indexOf('deepseek') >= 0 ? { hang: true } : { body: okChat('ตัวสำรอง') });
  const t0 = Date.now();
  res = await R.generate('chat', REQ, { fetch: f });
  const dt = Date.now() - t0;
  ok(res.by === 'qw' && dt >= 900 && dt < 2500, 'หมดเวลา 1 วินาทีแล้วไปตัวถัดไป (' + dt + ' ms)');
  ok(res.tried[0].error.indexOf('หมดเวลา') === 0, 'บันทึกเหตุผลว่าหมดเวลา');

  const ac = new AbortController();
  f = mockFetch((url) => url.indexOf('deepseek') >= 0 ? { hang: true } : { body: okChat('ไม่ควรถึง') });
  setTimeout(() => ac.abort(), 50);
  let abortErr = null;
  try { await R.generate('chat', Object.assign({}, REQ, { signal: ac.signal }), { fetch: f }); } catch (e) { abortErr = e; }
  ok(abortErr && abortErr.name === 'AbortError', 'ผู้ใช้ยกเลิก: โยน AbortError');
  ok(f.calls.length === 1, 'ผู้ใช้ยกเลิก: ไม่ลองตัวถัดไป');
  R.update('ds', { timeoutMs: 60000 });

  console.log('== โมเดลในเครื่องและแอปเดิม');
  R.setEnabled('ds', false); R.setEnabled('qw', false);
  let odCalls = 0, actCalls = 0;
  res = await R.generate('chat', REQ, {
    fetch: mockFetch(() => ({ body: {} })),
    onDevice: async (r) => { odCalls++; return 'จากเครื่อง'; },
    active: async () => { actCalls++; return 'จากแอปเดิม'; }
  });
  ok(res.by === 'od' && res.text === 'จากเครื่อง' && odCalls === 1 && actCalls === 0, 'โมเดลในเครื่องตอบ (แอปเดิมไม่ถูกเรียก)');
  R.update('od', { enabled: false });
  R.setEnabled('ds', true);
  R.update('ds', { roles: ['chat'], enabled: true });
  R.add({ id: 'act', label: 'แอปเดิม', kind: 'active', roles: ['chat'], enabled: true, priority: 9 });
  R.setEnabled('ds', false);
  res = await R.generate('chat', REQ, { fetch: mockFetch(() => ({ status: 500, body: 'x' })), active: async () => { actCalls++; return 'จากแอปเดิม'; } });
  ok(res.by === 'act' && res.text === 'จากแอปเดิม' && actCalls === 1, 'ตัว active ใช้ทางเดิมของแอปผ่าน deps.active');

  console.log('== เรียกพร้อมกัน (fanout)');
  R.setEnabled('ds', true);
  R.setEnabled('qw', true);
  R.setEnabled('act', false);
  R.update('ds', { roles: ['chat', 'summary'] });
  f = mockFetch((url) => url.indexOf('deepseek') >= 0 ? { delay: 200, body: okChat('ดีพซีค') } : { delay: 200, status: 401, body: 'key ผิด' });
  const f0 = Date.now();
  const all = await R.fanout('chat', REQ, { fetch: f });
  const took = Date.now() - f0;
  ok(all.length === 2 && all.filter(x => x.ok).length === 1, 'fanout คืนทุกตัวที่เปิดไว้ (2 ตัว) ตัวที่พลาดไม่ทำให้ทั้งหมดล้ม');
  ok(took < 380, 'ทุกตัวเริ่มพร้อมกัน (รวม ' + took + ' ms แทนที่จะเป็นผลรวม)');
  ok(all.find(x => x.id === 'qw').ok === false && all.find(x => x.id === 'qw').error.indexOf('HTTP 401') === 0, 'บันทึกสาเหตุของตัวที่พลาด');

  console.log('== ความคงทน');
  R.add({ id: 'keep', label: 'เก็บไว้', kind: 'compat', url: 'https://k.example/v1', model: 'm', roles: ['worker'], enabled: true, priority: 5 });
  const R2 = freshRoster();
  ok(R2.list().some(e => e.id === 'keep' && e.enabled && e.roles.join() === 'worker'), 'รายการและสถานะเปิด/ปิดอยู่รอดหลังโหลดใหม่');
  ok(R2.list().find(e => e.id === 'ds').key === 'sk-SECRET-1', 'คีย์ถูกเก็บในเครื่องเหมือนโปรไฟล์ Local AI เดิม (ไม่ส่งไปที่อื่น)');
  mem[R2.KEY] = '{ไม่ใช่ JSON';
  ok(freshRoster().list().length === 0, 'ข้อมูลเสียในที่เก็บ: ไม่ล้ม รายการว่าง');
  mem[R2.KEY] = JSON.stringify([{ kind: 'compat', url: 'ftp://bad', model: 'm' }, { kind: 'on-device', enabled: true, roles: ['chat'] }]);
  ok(freshRoster().list().length === 1, 'รายการเสียถูกตัดออก รายการที่ดียังอยู่');

  console.log('== สตรีม');
  R.list().forEach(e => R.remove(e.id));
  const enc = new TextEncoder();
  const sseBody = (text, size) => { const bytes = enc.encode(text); return new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += size) c.enqueue(bytes.slice(i, i + size)); c.close(); } }); };
  const sseCompat = pieces => pieces.map(p => 'data: ' + JSON.stringify({ choices: [{ delta: { content: p } }] }) + '\n\n').join('') + 'data: [DONE]\n\n';
  const sseAnthropic = pieces => pieces.map(p => 'event: content_block_delta\ndata: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: p } }) + '\n\n').join('');
  R.add({ id: 'sc', label: 'ตัว OpenAI', kind: 'compat', url: 'https://s.example/v1', model: 'm', key: 'k', roles: ['chat'], enabled: true, priority: 1 });
  let chunks = [];
  const withChunks = Object.assign({}, REQ, { onChunk: d => chunks.push(d) });
  f = mockFetch(() => ({ stream: sseBody(sseCompat(['สวัสดี', ' NINO']), 7) }));
  res = await R.generate('chat', withChunks, { fetch: f });
  ok(res.text === 'สวัสดี NINO' && chunks.join('') === 'สวัสดี NINO' && chunks.length === 2, 'OpenAI: ได้ชิ้นข้อความทีละชิ้นและรวมเป็นคำตอบเดียวกัน');
  ok(f.calls[0].body.stream === true, 'ขอสตรีมเมื่อมี onChunk');
  R.setEnabled('sc', false);
  R.add({ id: 'sa', label: 'Claude สตรีม', kind: 'anthropic', url: 'https://a.example', model: 'c', key: 'k', roles: ['chat'], enabled: true, priority: 1 });
  chunks = [];
  f = mockFetch(() => ({ stream: sseBody(sseAnthropic(['ก', 'ข']), 5) }));
  res = await R.generate('chat', withChunks, { fetch: f });
  ok(res.text === 'กข' && chunks.join('') === 'กข' && f.calls[0].body.stream === true, 'Claude: อ่าน content_block_delta ทีละชิ้น');
  R.setEnabled('sc', true);
  R.update('sc', { priority: 1 }); R.update('sa', { priority: 2 });
  chunks = [];
  f = mockFetch(url => url.indexOf('s.example') >= 0 ? { status: 500, body: 'พัง' } : { stream: sseBody(sseAnthropic(['ตอบ']), 4) });
  res = await R.generate('chat', withChunks, { fetch: f });
  ok(res.by === 'sa' && res.text === 'ตอบ' && res.tried[0].ok === false && !res.partial, 'พลาดก่อนมีชิ้นแรก: ลองตัวถัดไปได้');
  chunks = [];
  let sent = false;  // ส่งชิ้นแรกก่อนแล้วค่อยตัด (controller.error ทิ้งข้อมูลที่ค้างในคิว)
  const broken = new ReadableStream({ pull(c) { if (!sent) { sent = true; c.enqueue(enc.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: 'ก' } }] }) + '\n\n')); } else c.error(new Error('ตัดการเชื่อมต่อ')); } });
  f = mockFetch(url => url.indexOf('s.example') >= 0 ? { stream: broken } : { stream: sseBody(sseAnthropic(['ไม่ควรถึง']), 4) });
  res = await R.generate('chat', withChunks, { fetch: f });
  ok(res.partial === true && res.by === 'sc' && res.text === 'ก' && chunks.join('') === 'ก', 'พลาดหลังส่งชิ้นแล้ว: คืนส่วนที่ส่งไปแล้ว ไม่สลับตัว');
  ok(f.calls.length === 1, 'พลาดหลังส่งชิ้นแล้ว: ไม่เรียกตัวถัดไป (กันข้อความซ้ำ)');
  chunks = [];
  f = mockFetch(() => ({ body: okChat('ทั้งก้อน') }));
  R.setEnabled('sa', false);
  res = await R.generate('chat', withChunks, { fetch: f });
  ok(res.text === 'ทั้งก้อน' && chunks.join('') === 'ทั้งก้อน' && chunks.length === 1, 'ผู้ให้บริการไม่ส่งสตรีม: ส่งเป็นก้อนเดียวและยังใช้ได้');

  console.log('== ปุ่มทดสอบ');
  R.add({ id: 'pg', label: 'ทดสอบ', kind: 'compat', url: 'https://p.example/v1', model: 'm', key: 'sk-SECRET-9', enabled: false });
  const pg1 = await R.ping('pg', { fetch: mockFetch(() => ({ body: okChat('ok') })) });
  ok(pg1.ok && pg1.text === 'ok', 'ปุ่มทดสอบใช้ได้แม้ตัวนั้นปิดอยู่');
  const pg2 = await R.ping('pg', { fetch: mockFetch(() => ({ status: 401, body: 'ผิด sk-SECRET-9' })) });
  ok(!pg2.ok && pg2.error.indexOf('HTTP 401') === 0 && !pg2.error.includes('sk-SECRET-9'), 'ปุ่มทดสอบแสดงสาเหตุและไม่มีคีย์');
  ok(!(await R.ping('ไม่มี', {})).ok, 'ทดสอบรหัสที่ไม่มีคืนผลล้มเหลว ไม่โยน');
  R.add({ id: 'sk', label: 'คีย์สั้น', kind: 'compat', url: 'https://k.example/v1', model: 'm', key: 'k', roles: ['worker'], enabled: false });
  const sk = await R.ping('sk', { fetch: mockFetch(() => ({ status: 401, body: 'key ผิด' })) });
  ok(sk.error === 'HTTP 401: key ผิด', 'คีย์สั้นไม่ไปแทนตัวอักษรทั่วไปในข้อความผิดพลาด');

  console.log('== ประวัติการเรียกคงอยู่หลังรีโหลด (ไม่มีคีย์)');
  R.clearLog();
  R.add({ id: 'hs', label: 'ประวัติ', kind: 'compat', url: 'https://h.example/v1', model: 'm', key: 'sk-HIST-KEY-77', enabled: true, roles: ['worker'] });
  await R.ping('hs', { fetch: mockFetch(() => ({ status: 401, body: 'ผิด sk-HIST-KEY-77' })) });
  await R.ping('hs', { fetch: mockFetch(() => ({ body: okChat('ok') })) });
  const savedLog = mem['nino.llm.roster.log'] || '';
  ok(savedLog.length > 0 && !savedLog.includes('sk-HIST-KEY-77'), 'ประวัติที่เก็บลงเครื่องไม่มีคีย์');
  const R3 = freshRoster();
  const hist = R3.log().filter(x => x.id === 'hs');
  ok(hist.length === 2 && hist[0].ok === false && hist[1].ok === true, 'รีโหลดแล้วประวัติยังอยู่ ตามลำดับเวลา');
  ok(hist[0].error.indexOf('HTTP 401') === 0 && hist[0].error.includes('[คีย์]'), 'ข้อความผิดพลาดในประวัติถูกปิดบังคีย์');
  R3.clearLog();
  ok(freshRoster().log().length === 0 && mem['nino.llm.roster.log'] === '[]', 'clearLog ล้างทั้งความจำและที่เก็บ');
  const brokenStore = global.localStorage;
  global.localStorage = { getItem: () => { throw new Error('ปิดการเก็บ'); }, setItem: () => { throw new Error('เต็ม'); } };
  const RB = freshRoster();
  RB.add({ id: 'hb', label: 'เก็บไม่ได้', kind: 'compat', url: 'https://b.example/v1', model: 'm', key: 'sk-BROKEN-1', enabled: true, roles: ['worker'] });
  const pb = await RB.ping('hb', { fetch: mockFetch(() => ({ body: okChat('ok') })) });
  ok(pb.ok && RB.log().filter(x => x.id === 'hb').length === 1, 'ที่เก็บเสียหรือเต็ม: ปุ่มทดสอบยังทำงานและประวัติอยู่ในความจำ');
  global.localStorage = brokenStore;

  console.log('== หมวดข้อผิดพลาดและการล้างประวัติ');
  R.clearLog();
  R.add({ id: 'cz', label: 'หมวด', kind: 'compat', url: 'https://c.example/v1', model: 'm', key: 'sk-CAT-KEY-1', enabled: true, roles: ['worker'] });
  const catOf = async (st, body, fx) => { R.clearLog(); await R.ping('cz', { fetch: fx || mockFetch(() => ({ status: st, body: body || 'x' })) }); return R.log()[R.log().length - 1].cat; };
  ok(await catOf(401) === 'key' && await catOf(403) === 'key', 'HTTP 401/403 เป็นหมวดคีย์');
  ok(await catOf(429) === 'quota' && await catOf(404) === 'model' && await catOf(503) === 'server', 'HTTP 429 โควตา, 404 โมเดล, 5xx ผู้ให้บริการ');
  ok(await catOf(0, null, () => Promise.reject(new Error('Failed to fetch'))) === 'network', 'เชื่อมต่อไม่ได้เป็นหมวดเครือข่าย');
  ok(await catOf(200, null, mockFetch(() => ({ body: { choices: [{ message: { content: '' } }] } }))) === 'empty', 'คำตอบว่างเป็นหมวดคำตอบว่าง');
  ok(await catOf(200, null, mockFetch(() => ({ body: okChat('ok') }))) === 'ok', 'สำเร็จเป็นหมวด ok');
  ok(R.CAT_LABEL.key === 'คีย์ไม่ถูกต้องหรือไม่มีสิทธิ์' && R.CAT_LABEL.other === 'อื่น ๆ', 'มีชื่อหมวดภาษาไทยให้ UI ใช้');
  mem['nino.llm.roster.log'] = JSON.stringify([{ t: 1, id: 'x', ok: false, error: 'e', cat: '__proto__' }, { t: 2, id: 'x', ok: false, error: 'e', cat: 'แปลก' }]);
  const junk = freshRoster().log();
  ok(junk.length === 2 && junk[0].cat === 'other' && junk[1].cat === 'other', 'หมวดที่ไม่รู้จักในที่เก็บถูกแทนด้วย other');
  R.clearLog();
  ok(R.log().length === 0 && mem['nino.llm.roster.log'] === '[]', 'ปุ่มล้างประวัติ: clearLog ล้างทั้งสองที่');

  console.log('== ผู้ให้บริการสาธารณะ: ป้าย, บุคลิกคงที่, ไม่มีประวัติ, แคช, ตัวกันถี่');
  R.list().forEach(e => R.setEnabled(e.id, false));
  R.clearLog();
  R.PUBLIC.gapMs = 30000;
  R.add({ id: 'pub', label: 'สาธารณะ', kind: 'compat', url: 'https://p.example/openai', model: 'openai', publicOnly: true, enabled: true, roles: ['worker'] });
  const hist2 = [
    { role: 'user', parts: [{ text: 'ก่อนหน้า' }] },
    { role: 'model', parts: [{ text: 'ตอบก่อน' }] },
    { role: 'user', parts: [{ text: 'ขอคำอธิบายศัพท์ API' }] }
  ];
  let pf = mockFetch(() => ({ body: okChat('API คือ ...') }));
  let threw = null;
  try { await R.generate('worker', { contents: hist2, systemInstruction: 'ความจำส่วนตัว' }, { fetch: pf }); } catch (err) { threw = err; }
  ok(threw && threw.code === 'ALL_FAILED' && pf.calls.length === 0, 'งานที่ไม่ติดป้ายสาธารณะไม่ถูกส่งออกนอกเครื่องเลย');
  R.PUBLIC.gapMs = 0;
  pf = mockFetch(() => ({ body: okChat('API คือ ...') }));
  res = await R.generate('worker', { contents: hist2, systemInstruction: 'ความจำส่วนตัว', dataClass: 'public' }, { fetch: pf });
  const pubBody = pf.calls[0] && pf.calls[0].body;
  const pubText = JSON.stringify(pubBody || {});
  ok(res.by === 'pub' && res.text === 'API คือ ...' && pf.calls.length === 1, 'งานสาธารณะไปถึงผู้ให้บริการและได้คำตอบ');
  ok(pubBody && pubBody.messages.length === 2 && pubBody.messages[0].role === 'system' && pubBody.messages[0].content === R.DEFAULT_PERSONA && pubBody.messages[1].content === 'ขอคำอธิบายศัพท์ API', 'ส่งเฉพาะบุคลิกคงที่และข้อความล่าสุด');
  ok(!pubText.includes('ความจำส่วนตัว') && !pubText.includes('ตอบก่อน') && !pubText.includes('ก่อนหน้า'), 'ไม่มีความจำส่วนตัวหรือประวัติแชตในคำขอ');
  res = await R.generate('worker', { contents: hist2, systemInstruction: 'x', dataClass: 'public' }, { fetch: pf });
  ok(res.text === 'API คือ ...' && pf.calls.length === 1 && res.tried[0].ok === true, 'ถามข้อเดิมซ้ำได้จากแคชโดยไม่เรียกผู้ให้บริการ');
  ok(!String(mem['nino.llm.cache'] || '').includes('ความจำส่วนตัว'), 'แคชไม่เก็บความจำส่วนตัว');
  R.PUBLIC.gapMs = 30000;
  threw = null;
  try { await R.generate('worker', { contents: [{ role: 'user', parts: [{ text: 'คำถามใหม่อีกข้อ' }] }], dataClass: 'public' }, { fetch: pf }); } catch (err) { threw = err; }
  ok(threw && threw.code === 'ALL_FAILED' && threw.tried[0].error.indexOf('รอ') === 0 && pf.calls.length === 1, 'ถามถี่เกินกำหนดถูกตัดก่อนส่งออก');
  R.PUBLIC.gapMs = 0; R.PUBLIC.ttlMs = -1;
  pf = mockFetch(() => ({ body: okChat('ใหม่หลังหมดอายุ') }));
  res = await R.generate('worker', { contents: hist2, dataClass: 'public' }, { fetch: pf });
  ok(res.text === 'ใหม่หลังหมดอายุ' && pf.calls.length === 1, 'แคชหมดอายุแล้วเรียกผู้ให้บริการใหม่');
  R.PUBLIC.ttlMs = 86400000;
  pf = mockFetch(() => ({ status: 402, body: 'เกินโควตา' }));
  try { await R.generate('worker', { contents: [{ role: 'user', parts: [{ text: 'ข้อใหม่ 402' }] }], dataClass: 'public' }, { fetch: pf }); } catch (err) { /* คาดไว้ */ }
  ok(R.log().slice(-1)[0].cat === 'quota', '402 จากผู้ให้บริการสาธารณะเป็นหมวดโควตา');
  R.PUBLIC.gapMs = 30000; R.PUBLIC.ttlMs = 86400000;

  console.log('== มิ้ม: ช่องความจำ นิสัย สถานะ และตัวนับ');
  R.npc.clear();
  R.add({ id: 'nd', label: 'ในเครื่อง', kind: 'on-device', roles: ['chat'], enabled: true });
  ok(R.npc.addSlot('ชอบกาแฟ').ok && !R.npc.addSlot('').ok, 'เพิ่มช่องความจำได้ และไม่รับช่องว่าง');
  ok(!R.npc.addSlot('ก'.repeat(121)).ok, 'ช่องความจำยาวเกิน 120 ตัวอักษรถูกปฏิเสธ');
  for (let i = 0; i < 5; i++) R.npc.addSlot('ช่อง ' + i);
  ok(!R.npc.addSlot('ช่องที่เจ็ด').ok && R.npc.slots().length === 6, 'เต็ม 6 ช่องแล้วเพิ่มไม่ได้ ต้องลบก่อน');
  let nCaptured = null;
  await R.generate('chat', { contents: [{ role: 'user', parts: [{ text: 'สวัสดี' }] }], systemInstruction: 'ระบบ', npcMemory: true }, { onDevice: async (q) => { nCaptured = q; return 'ดี'; } });
  ok(nCaptured && nCaptured.systemInstruction.includes('ชอบกาแฟ') && nCaptured.systemInstruction.indexOf('ระบบ') === 0, 'ความจำถูกใส่เฉพาะคำขอไปโมเดลในเครื่องที่ขอ npcMemory');
  nCaptured = null;
  await R.generate('chat', { contents: [{ role: 'user', parts: [{ text: 'สวัสดี' }] }], systemInstruction: 'ระบบ' }, { onDevice: async (q) => { nCaptured = q; return 'ดี'; } });
  ok(nCaptured && !nCaptured.systemInstruction.includes('ชอบกาแฟ'), 'คำขอที่ไม่ได้ขอความจำไม่มีช่องความจำ');
  R.list().forEach(e => { if (e.id !== 'nd') R.setEnabled(e.id, false); });
  R.add({ id: 'pub2', label: 'สาธารณะ2', kind: 'compat', url: 'https://q.example/openai', model: 'openai', publicOnly: true, enabled: true, roles: ['memory'] });
  R.PUBLIC.gapMs = 0;
  let pubFetch = mockFetch(() => ({ body: okChat('ตอบ') }));
  await R.generate('memory', { contents: [{ role: 'user', parts: [{ text: 'ข้อความสาธารณะ' }] }], systemInstruction: 'ชอบกาแฟ ความลับ', npcMemory: true, dataClass: 'public' }, { fetch: pubFetch });
  ok(!JSON.stringify(pubFetch.calls[0].body).includes('ชอบกาแฟ'), 'ความจำไม่ถูกส่งไปผู้ให้บริการสาธารณะแม้ขอ npcMemory');
  ok(R.npc.status().state === 'พร้อม' || R.npc.status().state === 'รอเวลา', 'สถานะมีค่าที่รู้จักหลังเรียก');
  const nSnap = R.npc.snapshot();
  ok(nSnap.counters.ok >= 1 && nSnap.counters.days === 1 && nSnap.counters.streak === 1, 'ตัวนับเพิ่มหลังเรียกสำเร็จ: วันแรกและต่อเนื่องหนึ่งวัน');
  ok(!R.npc.setMode('สนุก').ok && R.npc.setMode('กระชับ').ok, 'โหมดสนุกยังล็อกก่อนครบ 7 วัน โหมดอื่นใช้ได้');
  const nOk = R.npc.status(); ok(nOk.state !== 'ปิด', 'มีผู้ให้บริการสาธารณะที่เปิดอยู่ สถานะไม่เป็นปิด');
  R.PUBLIC.gapMs = 30000;
  await R.generate('memory', { contents: [{ role: 'user', parts: [{ text: 'ถามถี่อีกข้อ' }] }], dataClass: 'public' }, { fetch: pubFetch }).catch(() => null);
  ok(R.npc.status().state === 'รอเวลา' && R.npc.status().secs > 0, 'เรียกถี่เกินทำให้สถานะเป็นรอเวลาพร้อมจำนวนวินาที');
  const nWhite = JSON.parse(mem['nino.llm.npc'] || '{}');
  const nKeys = Object.keys(nWhite).filter(k => !['v', 'mode', 'slots', 'c', 'pub'].includes(k));
  const nCKeys = Object.keys(nWhite.c || {}).filter(k => !['uses', 'ok', 'cache', 'quota', 'days', 'streak', 'first', 'last'].includes(k));
  const nSlotKeys = (nWhite.slots || []).reduce((a, x) => a.concat(Object.keys(x).filter(k => !['text', 't'].includes(k))), []);
  ok(nKeys.length === 0 && nCKeys.length === 0 && nSlotKeys.length === 0, 'ที่เก็บสถานะมีเฉพาะตัวนับ เวลา และช่องความจำที่ผู้ใช้เขียน');
  ok(!String(mem['nino.llm.npc']).includes('ข้อความสาธารณะ') && !String(mem['nino.llm.cache'] || '').includes('ถามถี่'), 'สถานะไม่เก็บเนื้อหาข้อความของผู้ใช้');
  const R7seed = { v: 1, mode: 'สุภาพ', slots: [{ text: 'ชอบกาแฟ', t: Date.now() }], c: { uses: 0, ok: 0, cache: 0, quota: 0, days: 7, streak: 3, first: '', last: '' }, pub: { cat: '', t: 0, retry: 0 } };
  mem['nino.llm.npc'] = JSON.stringify(R7seed);
  const R7 = freshRoster();
  R7.PUBLIC.gapMs = 0;
  ok(R7.npc.setMode('สนุก').ok, 'ครบ 7 วันแล้วปลดล็อกโหมดสนุก');
  let r7Fetch = mockFetch(() => ({ body: okChat('มุกดี') }));
  await R7.generate('memory', { contents: [{ role: 'user', parts: [{ text: 'เล่นมุกหน่อย' }] }], dataClass: 'public' }, { fetch: r7Fetch }).catch(() => null);
  ok(r7Fetch.calls[0] && r7Fetch.calls[0].body.messages[0].content === R7.MODES['สนุก'], 'โหมดสนุกส่งเฉพาะข้อความบุคลิกของโหมดสนุก');
  R7.PUBLIC.gapMs = 0;
  let r7Retry = mockFetch(() => ({ status: 402, headers: { get: (k) => (k === 'retry-after' ? '45' : null) }, body: 'เกินโควตา' }));
  await R7.generate('memory', { contents: [{ role: 'user', parts: [{ text: 'ข้อโควตาเต็ม' }] }], dataClass: 'public' }, { fetch: r7Retry }).catch(() => null);
  const r7s = R7.npc.status();
  ok(r7s.state === 'รอเวลา' && r7s.secs >= 40 && r7s.secs <= 45, 'Retry-After จากผู้ให้บริการทำให้รอเวลาตามที่ผู้ให้บริการบอก (' + r7s.secs + ' วินาที)');
  R7.npc.clear();
  const r7c = R7.npc.snapshot();
  ok(r7c.mode === 'สุภาพ' && r7c.slots.length === 0 && r7c.counters.days === 0 && !String(mem['nino.llm.npc']).includes('ชอบกาแฟ'), 'ล้างแล้วกลับไปค่าเริ่มต้น ไม่เหลือช่องความจำ');

  console.log('== รีวิวสกิลด้วยมิ้ม: ในเครื่องก่อน สาธารณะเป็นตัวสำรอง');
  R.list().forEach(e => R.setEnabled(e.id, false));
  R.add({ id: 'lw', label: 'ในเครื่อง', kind: 'on-device', roles: ['worker'], enabled: true, priority: 100 });
  R.add({ id: 'pw', label: 'สาธารณะ', kind: 'compat', url: 'https://w.example/openai', model: 'openai', publicOnly: true, enabled: true, roles: ['worker'], priority: 900 });
  R.PUBLIC.gapMs = 0;
  let wLocal = 0;
  let rv = await R.generate('worker', { contents: [{ role: 'user', parts: [{ text: 'รีวิวสกิลนี้' }] }], dataClass: 'public' }, { onDevice: async () => { wLocal++; return 'สรุปในเครื่อง'; }, fetch: async () => { throw new Error('ไม่ควรถูกเรียก'); } });
  ok(rv.by === 'lw' && rv.text === 'สรุปในเครื่อง' && wLocal === 1, 'รีวิวสกิล: ใช้โมเดลในเครื่องก่อนเสมอเมื่อพร้อม');
  const skillText = 'สกิลตัวอย่าง ' + 'ก'.repeat(5000);
  const pfW = mockFetch(() => ({ body: okChat('สรุปสาธารณะ') }));
  rv = await R.generate('worker', { contents: [{ role: 'user', parts: [{ text: skillText }] }], dataClass: 'public' }, { onDevice: async () => { throw new Error('โมเดลในเครื่องยังไม่พร้อม'); }, fetch: pfW });
  ok(rv.by === 'pw' && rv.text === 'สรุปสาธารณะ', 'ถ้าโมเดลในเครื่องไม่พร้อม ใช้ตัวสาธารณะเป็นตัวสำรอง');
  const sentLen = String((pfW.calls[0].body.messages[1] || {}).content || '').length;
  ok(sentLen <= R.PUBLIC.maxInput, 'สกิลยาวถูกตัดให้ไม่เกินขนาดที่กำหนดก่อนส่งออก (' + sentLen + ' ตัวอักษร)');

  console.log('== ให้มิ้มอ่านสกิล: ป้ายสาธารณะ เส้นทาง และขนาดคำตอบ');
  ok(R.skillDataClass('# ชื่อ\nสาธารณะ: ใช่\nเนื้อหา') === 'public' && R.skillDataClass('# ชื่อ\nเนื้อหา\nสาธารณะ: ใช่') === 'public', 'หัวไฟล์ที่มีบรรทัด "สาธารณะ: ใช่" เป็นสาธารณะ');
  ok(R.skillDataClass('# ฉบับร่างจากห้องเรียน\nเนื้อหา') === undefined && R.skillDataClass('x\n'.repeat(12) + 'สาธารณะ: ใช่') === undefined, 'สกิลไม่มีป้าย หรือป้ายอยู่นอกหัวไฟล์ เป็นส่วนตัว');
  R.list().forEach(e => R.setEnabled(e.id, false));
  R.add({ id: 'lw2', label: 'ในเครื่อง2', kind: 'on-device', roles: ['worker'], enabled: true, priority: 100 });
  R.add({ id: 'pw2', label: 'สาธารณะ2', kind: 'compat', url: 'https://w2.example/openai', model: 'openai', publicOnly: true, enabled: true, roles: ['worker'], priority: 900 });
  R.PUBLIC.gapMs = 0;
  const privSkill = { name: 'บันทึกส่วนตัว', body: '# บันทึกส่วนตัว\nเบอร์โทรของฉันคือ 0812345678\nเนื้อหาอื่น' };
  const pvFetch = mockFetch(() => ({ body: okChat('ไม่ควรถูกเรียก') }));
  let pvErr = null;
  try { await R.reviewSkill(privSkill, { fetch: pvFetch, onDevice: async () => { throw new Error('ยังไม่พร้อม'); } }); } catch (err) { pvErr = err; }
  ok(pvErr && pvErr.code === 'ALL_FAILED' && pvFetch.calls.length === 0, 'สกิลส่วนตัวไม่ถูกส่งไปผู้ให้บริการสาธารณะเลย แม้เครื่องไม่พร้อม');
  const pubSkill = { name: 'สกิลสาธารณะ', body: '# สกิลสาธารณะ\nสาธารณะ: ใช่\n' + 'บรรทัดของเนื้อหา\n'.repeat(3000) };
  const pubFetch2 = mockFetch(() => ({ body: okChat(['บรรทัด 1', 'บรรทัด 2', 'บรรทัด 3', 'บรรทัด 4', 'บรรทัด 5', 'บรรทัด 6', 'บรรทัด 7'].join('\n')) }));
  const rvp = await R.reviewSkill(pubSkill, { fetch: pubFetch2, onDevice: async () => { throw new Error('ยังไม่พร้อม'); } });
  ok(rvp.by === 'pw2' && rvp.text.split('\n').length === 5 && rvp.text.length <= 600, 'สกิลสาธารณะรีวิวผ่านตัวสำรอง คำตอบไม่เกิน 5 บรรทัด');
  const sentBody = String(pubFetch2.calls[0].body.messages[1].content || '');
  ok(sentBody.includes('ชื่อสกิล: สกิลสาธารณะ') && sentBody.length <= R.PUBLIC.maxInput, 'คำขอสาธารณะมีชื่อสกิลและถูกตัดไม่เกินขนาดที่กำหนด');
  let lwCalls = 0;
  const lr = await R.reviewSkill(privSkill, { onDevice: async () => { lwCalls++; return 'สรุปในเครื่อง'; }, fetch: async () => { throw new Error('ไม่ควรถูกเรียก'); } });
  ok(lr.by === 'lw2' && lr.text === 'สรุปในเครื่อง' && lwCalls === 1, 'สกิลส่วนตัวรีวิวในเครื่องได้');

  console.log('== สกิลส่วนตัวใช้ได้เฉพาะโมเดลในเครื่อง (ปิดทางคลาวด์ที่ตั้ง worker ไว้)');
  R.setEnabled('lw2', false);
  R.add({ id: 'cl3', label: 'คลาวด์ธรรมดา', kind: 'compat', url: 'https://c3.example/v1', model: 'm', key: 'sk-CLOUD-3', enabled: true, roles: ['worker'], priority: 50 });
  const clFetch = mockFetch(() => ({ body: okChat('ไม่ควรถูกเรียก') }));
  let clErr = null;
  try { await R.reviewSkill(privSkill, { fetch: clFetch, onDevice: async () => { throw new Error('ยังไม่พร้อม'); } }); } catch (err) { clErr = err; }
  ok(clErr && clErr.code === 'NO_ROUTE' && clFetch.calls.length === 0, 'สกิลส่วนตัวไม่ไปถึงคลาวด์ที่ตั้ง worker ไว้ และไม่สำรองไปคลาวด์');
  R.setEnabled('lw2', true);
  let lw2Calls = 0;
  const lr2 = await R.reviewSkill(privSkill, { fetch: clFetch, onDevice: async () => { lw2Calls++; return 'สรุปในเครื่อง2'; } });
  ok(lr2.by === 'lw2' && lw2Calls === 1 && clFetch.calls.length === 0, 'สกิลส่วนตัวใช้โมเดลในเครื่องเท่านั้นแม้มีคลาวด์ลำดับต่ำกว่า');
  R.setEnabled('cl3', false);

  console.log('');
  console.log('ผ่าน ' + pass

 + ' · ไม่ผ่าน ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
