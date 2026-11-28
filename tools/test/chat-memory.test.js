/* ความจำระยะยาวของแชต (js/chat-memory.js) ไม่ใช้เบราว์เซอร์ ไม่ใช้เครือข่าย
   รัน: node tools/test/chat-memory.test.js
   เกณฑ์ 100%: 12 ข้อเท็จจริงที่บอกไว้ในข้อความที่ 1-290 ต้องอยู่ในสิ่งที่ส่งให้โมเดลตอนถาม (ชุดทดสอบที่กำหนด)
   และทุกคำขอต้องไม่เกิน BUDGET_CHARS และคำล่าสุด 16 ข้อความต้องเหมือนต้นฉบับทุกตัวอักษร */
'use strict';
const M = require('../../js/chat-memory.js');

let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('  FAIL: ' + name); } }
const BUDGET_CHARS = 12000;   // ขนาดคำขอสูงสุดที่ยอมรับ (ตัวอักษร) รวม system prompt ฐาน
const BASE_SYS = 'คุณคือ NINO ผู้ช่วยในแอป ตอบเป็นภาษาไทย'.repeat(10); // ~400 ตัวอักษร

// ข้อความเติมที่ไม่มีตัวเลขและคำสำคัญ (คู่ควบคุม)
const FILLER_U = ['เล่าเรื่องอะไรให้ฟังหน่อย', 'วันนี้อากาศเป็นยังไงบ้าง', 'ชอบดูหนังแนวไหนดี', 'ขอคำแนะนำเรื่องการทำอาหารหน่อย',
  'เพลงนี้ฟังแล้วสบายใจมาก', 'เมื่อวานไปเที่ยวทะเลมา', 'อยากลองทำกาแฟเอง', 'แนะนำหนังสือสนุก ๆ สักเล่ม'];
const FILLER_M = ['ได้เลย เรื่องนี้น่าสนใจมาก มาคุยต่อกันได้เลย ลองเล่าเพิ่มอีกนิดได้ไหม', 'เข้าใจแล้ว มีอะไรให้ช่วยอีกไหมครับ เรายังคุยต่อได้',
  'เป็นความคิดที่ดี ลองค่อย ๆ ทำไปทีละขั้นนะ ไม่ต้องรีบ'];
function filler(i, numbers) {
  const u = FILLER_U[i % FILLER_U.length] + ' รอบที่' + ['หนึ่ง', 'สอง', 'สาม', 'สี่'][i % 4];
  const u2 = numbers && i % 3 === 0 ? u + ' ประมาณ ' + (i % 90 + 10) + ' นาที' : u;
  return { u: u2, m: FILLER_M[i % FILLER_M.length] };
}

// ผู้ช่วยจำลอง: ตอบได้ก็ต่อเมื่อรหัสของข้อเท็จจริงอยู่ในคำขอที่ส่งไป
function fakeModelKnows(prompt, code) { return prompt.indexOf(code) >= 0; }

// จำลองหนึ่งบทสนทนา ตามที่ focus-chat ทำ: ตอบด้วยข้อความ 16 ล่าสุด + สรุป (อัปเดตก่อนตอบ)
async function simulate(opts) {
  const ms = [];
  let state = null, maxPrompt = 0, calls = 0, fresh = 0;
  const facts = opts.facts || [];
  const summarize = opts.summarize === undefined ? null : opts.summarize;
  const wrapped = summarize ? async (prev, f) => { calls++; fresh += f.length; return summarize(prev, f); } : null;
  const N = opts.turns;
  for (let t = 0; t < N; t++) {
    const fact = facts.find(f => f.turn === t);
    let u = fact ? fact.text : filler(t, opts.numbers).u;
    if (opts.unique && !fact) u += ' #' + t;   // ทำให้ทุกข้อความไม่ซ้ำ (ใช้ตรวจการส่งซ้ำ)
    const m = fact ? 'รับทราบแล้ว จำไว้แล้วครับ' : filler(t, opts.numbers).m;
    ms.push({ sender: 'user', text: u });
    const gi = ms.length;
    const older = M.normalize(ms.slice(0, Math.max(0, gi - M.RECENT_N)));
    state = await M.update(state, older, wrapped || null);
    const recent = M.normalize(ms.slice(0, gi).slice(-M.RECENT_N));
    const prompt = BASE_SYS + M.systemBlock(state) + recent.map(x => x.text).join('\n');
    maxPrompt = Math.max(maxPrompt, prompt.length);
    ms.push({ sender: 'nino', reply: opts.unique && !fact ? m + ' #' + t : m });
  }
  // คำถามท้ายบท: ถามถึงทุกข้อเท็จจริง
  const answered = [];
  for (const f of facts) {
    const gi = ms.length + 1;
    ms.push({ sender: 'user', text: 'ถามหน่อย ' + f.ask });
    const older = M.normalize(ms.slice(0, Math.max(0, gi - M.RECENT_N)));
    state = await M.update(state, older, wrapped || null);
    const recent = M.normalize(ms.slice(0, gi).slice(-M.RECENT_N));
    const prompt = BASE_SYS + M.systemBlock(state) + recent.map(x => x.text).join('\n');
    maxPrompt = Math.max(maxPrompt, prompt.length);
    answered.push(fakeModelKnows(prompt, f.code));
    ms.push({ sender: 'nino', reply: 'ok' });
  }
  return { answered, maxPrompt, state, calls, fresh, total: ms.length };
}

