/* ความจำแชตในเบราว์เซอร์ (จริง): chatTurn ของ focus-chat ย่อข้อความเก่า ส่งสรุปเข้า system prompt จริง
   แล้วคงอยู่หลังบันทึกและรีโหลด โมเดลเป็นตัวจำลองที่ตอบได้ก็ต่อเมื่อรหัสอยู่ในสิ่งที่ส่งไป (ไม่ใช้เครือข่าย)
   รัน: node tools/test/chat-memory-ui-test.js (ต้องมี Chromium ดู tools/TESTS.md ข้อ 5) */
'use strict';
const H = require('./harness.js');
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TURNS = 60;
const FACTS = [
  { turn: 2, name: 'โปรเจกต์ A', code: 'NIM-4100' },
  { turn: 20, name: 'ห้องทดลอง', code: 'NIM-4137' },
  { turn: 40, name: 'ฐานข้อมูลลูกค้า', code: 'NIM-4174' }
];

// ตัวจำลองโมเดล: ติดตั้งในหน้า (geminiGenerate) บันทึกทุกคำขอ ตอบรหัสได้ถ้ารหัสอยู่ใน system prompt หรือบทสนทนาที่ส่งไป
async function stubModel(P) {
  await P.evaluate(() => {
    window.__reqs = [];
    window.geminiGenerate = async function (o) {
      var sys = String(o.systemInstruction || '');
      var isSum = sys.indexOf('สรุปบทสนทนา') === 0;
      var hay = sys + ' ' + JSON.stringify(o.contents || []);
      window.__reqs.push({ sum: isSum, sys: sys, hay: hay });
      if (isSum) return 'สรุปภาพรวม: ผู้ใช้ให้รหัสโปรเจกต์ไว้หลายรายการ';
      var last = (o.contents || []).slice(-1)[0];
      var q = last && last.parts && last.parts[0] ? last.parts[0].text : '';
      var mm = /รหัสของ(.+?)คืออะไร/.exec(q);
      if (!mm) return 'รับทราบ';
      var name = mm[1].trim();
      var re = new RegExp('รหัสของ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' คือ (NIM-\\d+)');
      var hit = re.exec(hay);
      return hit ? hit[1] : 'ไม่ทราบ';
    };
  });
}

async function turn(P, text) {
  return P.evaluate(async (t) => {
    session.messages.push({ sender: 'user', text: t, ts: Date.now() });
    var r = await ninoFocusChat.chatTurn(t);
    session.messages.push({ sender: 'nino', reply: r.reply, action: 'explain', ts: Date.now() });
    return r.reply;
  }, text);
}

(async () => {
  console.log('== ความจำแชต (เบราว์เซอร์จริง)');
  const h = await H.start();
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1500);
  ok(await P.evaluate(() => !!(window.ninoChatMemory && window.ninoFocusChat && typeof session !== 'undefined')), 'ninoChatMemory, ninoFocusChat และ session โหลดแล้ว');
  await stubModel(P);
  await P.evaluate(() => { try { localStorage.setItem('nino.focus', 'c'); } catch (e) { /* ไม่มีที่เก็บ ก็ยังทดสอบได้ */ } });

  // คุยต่อเนื่องหลายรอบ ข้อเท็จจริงฝังไว้ตามเทิร์นที่กำหนด
  const replies = [];
  for (let t = 0; t < TURNS; t++) {
    const f = FACTS.find(x => x.turn === t);
    const text = f ? 'จำไว้นะ รหัสของ' + f.name + ' คือ ' + f.code : 'เล่าเรื่องรอบที่ ' + t + ' ชอบดูหนังแนวไหนดี';
    replies.push(await turn(P, text));
  }
  ok(replies.length === TURNS && replies.every(r => r && r.length > 0), 'chatTurn ตอบครบทุกเทิร์น');
  const sums = await P.evaluate(() => window.__reqs.filter(r => r.sum).length);
  ok(sums >= 5, 'โมเดลสรุปถูกเรียกเป็นชุด (เรียก ' + sums + ' ครั้ง)');
  const st = await P.evaluate(() => ({ source: session.chatSummary && session.chatSummary.source, len: session.chatSummary && session.chatSummary.text.length, model: session.chatSummary && session.chatSummary.modelText }));
  ok(st.source === 'model+rule' && st.len > 0 && st.len <= 1800, 'session.chatSummary มีทั้งสรุปโมเดลและกฎ (' + st.source + ', ' + st.len + ' ตัวอักษร)');
  ok(!!st.model && st.model.indexOf('สรุปภาพรวม') === 0, 'สรุปโมเดลถูกเก็บแยก');
  const withBlock = await P.evaluate(() => window.__reqs.filter(r => !r.sum && r.sys.indexOf('[ความจำจากบทสนทนาก่อนหน้า') >= 0).length);
  ok(withBlock >= TURNS - 20, 'คำขอของแชตที่ยาวแล้วมีบล็อกความจำใน system prompt (' + withBlock + ')');

  // ถามข้อเท็จจริงทั้งสาม (รวมอันที่อยู่นอกหน้าต่าง 16 ข้อความไกลมาก)
  const answers = [];
  for (const f of FACTS) answers.push(await turn(P, 'รหัสของ' + f.name + 'คืออะไร'));
  FACTS.forEach((f, i) => ok(answers[i] === f.code, 'ตอบรหัสของ ' + f.name + ' ได้ ' + f.code + ' (ได้ ' + answers[i] + ')'));

  // บันทึกลงเครื่องแล้วรีโหลด: สรุปต้องกลับมาและยังถามต่อได้
  await P.evaluate(() => ninoThreads.save());
  await sleep(300);
  const saved = await P.evaluate(async () => {
    var id = ninoThreads.current();
    var rec = await DB.get('sessions', id);
    return { id: id, text: rec && rec.chatSummary && rec.chatSummary.text, model: rec && rec.chatSummary && rec.chatSummary.modelText };
  });
  const before = await P.evaluate(() => session.chatSummary.text);
  ok(!!saved.id && saved.text === before, 'สรุปถูกบันทึกไปกับแชตใน IndexedDB');
  await P.reload({ waitUntil: 'load' });
  await sleep(2500);
  await stubModel(P);
  await P.evaluate(() => { try { localStorage.setItem('nino.focus', 'c'); } catch (e) { /* ไม่มีที่เก็บ */ } });
  const restored = await P.evaluate(() => session.chatSummary && session.chatSummary.text);
  ok(restored === before, 'หลังรีโหลด เปิดแชตเดิมแล้วสรุปกลับมาครบ');
  const again = await turn(P, 'รหัสของ' + FACTS[0].name + 'คืออะไร');
  ok(again === FACTS[0].code, 'หลังรีโหลดยังตอบรหัสรอบแรกได้ (' + again + ')');

  // แชตใหม่: สรุปต้องหายไป ไม่รั่วไปแชตอื่น
  await P.evaluate(() => ninoThreads.newChat());
  await sleep(300);
  ok(await P.evaluate(() => session.chatSummary === null), 'แชตใหม่เริ่มด้วยความจำว่าง');

  console.log('');
  console.log('ผ่าน ' + pass + ' · ไม่ผ่าน ' + fail);
  await h.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
