// โหมด 1 (js/mim-llm.js): ดึงความรู้ของมิ้ม สร้างคำสั่ง ตรวจคำตอบ และเงื่อนไขการเรียกโมเดล (ไม่ใช้เครือข่าย)
// รัน: node tools/test/mim-llm.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const FLOOR = 30;
const DURIAN = 'ทุเรียนปลูกมากในภาคตะวันออกและภาคใต้ค่ะ';
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }

const sb = { console };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
const state = { ready: true, mode: 'mim', gen: null, calls: 0 };
sb.NINOLocalLLM = {
  mode: () => state.mode,
  isReady: () => state.ready,
  generate: async (a) => { state.calls++; state.lastArgs = a; return state.gen ? state.gen(a) : ''; }
};
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/mim-llm.js'), 'utf8'), sb, { filename: 'js/mim-llm.js' });
const M = sb.NINOMimLLM;

const entries = [
  { q: 'ทุเรียนปลูกที่ไหน', a: 'ทุเรียนปลูกมากในภาคตะวันออกและภาคใต้ค่ะ' },
  { q: 'แมวมีกี่ขา', a: 'แมวปกติมี 4 ขาค่ะ' },
  { q: 'ภาษาไทยมีกี่วรรณยุกต์', a: 'ภาษาไทยมี 5 วรรณยุกต์ค่ะ' }
];
const store = { entries };

// 1-2) การดึงความรู้
const hit = M.retrieve(entries, 'ทุเรียนปลูกที่ใดบ้าง', 3);
ok(hit.length >= 1 && hit[0].q === 'ทุเรียนปลูกที่ไหน', 'retrieve finds the durian entry first');
ok(M.retrieve(entries, 'ดาวอังคารมีกี่ดวง', 3).length === 0, 'unrelated question retrieves nothing');

// 3-5) ตัวตรวจคำตอบ
ok(/ชื่อโมเดล|บริษัท/.test(M.check('ฉันคือ SmolLM ค่ะ', hit)), 'foreign model name is rejected');
ok(M.check('ฉันคือ Qwen ค่ะ', hit) !== '', 'Qwen name is rejected');
ok(M.check('เครื่องบินบินด้วยความเร็วสูงมากๆเลยนะ', hit) !== '', 'ungrounded answer is rejected');
ok(M.check('ทุเรียนปลูกมากในภาคตะวันออกค่ะ', hit) === '', 'grounded paraphrase passes');
ok(M.check('ค่ะ', hit) !== '', 'too short answer is rejected');

// 6) คำสั่งต้องมีบุคลิกมิ้ม ความรู้ และคำถาม
const p = M.buildPrompt('ทุเรียนปลูกที่ไหน', hit);
ok(p.systemInstruction.indexOf('คุณคือมิ้ม') >= 0 && p.systemInstruction.indexOf('ทุเรียนปลูกมากในภาคตะวันออก') >= 0, 'prompt carries persona and facts');
ok(p.contents[0].parts[0].text === 'ทุเรียนปลูกที่ไหน', 'prompt carries the question');

