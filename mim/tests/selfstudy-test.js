/* มิ้ม | เทสต์การเรียนเองจากข้อความที่อ่าน (ไม่ใช้เครือข่าย)
 * รัน: node mim/tests/selfstudy-test.js
 *
 * ชุดข้อความ READ เป็นข้อเท็จจริงที่ไม่อยู่ในความรู้เริ่มต้น และ HELD เป็นคำถามที่ใช้คำต่างจากข้อความ
 * ก่อนอ่าน ต้องไม่ตอบได้เลย หลังอ่านต้องตอบได้ตามที่วัดได้ (มีเกณฑ์ขั้นต่ำกันถอยหลัง)
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
  'engine/39-learn.js', 'engine/47-compose.js', 'engine/48-selfstudy.js', 'engine/49-sources.js', 'engine/54-webcand.js', 'engine/52-coin.js', 'engine/53-skills.js', 'engine/50-chat.js',
  'engine/34-aliases.js', 'data/aliases-th.js', 'data/sources-th.js', 'data/pack-th.js'
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
  const N = sb.NINO;
  const store = new N.KnowledgeStore(ls).load();
  if (store.ensureSeed(N.SEED_KNOWLEDGE)) store.save();
  N.Learn.ensurePack(store, sb.NINO_PACK_TH);
  const bus = new N.Bus();
  const graph = new N.Graph();
  const retrieval = graph.add(new N.RetrievalNode('retrieval', bus, store));
  const language = graph.add(new N.LanguageNode('language', bus, store));
  const thinker = new N.ThinkNode('thinker', bus, store, retrieval, language);
  thinker.getGraph();
  const chat = new N.ChatNode('chat', bus, store, thinker);
  return { N, store, thinker, chat, ls };
}

function think(h, text) {
  const gen = h.thinker.think(text);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

// ข้อความที่อ่าน (ข้อเท็จจริง) กับ "หัวข้อ" ที่ใช้ตรวจว่าตอบเรื่องถูกหรือไม่
const READ = [
  ['ไมโครชิป', 'ไมโครชิปคือวงจรรวมขนาดเล็กที่ประกอบด้วยทรานซิสเตอร์จำนวนมาก'],
  ['ลูกเกด', 'ลูกเกดคือผลไม้แห้งที่ทำจากองุ่น'],
  ['ทุเรียน', 'ทุเรียนเป็นผลไม้ที่มีกลิ่นแรงและนิยมในภาคใต้'],
  ['กระจกเงา', 'กระจกเงาใช้สะท้อนแสงเพื่อให้เห็นภาพของตัวเอง'],
  ['เสือโคร่ง', 'เสือโคร่งคือแมวขนาดใหญ่ที่อาศัยอยู่ในป่าทึบของทวีปเอเชีย'],
  ['แมงกะพรุน', 'แมงกะพรุนเป็นสัตว์ทะเลที่ไม่มีกระดูกและลอยไปตามกระแสน้ำ'],
  ['ปลาทับทิม', 'ปลาทับทิมเป็นปลาน้ำจืดที่เลี้ยงง่ายและโตเร็ว']
];
const PASSAGE = READ.map(r => r[1]).join('\n');

// คำถามที่ใช้คำต่างจากข้อความที่อ่าน (ไม่ใช่คำถามเดิม) พร้อมหัวข้อที่ควรตอบ
const HELD = [
  ['อธิบายทุเรียนหน่อย', 'ทุเรียน'],
  ['ลูกเกดคืออะไรเหรอ', 'ลูกเกด'],
  ['บอกเรื่องไมโครชิปหน่อย', 'ไมโครชิป'],
  ['ทุเรียนมีกลิ่นยังไง', 'ทุเรียน'],
  ['กระจกเงาเอาไว้ทำอะไร', 'กระจกเงา'],
  ['เสือโคร่งคือสัตว์อะไร', 'เสือโคร่ง'],
  ['แมงกะพรุนอาศัยอยู่ที่ไหน', 'แมงกะพรุน'],
  ['ปลาทับทิมเลี้ยงยากไหม', 'ปลาทับทิม'],
  ['ลูกเกดทำจากอะไร', 'ลูกเกด'],
  ['ไมโครชิปประกอบด้วยอะไร', 'ไมโครชิป']
];

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok  ' + name);
}

const ls = memStorage();
const h = build(ls);

// ก่อนอ่าน ทุกข้อควรยังตอบไม่ได้ (ไม่มีความรู้และไม่มีบันทึก)
const before = HELD.filter(([q, topic]) => {
  const r = think(h, q);
  return r.kind === 'answer' && r.entry && r.entry.q.includes(topic);
}).length;

check('ก่อนอ่าน ไม่มีคำถามใดตอบได้จากเรื่องเหล่านี้', () => {
  assert.strictEqual(before, 0, 'ตอบได้ ' + before + ' ก่อนอ่าน');
});

check('อ่านข้อความแล้วเรียนเองได้ทุกนิยามที่ตรวจผ่าน และบันทึกข้อความไว้', () => {
  const r = h.N.SelfStudy.ingest(h.store, h.thinker, PASSAGE);
  assert.strictEqual(r.learned.length, READ.length, JSON.stringify(r.skipped));
  assert.strictEqual(h.store.notes.length, 1);
});

check('ข้อความที่ขัดกับความรู้เดิม (มีคำถามเดิมแล้ว) ไม่เขียนทับ', () => {
  const before = h.store.find('ทุเรียนคืออะไร').a;
  const r = h.N.SelfStudy.ingest(h.store, h.thinker, 'ทุเรียนคือต้นไม้ที่สูงมาก');
  assert.strictEqual(r.learned.length, 0);
  assert.strictEqual(h.store.find('ทุเรียนคืออะไร').a, before);
});

check('บันทึกคงอยู่หลังโหลดใหม่ และยังค้นนิยามได้', () => {
  h.store.save();
  const again = build(ls);
  assert.ok(again.store.notes.length >= 1, "บันทึกต้องคงอยู่");
  assert.ok(again.store.find('ลูกเกดคืออะไร'), 'ควรมีความรู้ที่เรียนเองอยู่');
});

check('คำสั่ง "อ่าน ..." เก็บบันทึกและตอบสรุปว่าเรียนอะไรได้บ้าง', () => {
  const fresh = build(memStorage());
  const out = [];
  fresh.chat.reply = (kind, text) => out.push({ kind, text });
  fresh.chat.handle('อ่าน ' + PASSAGE);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].kind, 'taught', out[0].text);
  assert.ok(out[0].text.includes('เรียนเองได้ ' + READ.length), out[0].text);
  assert.strictEqual(fresh.store.notes.length, 1);
});

// หลังอ่านแล้วคำถามรูปอื่นต้องได้คำตอบเรื่องนั้น
const after = [];
for (const [q, topic] of HELD) {
  const r = think(h, q);
  const ok = r.kind === 'answer' && r.entry && r.entry.q.includes(topic);
  after.push({ q, topic, ok, got: r.kind + ' ' + (r.text || '').slice(0, 40) });
}
const hits = after.filter(x => x.ok).length;

console.log('\nก่อนอ่าน ตอบได้ ' + before + ' จาก ' + HELD.length + ' ข้อ');
console.log('หลังอ่าน ตอบได้ ' + hits + ' จาก ' + HELD.length + ' ข้อ');
for (const x of after) if (!x.ok) console.log('  ยังไม่ได้: ' + x.q + ' -> ' + x.got);

// เกณฑ์กันถอยหลัง (ค่าที่วัดได้ตอนนี้ ไม่ใช่เป้าหมาย)
// ชุดที่สองเขียนก่อนรันครั้งแรก (ดูได้ใน HANDOFF) ใช้วัดว่าการเรียนเองไม่ได้จำเฉพาะชุดแรก
const PASSAGE2 = [
  'มะม่วงน้ำดอกไม้คือมะม่วงพันธุ์ที่มีเนื้อเหลืองหวานและกลิ่นหอม',
  'ปลาดุกเป็นปลาน้ำจืดที่มีหนวดและหายใจด้วยอากาศได้บ้าง',
  'หนังสือพิมพ์คือสิ่งพิมพ์ที่ออกเป็นประจำและบอกข่าวสาร',
  'ลำไยใช้ทำน้ำลำไยและอบแห้งได้',
  'จิ้งหรีดคือแมลงที่ส่งเสียงด้วยการถูปีก'
].join('\n');
const HELD2 = [
  ['มะม่วงน้ำดอกไม้มีรสยังไง', 'มะม่วงน้ำดอกไม้'],
  ['ปลาดุกคืออะไร', 'ปลาดุก'],
  ['หนังสือพิมพ์ทำหน้าที่อะไร', 'หนังสือพิมพ์'],
  ['ลำไยเอาไว้ทำอะไรได้บ้าง', 'ลำไย'],
  ['จิ้งหรีดส่งเสียงยังไง', 'จิ้งหรีด'],
  ['อธิบายจิ้งหรีดให้ฟังหน่อย', 'จิ้งหรีด']
];
const h2 = build(memStorage());
const before2 = HELD2.filter(([q, t]) => { const r = think(h2, q); return r.entry && r.entry.q.includes(t); }).length;
h2.N.SelfStudy.ingest(h2.store, h2.thinker, PASSAGE2);
// คำตอบแบบเรียบเรียงที่มีรายการต้นทางเป็นเรื่องที่ถูกต้องด้วย (นับเหมือนที่ eval-retrieval นับ)
const hits2 = HELD2.filter(([q, t]) => { const r = think(h2, q); return r.entry && r.entry.q.includes(t) && r.kind !== 'fallback'; }).length;
console.log('\nชุดที่สอง ก่อนอ่าน ' + before2 + ' หลังอ่าน ' + hits2 + ' จาก ' + HELD2.length + ' ข้อ');

// เกณฑ์กันถอยหลัง: ค่าที่วัดได้ตอนนี้ (ไม่ใช่เป้าหมาย) ถ้าลดลงให้ล้มเหลว
check('ชุดแรกหลังอ่านตอบได้ไม่ต่ำกว่า 9 ข้อ (วัดได้ 9)', () => {
  assert.ok(hits >= 9, 'ตอบได้ ' + hits);
});
check('ชุดที่สองหลังอ่านตอบได้ไม่ต่ำกว่า 5 ข้อ (วัดได้ 5)', () => {
  assert.strictEqual(before2, 0);
  assert.ok(hits2 >= 5, 'ตอบได้ ' + hits2);
});

console.log('\nผ่าน ' + passed + ' ข้อ');