function makeFacts(n, span) {
  const names = ['โปรเจกต์ A', 'โปรเจกต์ B', 'ห้องทดลอง', 'ทีมออกแบบ', 'คลังภาพ', 'ระบบชำระเงิน', 'ฐานข้อมูลลูกค้า', 'แอปเวอร์ชันทดสอบ', 'ไลบรารีกราฟ', 'เซิร์ฟเวอร์สำรอง', 'ตารางงาน', 'บัญชีทดลอง'];
  const out = [];
  for (let i = 0; i < n; i++) {
    const code = 'NIM-' + (4100 + i * 37);
    const turn = Math.floor(5 + (i * span) / n);
    out.push({ turn: turn, code: code, text: 'จำไว้นะ รหัสของ' + names[i % names.length] + ' คือ ' + code, ask: 'รหัสของ' + names[i % names.length] + 'คืออะไร' });
  }
  return out;
}

(async () => {
  console.log('== การตัดและลายนิ้วมือ');
  const sample = [{ sender: 'user', text: 'a' }, { sender: 'nino', reply: 'b' }, { sender: 'user', text: '  ' }, { sender: 'nino', reply: '{"reply":"c"}' }, { sender: 'user', text: 'd', streaming: true }];
  const norm = M.normalize(sample);
  ok(JSON.stringify(norm) === JSON.stringify([{ role: 'user', text: 'a' }, { role: 'model', text: 'b' }, { role: 'model', text: 'c' }]), 'normalize skips empty/streaming and unwraps JSON replies');
  ok(M.hashPrefix(norm, 2) === M.hashPrefix(norm.slice(0, 2), 2), 'hashPrefix is stable for the same prefix');
  const edited = norm.slice(); edited[0] = Object.assign({}, edited[0], { text: 'แก้ไขแล้ว' });
  ok(M.hashPrefix(norm, 2) !== M.hashPrefix(edited, 2), 'hashPrefix changes when an old message is edited');
  ok(M.systemBlock(null) === '' && M.systemBlock(M.emptyState()) === '', 'systemBlock is empty without a summary');
  ok(M.systemBlock({ text: 'สรุปทดสอบ' }).indexOf('สรุปทดสอบ') >= 0, 'systemBlock carries the summary');

  console.log('== ต่อเนื่อง 300 ข้อความ: ข้อเท็จจริง 12 ข้อ (ชุดทดสอบ)');
  const facts = makeFacts(12, 285);
  const r = await simulate({ turns: 300, facts: facts });
  const recall = r.answered.filter(Boolean).length;
  console.log('  ข้อเท็จจริงที่ยังตอบได้: ' + recall + ' / ' + facts.length + ' · คำขอยาวสุด ' + r.maxPrompt + ' ตัวอักษร · สรุป ' + (r.state.text || '').length + ' ตัวอักษร (' + r.state.source + ')');
  ok(recall === facts.length, 'recall 100% of seeded facts after 300 turns (' + recall + '/' + facts.length + ')');
  ok(r.maxPrompt <= BUDGET_CHARS, 'every prompt stays within budget (' + r.maxPrompt + ' <= ' + BUDGET_CHARS + ')');
  ok((r.state.text || '').length <= M.MAX_CHARS, 'summary stays within MAX_CHARS');

  console.log('== คำล่าสุดส่งคำต่อคำ');
  const ms2 = []; for (let i = 0; i < 40; i++) ms2.push({ sender: i % 2 ? 'nino' : 'user', text: 'ข้อความที่ ' + i, reply: 'ตอบที่ ' + i });
  const last16 = M.normalize(ms2.slice(-M.RECENT_N));
  ok(last16.length === M.RECENT_N && last16[0].text === 'ข้อความที่ 24' && last16[15].text === 'ตอบที่ 39', 'recent window is the last 16 messages verbatim');

  console.log('== ย่อเพิ่มทีละส่วน (ไม่ย่อซ้ำ)');
  const seen = []; let calls = 0;
  const spy = async (prev, f) => { calls++; f.forEach(x => seen.push(x.text)); return 'สรุปจำลอง ' + calls; };
  const r2 = await simulate({ turns: 120, facts: [], summarize: spy, unique: true });
  // ข้อความที่ส่งเข้าสรุปโมเดลรวม (รวมทั้งสองฝ่าย) ต้องไม่ซ้ำ และเหลือค้างได้ไม่เกิน MODEL_MIN_FRESH - 1 รายการ
  const expectedOlder = 240 - M.RECENT_N;            // 120 รอบ = 240 ข้อความ เว้นล่าสุด 16
  const expectedNoDup = new Set(seen).size === seen.length;
  ok(expectedNoDup && seen.length >= expectedOlder - (M.MODEL_MIN_FRESH - 1) && seen.length <= expectedOlder,
    'each older message is sent to the model at most once (' + seen.length + ' of ' + expectedOlder + ')');
  ok(r2.state.source === 'model+rule' && r2.state.modelText.indexOf('สรุปจำลอง') === 0, 'model summary is kept and used when enough new messages arrive');
  ok(M.systemBlock(r2.state).indexOf(r2.state.modelText) >= 0, 'systemBlock includes the model summary');

  console.log('== แก้ข้อความเก่า: สรุปเดิมต้องถูกทิ้งและย่อใหม่');
  const base = M.normalize(ms2.slice(0, 30));
  let st = await M.update(null, base, null);
  const changed = base.slice(); changed[3] = Object.assign({}, changed[3], { text: 'ข้อความที่ถูกแก้ไขแล้ว' });
  let seenFresh = -1;
  const sp2 = async (prev, f) => { seenFresh = f.length; return 'ใหม่'; };
  st = await M.update(st, changed, sp2);
  ok(seenFresh === changed.length && st.modelText === 'ใหม่', 'editing an older message resets the summary and re-summarizes everything');

  console.log('== ตัวสรุปพัง: ต้องไม่ล้ม ใช้กฎแทน');
  const boom = async () => { throw new Error('เครือข่ายล่ม'); };
  const older3 = M.normalize(ms2.slice(0, 40).concat([]));
  let s3;
  let threw = false;
  try { s3 = await M.update(null, older3, boom); } catch (e) { threw = true; }
  ok(!threw && s3 && s3.source === 'rule' && s3.text.length > 0, 'a failing summarizer falls back to the rule summary without throwing');

  console.log('== ข้อความที่ยาวเกินไป: เพดานต้องถูกยึด');
  const huge = []; for (let i = 0; i < 400; i++) huge.push({ role: 'user', text: 'ข้อความยาวมาก '.repeat(40) + i });
  const sh = await M.update(null, huge, null);
  ok(sh.text.length <= M.MAX_CHARS + 10, 'extractive summary respects MAX_CHARS on very long history (' + sh.text.length + ')');

  console.log('== ความสำคัญ: บรรทัดที่มีข้อกำหนดถูกเก็บก่อนข้อความทั่วไป');
  const mixed = []; for (let i = 0; i < 300; i++) mixed.push({ role: 'user', text: i === 10 ? 'ห้ามลบไฟล์ config.json เด็ดขาด' : 'คุยเล่นเรื่องทั่วไปไม่มีอะไรสำคัญ '.repeat(3) + i });
  const sm = await M.update(null, mixed, null);
  ok(sm.text.indexOf('config.json') >= 0, 'a rule-marked user line survives heavy filler');

  console.log('== ทดลองหนัก (รายงานเฉย ๆ ไม่ตัดผ่านไม่ผ่าน): ตัวเลขปนในข้อความเติม 1 ใน 3');
  const heavyFacts = makeFacts(12, 285);
  const rh = await simulate({ turns: 300, facts: heavyFacts, numbers: true });
  console.log('  ข้อเท็จจริงที่ยังตอบได้: ' + rh.answered.filter(Boolean).length + ' / ' + heavyFacts.length + ' (ตัวเลขปนมาก มักทำให้ข้อเท็จจริงเก่าหลุดจากสรุป)');

  console.log('');
  console.log('ผ่าน ' + pass + ' · ไม่ผ่าน ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