(async () => {
  // 7) โหมด 2 ไม่เรียกโมเดล
  state.mode = 'plain';
  let r = await M.answer(store, 'ทุเรียนปลูกที่ไหน');
  ok(r.ok === false && r.reason.indexOf('ไม่ได้เลือกโหมด 1') >= 0, 'plain mode never calls the model');
  ok(state.calls === 0, 'no call in plain mode');

  // 8) โหมด 1 แต่โมเดลยังไม่พร้อม
  state.mode = 'mim'; state.ready = false;
  r = await M.answer(store, 'ทุเรียนปลูกที่ไหน');
  ok(r.ok === false && r.reason.indexOf('ยังไม่พร้อม') >= 0, 'not ready gives a reason, no call');

  // 9) โมเดลตอบจากข้อมูลอ้างอิงแทบทั้งหมด ผ่าน (แหล่งเป็นโมเดล)
  state.ready = true; state.gen = () => 'ทุเรียนปลูกมากในภาคตะวันออกค่ะ';
  r = await M.answer(store, 'ทุเรียนปลูกที่ไหน');
  ok(r.ok === true && r.source === 'model' && r.text.indexOf('ภาคตะวันออก') >= 0 && r.facts.length >= 1, 'grounded answer accepted, source model');
  ok(state.lastArgs.temperature === 0.3, 'low temperature for grounded answers');
  ok(r.entry && r.entry.q === 'ทุเรียนปลูกที่ไหน', 'model answer names the matched entry for learning');

  // 10) โมเดลบอกชื่อผู้สร้าง ถูกทิ้ง และใช้คำที่มิ้มสอนไว้โดยตรงแทน (100% จากคลัง)
  state.gen = () => 'ฉันคือ SmolLM2 ที่สร้างโดย Hugging Face ค่ะ';
  r = await M.answer(store, 'ทุเรียนปลูกที่ไหน');
  ok(r.ok === true && r.source === 'verbatim' && r.text === DURIAN, 'forbidden identity dropped, verbatim taught answer used');
  ok(r.modelReason.indexOf('ตรวจคำตอบไม่ผ่าน') >= 0, 'model rejection reason kept');

  // 10b) โมเดลเพิ่มความรู้จากนอกคลังเพียงนิด ตกเกณฑ์ 95% ใช้คำที่สอนไว้แทน
  state.gen = () => 'ทุเรียนปลูกมากในภาคตะวันออกและภาคใต้เลยนะคะ ขายดีมากๆ';
  r = await M.answer(store, 'ทุเรียนปลูกที่ไหน');
  ok(M.check('ทุเรียนปลูกมากในภาคตะวันออกและภาคใต้เลยนะคะ ขายดีมากๆ', M.retrieve(entries, 'ทุเรียนปลูกที่ไหน', 3)) !== '', 'extra outside words fail the 95% rule');
  ok(r.ok === true && r.source === 'verbatim' && r.text === DURIAN, 'outside words replaced by taught answer');

  // 10c) โมเดลตอบเรื่องอื่นทั้งหมด ใช้คำที่สอนไว้แทน
  state.gen = () => 'เครื่องบินบินด้วยความเร็วสูงมากๆเลยนะ';
  r = await M.answer(store, 'ทุเรียนปลูกที่ไหน');
  ok(r.source === 'verbatim' && r.text === DURIAN, 'ungrounded reply replaced by taught answer');

  // 11) โมเดลพัง ไม่ทำให้มิ้มพัง: ใช้คำที่สอนไว้โดยตรง
  state.gen = () => { throw new Error('boom'); };
  r = await M.answer(store, 'ทุเรียนปลูกที่ไหน');
  ok(r.ok === true && r.source === 'verbatim' && r.modelReason.indexOf('โมเดลตอบไม่ได้') >= 0, 'model error is caught, taught answer used');
  ok(M.retrieveScored(entries, 'ทุเรียนปลูกที่ไหน', 3)[0].score >= M.MIN_VERBATIM_SCORE, 'durian question is strong enough for verbatim');

  // 12) ไม่มีความรู้ที่เกี่ยวข้อง ไม่เรียกโมเดล
  state.calls = 0; state.gen = () => 'ไม่ควรถูกเรียก';
  r = await M.answer(store, 'ดาวอังคารมีกี่ดวง');
  ok(r.ok === false && r.reason.indexOf('ไม่มีความรู้') >= 0 && state.calls === 0, 'no related knowledge: model not called');

  // 13) ไม่มี NINOLocalLLM
  const saved = sb.NINOLocalLLM; sb.NINOLocalLLM = undefined;
  r = await M.answer(store, 'ทุเรียนปลูกที่ไหน');
  ok(r.ok === false, 'missing local module is handled');
  sb.NINOLocalLLM = saved;

  // 14) คำตอบว่างถูกทิ้ง ใช้คำที่สอนไว้แทน
  state.gen = () => '   ';
  r = await M.answer(store, 'ทุเรียนปลูกที่ไหน');
  ok(r.source === 'verbatim' && r.text === DURIAN, 'empty answer dropped, taught answer used');

  // 14b) คำที่ซ้อนอยู่ในคำอื่นไม่ใช่เรื่องเดียวกัน ("ปัญญา" กับ "ปัญญาประดิษฐ์") ไม่ใช้คำที่สอนไว้
  ok(M.sameTopic('ปัญญาคืออะไร', 'ปัญญาประดิษฐ์คืออะไร') === false, 'partial word is not the same topic');
  ok(M.sameTopic('ทุเรียนปลูกที่ใดบ้าง', 'ทุเรียนปลูกที่ไหน') === true, 'same topic with filler words matches');
  const aiStore = { entries: [{ q: 'ปัญญาประดิษฐ์คืออะไร', a: 'ปัญญาประดิษฐ์คือระบบที่ทำให้เครื่องคิดได้ค่ะ' }] };
  state.gen = () => { throw new Error('boom'); };
  r = await M.answer(aiStore, 'ปัญญาคืออะไร');
  ok(r.ok === false, 'AI definition is not given as the answer to a different topic');

  // 15) ตั้งเกณฑ์ไว้: 100% จากคลัง ไม่มีเส้นทางที่คำตอบมาจากนอกคลัง
  ok(M.MIN_GROUND >= 0.95, 'grounding threshold is at least 95%');
  state.gen = () => { throw new Error('boom'); };
  r = await M.answer([], 'ทุเรียนปลูกที่ไหน');
  ok(r.ok === false, 'empty store never answers');

  console.log('mim-llm: ' + pass + '/' + (pass + fail) + ' passed, ' + fail + ' failed (ต้องผ่านอย่างน้อย ' + FLOOR + ')');
  process.exit(fail || pass < FLOOR ? 1 : 0);
})();
