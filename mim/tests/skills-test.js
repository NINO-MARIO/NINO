/* มิ้ม | เทสต์ทักษะกฎตายตัว (ไม่ใช้เครือข่าย)
 * รัน: node mim/tests/skills-test.js
 * ครอบคลุม: เลขคณิต, วันที่สัมพันธ์, คำตรงข้าม, ความรู้สึก, คำชม/คำด่า, นาเดียร์, นิทาน,
 * ความปลอดภัย (ข้อความทำร้ายตัวเองได้คำตอบช่องทางช่วยเหลือ และทำงานแม้ปิดระบบ),
 * และพื้นของจำนวนที่ผ่านแชต (ไม่ตอบผิดกับข้อความที่ไม่ใช่ทักษะ)
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = [
  'engine/00-core.js', 'engine/10-text.js', 'engine/12-romanize.js', 'engine/05-seed.js',
  'engine/38-profile.js', 'engine/35-lexicon.js', 'engine/36-graph.js', 'engine/20-store.js',
  'engine/31-calibrate.js', 'engine/30-retrieval.js', 'engine/40-language.js', 'engine/32-intent.js',
  'engine/33-links.js', 'engine/37-thinker.js', 'engine/45-manners.js', 'engine/46-textpipe.js',
  'engine/39-learn.js', 'engine/47-compose.js', 'engine/48-selfstudy.js', 'engine/49-sources.js', 'engine/54-webcand.js',
  'engine/52-coin.js', 'engine/53-skills.js', 'engine/50-chat.js', 'engine/34-aliases.js', 'data/aliases-th.js', 'data/sources-th.js', 'data/pack-th.js'
];
function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
function build(ls) {
  const sb = { console, localStorage: ls, setTimeout, clearTimeout, Date };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  return sb.NINO;
}
const N = build(memStorage());
const S = N.Skills;
const NOW = new Date(2026, 10, 18, 10, 0, 0); // 18 พ.ย. 2026 (วันพุธ)
const m = (t) => S.match(t, NOW);
const results = { pass: 0, total: 0 };
function check(name, fn) {
  results.total++;
  try { fn(); results.pass++; } catch (e) { console.log('FAIL', name, '-', e.message); }
}

// เลขคณิต
check('บวก', () => assert.ok(m('2 บวก 3 เท่ากับเท่าไร').text.includes('เท่ากับ 5')));
check('ลบ', () => assert.ok(m('10 ลบ 4 เท่าไร').text.includes('เท่ากับ 6')));
check('คูณ สัญลักษณ์', () => assert.ok(m('6*7=').text.includes('เท่ากับ 42')));
check('หาร ทศนิยม', () => assert.ok(m('7 หาร 2').text.includes('เท่ากับ 3.5')));
check('หารศูนย์', () => assert.ok(m('5 หาร 0').text.includes('ศูนย์')));
check('เลขไม่ใช่คำสั่งคำนวณ', () => assert.strictEqual(m('ปีนี้เป็นปีอะไร'), null));

// วันที่สัมพันธ์
check('พรุ่งนี้วันอะไร', () => assert.ok(m('พรุ่งนี้วันอะไร').text.includes('วันพฤหัสบดี')));
check('เมื่อวานวันอะไร', () => assert.ok(m('เมื่อวานวันอะไร').text.includes('วันอังคาร')));
check('มะรืนนี้ พ.ศ.', () => assert.ok(m('มะรืนนี้วันที่เท่าไร').text.includes('พ.ศ. 2569')));
check('วันนี้วันอะไร', () => assert.ok(m('วันนี้วันอะไร').text.includes('วันพุธ')));

// คำตรงข้าม
check('ตรงข้ามกับร้อน', () => assert.ok(m('ตรงข้ามกับร้อน').text.includes('หนาว')));
check('ตรงข้ามกับเร็ว', () => assert.ok(m('ตรงข้ามกับเร็ว').text.includes('ช้า')));

check('ตรงข้ามกับสูง', () => assert.ok(m('ตรงข้ามกับสูง').text.includes('ต่ำ')));
check('นิทานมีเนื้อหาจริง', () => assert.ok(m('เล่านิทานให้ฟังหน่อย').text.length > 40));

// ความรู้สึก
check('ไม่สบายใจเลย ได้คำตอบรับฟัง', () => {
  const r = m('ไม่สบายใจเลย');
  assert.strictEqual(r.id, 'feel');
  assert.ok(!/เตรียมตัว/.test(r.text));
});
check('เศร้า ได้คำตอบเห็นใจ', () => assert.strictEqual(m('วันนี้เศร้ามาก').id, 'feel'));
check('ความยาวยาวไม่ใช่อารมณ์', () => assert.strictEqual(m('วันนี้ฉันรู้สึกเครียดเรื่องงานที่ต้องส่งพรุ่งนี้เช้าตรู่มากๆเลยและยังไม่ได้ทำอะไรเลยสักอย่าง'), null));

// คำชม/คำด่า
check('คำด่าสุภาพ', () => assert.strictEqual(m('มิ้มโง่จัง').id, 'insult'));
check('คำชม', () => assert.strictEqual(m('มิ้มเก่งมาก').id, 'praise'));
check('ไม่มีชื่อมิ้ม ไม่ตอบคำชม', () => assert.strictEqual(m('ข้าวผัดเก่งมาก'), null));

// นาเดียร์
check('รู้จักพี่นาเดียร์ไหม', () => assert.strictEqual(m('รู้จักพี่นาเดียร์ไหม').id, 'nadia'));

// นิทาน
check('ขอนิทาน', () => assert.strictEqual(m('เล่านิทานให้ฟังหน่อย').id, 'story'));

// ความปลอดภัย
check('ข้อความทำร้ายตัวเองได้ช่องทางช่วยเหลือ', () => {
  const r = m('อยากตายจัง');
  assert.strictEqual(r.id, 'crisis');
  assert.ok(r.text.includes('1323'));
});
check('ความปลอดภัยไม่ขึ้นกับการเปิดระบบ (ตรวจในตัวทักษะ; ลำดับใน handle ตรวจใน chat test)', () => {
  assert.strictEqual(S.match('อยากฆ่าตัวตาย', NOW).id, 'crisis');
});

// ลำดับใน ChatNode.handle: ความปลอดภัยต้องตอบแม้ปิดระบบ ส่วนเลขคณิตตอบเมื่อเปิดระบบเท่านั้น
function chatBuild(enabled) {
  const ls = memStorage();
  const sb = { console, localStorage: ls, setTimeout, clearTimeout, Date };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  const Nn = sb.NINO;
  const store = new Nn.KnowledgeStore(ls).load();
  if (store.ensureSeed(Nn.SEED_KNOWLEDGE)) store.save();
  Nn.Learn.ensurePack(store, sb.NINO_PACK_TH);
  store.settings.enabled = enabled;
  const bus = new Nn.Bus();
  const graph = new Nn.Graph();
  const retrieval = graph.add(new Nn.RetrievalNode('retrieval', bus, store));
  const language = graph.add(new Nn.LanguageNode('language', bus, store));
  const thinker = new Nn.ThinkNode('thinker', bus, store, retrieval, language);
  thinker.getGraph();
  const chat = new Nn.ChatNode('chat', bus, store, thinker);
  return { chat };
}
function chatSay(h, text) {
  const out = [];
  h.chat.reply = (kind, t, meta) => out.push({ kind, text: t, meta: meta || '' });
  h.chat.handle(text);
  return out[out.length - 1];
}
const off = chatBuild(false), on = chatBuild(true);
check('แชตปิดระบบ: ข้อความทำร้ายตัวเองยังได้ช่องทางช่วยเหลือ', () => {
  const r = chatSay(off, 'อยากตายจัง');
  assert.strictEqual(r.kind, 'crisis');
  assert.ok(r.text.includes('1323'));
});
check('แชตปิดระบบ: เลขคณิตไม่ตอบ (ได้ข้อความปิดระบบ)', () => {
  assert.strictEqual(chatSay(off, '2 บวก 3').kind, 'disabled');
});
check('แชตเปิดระบบ: เลขคณิตตอบด้วยทักษะ', () => {
  const r = chatSay(on, '2 บวก 3 เท่ากับเท่าไร');
  assert.strictEqual(r.kind, 'math');
  assert.ok(r.text.includes('เท่ากับ 5'));
});
check('แชตเปิดระบบ: ทักษะถูกบันทึกด้วยป้ายทักษะ', () => {
  assert.strictEqual(chatSay(on, 'พรุ่งนี้วันอะไร').meta, 'ทักษะ');
});

console.log('skills ' + results.pass + '/' + results.total);
if (results.pass !== results.total) process.exit(1);
if (results.total < 24) { console.log('ต่ำกว่าพื้น 24'); process.exit(1); }
