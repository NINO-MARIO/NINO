/* โมเดลที่เปิดพร้อมกัน (เบราว์เซอร์จริง): ฟอร์มเพิ่ม/เปิด/ทดสอบ/ลบ, แชตจริงส่งผ่านทะเบียน, ทางเดิมเมื่อปิดทั้งหมด,
   สรุปความจำผ่านบทบาท summary, และคงอยู่หลังรีโหลด ไม่มีคีย์บนหน้าจอ ไม่ใช้เครือข่ายจริง (fetch จำลอง)
   รัน: node tools/test/llm-roster-ui-test.js (ต้องมี Chromium ดู tools/TESTS.md ข้อ 5) */
'use strict';
const H = require('./harness.js');
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEY = 'sk-SECRET-UI-7781';

(async () => {
  console.log('== โมเดลที่เปิดพร้อมกัน (เบราว์เซอร์จริง)');
  const h = await H.start();
  const P = h.page;
  P.on('dialog', d => d.accept());
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1500);
  ok(await P.evaluate(() => !!(window.ninoRoster && window.ninoRosterUI && window.ninoFocusChat)), 'ninoRoster, ninoRosterUI และ ninoFocusChat โหลดแล้ว');
  await P.evaluate(() => { try { localStorage.removeItem('nino.llm.roster'); } catch (e) { /* ไม่มีที่เก็บ */ } });

  await P.evaluate(() => { const d = document.createElement('div'); d.id = 'rt-host'; document.body.appendChild(d); ninoRosterUI.mount(d); });
  ok(await P.evaluate(() => /ยังไม่มีโมเดล/.test(document.getElementById('rt-host').textContent)), 'เริ่มต้นแสดงว่ายังไม่มีโมเดล');

  // เติม URL จากปุ่มพรีเซ็ต แล้วใส่ชื่อโมเดลและคีย์ ติ๊กบทบาท chat กับ summary
  await P.evaluate(() => {
    const host = document.getElementById('rt-host');
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent === 'DeepSeek');
    btn.click();
  });
  await P.fill('#rt-host input[type=password]', KEY);
  await P.fill('#rt-host input[placeholder="ชื่อโมเดล ตามเอกสารผู้ให้บริการ"]', 'deepseek-chat');
  await P.evaluate(() => {
    const host = document.getElementById('rt-host');
    const labels = [...host.querySelectorAll('label')];
    labels.find(l => l.textContent.trim() === 'สรุปความจำ').querySelector('input').checked = true;
  });
  await P.evaluate(() => { const host = document.getElementById('rt-host'); [...host.querySelectorAll('button')].find(b => b.textContent === 'เพิ่ม').click(); });
  await sleep(200);
  const added = await P.evaluate(() => ninoRoster.list());
  ok(added.length === 1 && added[0].enabled && added[0].roles.join() === 'chat,summary', 'เพิ่มโมเดลแล้ว เปิดไว้ และมีบทบาท chat กับ summary');
  ok(await P.evaluate((k) => !document.getElementById('rt-host').textContent.includes(k), KEY), 'คีย์ไม่ปรากฏบนหน้าจอ');
  ok(await P.evaluate(() => {
    const host = document.getElementById('rt-host');
    return host.querySelector('input[type=password]').value === '';
  }), 'ช่องคีย์ถูกล้างหลังเพิ่ม');

  // ฟอร์มตรวจความถูกต้อง: URL ผิดต้องไม่เพิ่ม
  await P.fill('#rt-host input[placeholder="URL (https://…/v1)"]', 'ftp://bad');
  await P.evaluate(() => { const host = document.getElementById('rt-host'); [...host.querySelectorAll('button')].find(b => b.textContent === 'เพิ่ม').click(); });
  await sleep(150);
  ok(await P.evaluate(() => /เพิ่มไม่ได้/.test(document.getElementById('rt-host').textContent) && ninoRoster.list().length === 1), 'URL ผิดแสดงสาเหตุและไม่เพิ่มรายการ');

  // เรียกผ่านทะเบียนจริง: stub fetch บันทึกคำขอ
  await P.evaluate(() => {
    window.__calls = [];
    window.ninoFetch = async (url, opts) => {
      const body = JSON.parse(opts.body || '{}');
      window.__calls.push({ url, auth: (opts.headers || {}).Authorization || '', body });
      const sys = (body.messages || []).find(m => m.role === 'system');
      const isSum = sys && /^สรุปบทสนทนา/.test(sys.content);
      const content = isSum ? 'สรุปจากทะเบียน' : 'คำตอบจาก DeepSeek';
      if (!isSum && body.stream) {
        window.__streamed = (window.__streamed || 0) + 1;
        const enc = new TextEncoder();
        const sse = ['คำตอบ', 'จาก DeepSeek'].map(p => 'data: ' + JSON.stringify({ choices: [{ delta: { content: p } }] }) + '\n\n').join('') + 'data: [DONE]\n\n';
        const bytes = enc.encode(sse);
        const stream = new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 9) c.enqueue(bytes.slice(i, i + 9)); c.close(); } });
        return { ok: true, status: 200, body: stream, text: async () => '' };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
    };
    window.geminiGenerate = async () => 'คำตอบทางเดิม';
    session.messages = [];
  });
  async function turn(text) {
    return P.evaluate(async (t) => {
      session.messages.push({ sender: 'user', text: t, ts: Date.now() });
      const r = await ninoFocusChat.chatTurn(t);
      session.messages.push({ sender: 'nino', reply: r.reply, action: 'explain', ts: Date.now() });
      return r.reply;
    }, text);
  }
  const r1 = await turn('สวัสดี');
  const c1 = await P.evaluate(() => window.__calls.filter(c => !/สรุป/.test(JSON.stringify(c.body))).slice(-1)[0]);
  ok(r1 === 'คำตอบจาก DeepSeek', 'แชตตอบจากโมเดลที่เปิดไว้ ไม่ใช่ทางเดิม (' + r1 + ')');
  ok(await P.evaluate(() => (window.__streamed || 0) >= 1), 'แชตขอคำตอบแบบสตรีมจากทะเบียนและได้รับทีละชิ้น');
  ok(c1 && c1.url === 'https://api.deepseek.com/chat/completions' && c1.auth === 'Bearer ' + KEY, 'ยิงไปที่ URL และคีย์ของ DeepSeek');
  ok(c1 && c1.body.messages[0].role === 'system' && c1.body.messages[0].content.indexOf('คุณคือ NINO') === 0, 'system prompt ของแอป (CSYS) ถูกส่งไปด้วย');

  // คุยจนเกินหน้าต่าง: สรุปต้องผ่านบทบาท summary
  for (let i = 0; i < 26; i++) { await turn('เล่าเรื่องรอบที่ ' + i + ' ชอบดูหนัง'); }
  const sumCalls = await P.evaluate(() => window.__calls.filter(c => /^สรุปบทสนทนา/.test((c.body.messages || [])[0].content || '')).length);
  ok(sumCalls >= 1, 'สรุปความจำถูกส่งผ่านบทบาท summary ของทะเบียน (' + sumCalls + ' ครั้ง)');
  ok(await P.evaluate(() => !!(session.chatSummary && session.chatSummary.modelText === 'สรุปจากทะเบียน')), 'สรุปที่ได้จากทะเบียนถูกเก็บในแชต');

  // ปิดโมเดลทั้งหมด: กลับไปใช้ทางเดิมของแอป
  await P.evaluate(() => {
    const host = document.getElementById('rt-host');
    host.querySelector('input[type=checkbox]').click(); // เปิด → ปิด
  });
  await sleep(100);
  ok(await P.evaluate(() => ninoRoster.list()[0].enabled === false), 'ปิดโมเดลจาก UI แล้ว');
  const r2 = await turn('ตอนนี้ใช้ทางเดิม');
  ok(r2 === 'คำตอบทางเดิม', 'ปิดทั้งหมดแล้วกลับไปใช้ทางเดิม (' + r2 + ')');

  // ปุ่มทดสอบ
  await P.evaluate(() => { const host = document.getElementById('rt-host'); host.querySelector('input[type=checkbox]').click(); });
  await P.evaluate(() => { const host = document.getElementById('rt-host'); [...host.querySelectorAll('button')].find(b => b.textContent === 'ทดสอบ').click(); });
  await sleep(400);
  ok(await P.evaluate(() => /ใช้ได้/.test(document.getElementById('rt-host').textContent)), 'ปุ่มทดสอบแสดงว่าใช้ได้');
  ok(await P.evaluate(() => ninoRosterUI.PRESETS.find(p => p.n === 'DeepSeek').url === 'https://api.deepseek.com'), 'พรีเซ็ต DeepSeek ใช้ base URL ตามเอกสาร (ไม่มี /v1)');
  ok(await P.evaluate(() => {
    const btn = (t) => [...document.querySelectorAll('#rt-host button')].find(x => x.textContent === t);
    btn('Pollinations (สาธารณะ)').click();
    document.querySelector('#rt-host input[placeholder="ชื่อโมเดล ตามเอกสารผู้ให้บริการ"]').value = 'openai';
    btn('เพิ่ม').click();
    const e = ninoRoster.list().find(x => x.label === 'Pollinations (สาธารณะ)');
    const good = !!e && e.publicOnly === true && e.enabled === false && e.roles.join() === 'worker' && e.priority === 900;
    if (e) ninoRoster.remove(e.id);
    return good;

  }), 'พรีเซ็ต Pollinations เพิ่มเป็นงานสาธารณะ บทบาท worker และปิดอยู่');
  // การ์ดมิ้ม: ช่องความจำ นิสัยที่ล็อก และการล้าง
  ok(await P.evaluate(() => /มิ้ม: สถานะและความจำ/.test(document.body.textContent)), 'การ์ดมิ้มแสดงอยู่บนหน้าโมเดล');
  ok(await P.evaluate(() => { const b = [...document.querySelectorAll('#rt-host button')].find(x => x.textContent.indexOf('สนุก') === 0); return !!b && b.disabled === true; }), 'โหมดสนุกล็อกไว้เมื่อใช้งานไม่ครบ 7 วัน');
  ok(await P.evaluate(() => {
    const inp = document.querySelector('#rt-host input[placeholder^="เช่น ชื่อที่อยากให้เรียก"]');
    inp.value = 'เรียกว่าน้องแพร';
    [...document.querySelectorAll('#rt-host button')].find(x => x.textContent === 'เพิ่มช่องความจำ').click();
    return ninoRoster.npc.snapshot().slots.length === 1 && document.body.textContent.indexOf('เรียกว่าน้องแพร') >= 0;
  }), 'เพิ่มช่องความจำจากหน้าจอได้และแสดงผล');
  ok(await P.evaluate(() => {
    const b = [...document.querySelectorAll('#rt-host button')].find(x => x.textContent === 'ล้างสถานะทั้งหมด');
    b.click();
    return ninoRoster.npc.snapshot().slots.length === 0 && ninoRoster.npc.snapshot().mode === 'สุภาพ';
  }), 'ปุ่มล้างสถานะทั้งหมดคืนค่าเริ่มต้น');

  ok(await P.evaluate(() => [...document.querySelectorAll('#rt-host button')].some(x => x.textContent === 'ให้มิ้มอ่านสกิลนี้')), 'การ์ดมิ้มมีปุ่มให้อ่านสกิล');
  ok(await P.evaluate(() => /✓/.test(
document.querySelector('#rt-host [data-hist]').textContent)), 'ประวัติการเรียกแสดงรายการที่สำเร็จหลังกดทดสอบ');

  ok(await P.evaluate(() => { const b = [...document.querySelectorAll('#rt-host button')].find(x => x.textContent === 'ล้างประวัติทั้งหมด'); if (!b) return false; window.confirm = () => true; b.click(); return ninoRoster.log().length === 0; }), 'ปุ่มล้างประวัติทั้งหมดบนหน้าจอทำงาน');

  // คำถามสำเร็จรูป: กดแล้วใส่ข้อความลงช่องพิมพ์ของแชท ไม่ส่งเอง
  const quickRes = await P.evaluate(() => {
    const b = [...document.querySelectorAll('#rt-host button')].find(x => x.textContent === 'สรุปสิ่งที่เราคุยกันไว้ให้หน่อย');
    if (!b) return { found: false };
    const ta = document.getElementById('prompt-input');
    if (ta) ta.value = '';
    b.click();
    return { found: true, value: ta ? ta.value : null, hasInput: !!ta };
  });
  ok(quickRes.found, 'การ์ดมิ้มมีปุ่มคำถามสำเร็จรูป');
  ok(quickRes.hasInput && quickRes.value === 'สรุปสิ่งที่เราคุยกันไว้ให้หน่อย', 'กดคำถามสำเร็จรูปแล้วใส่ข้อความลงช่องพิมพ์ของแชท');
  // ตัวนับเวลารอของมิ้ม: ขณะรอนับถอยหลังเองทุกวินาที และกลับเป็นพร้อมเมื่อพ้นเวลา
  const waitRes = await P.evaluate(async () => {
    const N = ninoRoster.npc, real = N.status, t0 = Date.now();
    const pause = (ms) => new Promise(r => setTimeout(r, ms));
    const wText = () => { const p = [...document.querySelectorAll('#rt-host p')].find(x => x.textContent.indexOf('มิ้ม: ') === 0); return p ? p.textContent : ''; };
    N.status = () => { const left = Math.max(0, 5 - Math.floor((Date.now() - t0) / 1000)); return left > 0 ? { state: 'รอเวลา', secs: left, text: 'รอเวลา อีก ' + left + ' วินาที' } : { state: 'พร้อม', secs: 0, text: 'พร้อม' }; };
    try {
      [...document.querySelectorAll('#rt-host button')].find(x => x.textContent === 'สุภาพ').click();
      const a = wText();
      await pause(2200);
      const m = wText();
      await pause(3600);
      const z = wText();
      return { a, m, z };
    } finally { N.status = real; }
  });
  ok(/อีก [45] วินาที/.test(waitRes.a), 'ตัวนับเวลารอแสดงจำนวนวินาทีที่เหลือ');
  ok(/อีก [123] วินาที/.test(waitRes.m) && waitRes.m !== waitRes.a, 'ตัวนับเวลารอนับถอยหลังเองทุกวินาทีโดยไม่ต้องกดซ้ำ (' + waitRes.m + ')');
  ok(/พร้อม/.test(waitRes.z) && !/รอเวลา/.test(waitRes.z), 'เมื่อพ้นเวลารอ ข้อความกลับเป็นพร้อม');

  ok(await P.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'หน้าโมเดลไม่มีการเลื่อนแนวนอนที่ความกว้างมือถือ');

  // คงอยู่หลังรีโหลด
  await P.reload({ waitUntil: 'load' });
  await sleep(1500);
  ok(await P.evaluate(() => ninoRoster.list().length === 1 && ninoRoster.list()[0].roles.join() === 'chat,summary'), 'รายการโมเดลคงอยู่หลังรีโหลด');

  // ลบ
  await P.evaluate(() => { ninoRosterUI.mount(document.body.appendChild(Object.assign(document.createElement('div'), { id: 'rt-host2' }))); });
  await P.evaluate(() => { const host = document.getElementById('rt-host2'); [...host.querySelectorAll('button')].find(b => b.textContent === 'ลบ').click(); });
  await sleep(150);
  ok(await P.evaluate(() => ninoRoster.list().length === 0), 'ลบโมเดลได้');

  console.log('');
  console.log('ผ่าน ' + pass + ' · ไม่ผ่าน ' + fail);
  await h.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
