/* มิ้ม | เทสต์พฤติกรรมการคุย: ความหลากหลายของคำตอบ เวลาจริง ตัวมิ้มเอง อารมณ์ และไม่ตอบผิดจากคำทั่วไป
 * รัน: node mim/tests/chat-behavior-test.js  (ไม่ใช้เครือข่าย)
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
  'engine/39-learn.js', 'engine/47-compose.js', 'engine/48-selfstudy.js', 'engine/49-sources.js', 'engine/54-webcand.js', 'engine/52-coin.js', 'engine/53-skills.js', 'engine/50-chat.js', 'engine/34-aliases.js', 'data/aliases-th.js', 'data/sources-th.js', 'data/pack-th.js'
];

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

function build() {
  const ls = memStorage();
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
  return { N, store, thinker };
}

function think(h, text) {
  const gen = h.thinker.think(text);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok  ' + name);
}

const h = build();
const N = h.N;

check('คำทักทายเดิมได้คำตอบต่างกันเมื่อคุยต่อ (ไม่พูดซ้ำทุกครั้ง)', () => {
  const seen = new Set();
  for (let i = 0; i < 6; i++) seen.add(N.Intent.match('สวัสดีจ้า').text);
  assert.ok(seen.size >= 2, 'ควรมีคำตอบมากกว่าหนึ่งแบบ ได้ ' + seen.size);
});

check('เวลาอ่านจากนาฬิกาที่ส่งเข้ามา ตัวอย่าง 14:05 และวันที่ไทย พ.ศ.', () => {
  const d = new N.Intent.constructor ? new Date(2026, 10, 18, 14, 5) : new Date(2026, 10, 18, 14, 5);
  const r = N.Intent.match('ตอนนี้กี่โมงแล้ว', d);
  assert.strictEqual(r.id, 'clock');
  assert.ok(r.text.includes('14:05 น.'), r.text);
  const dt = N.Intent.match('วันนี้วันอะไร', d);
  assert.strictEqual(dt.id, 'date');
  assert.ok(dt.text.includes('พ.ศ. 2569'), dt.text);
  assert.ok(dt.text.includes('พุธ'), dt.text);
});

check('คำถามเกี่ยวกับตัวมิ้มตอบได้ แต่ "ทำอะไรได้บ้าง" ทั่วไปยังไม่จับ', () => {
  assert.strictEqual(N.Intent.match('ทำอะไรได้บ้าง', new Date()), null);
  assert.strictEqual(N.Intent.match('มิ้มทำอะไรได้บ้าง', new Date()).id, 'self_abilities');
  assert.strictEqual(N.Intent.match('มิ้มชอบอะไร', new Date()).id, 'self_likes');
  assert.strictEqual(N.Intent.match('มิ้มอายุเท่าไหร่', new Date()).id, 'self_age');
});

check('คำว่าท้องฟ้าไม่ถูกจับเป็นความเศร้า', () => {
  assert.strictEqual(N.Intent.match('ทำไมท้องฟ้าสีฟ้า', new Date()), null);
});

check('ข้อความเศร้ามีคำตอบที่เห็นใจ และมีสายด่วนสุขภาพจิต', () => {
  const r = N.Intent.match('เศร้าจัง ไม่มีใครเข้าใจ', new Date());
  assert.strictEqual(r.id, 'feel_sad');
  const seenLine = new Set();
  for (let i = 0; i < 6; i++) seenLine.add(N.Intent.match('เศร้ามาก', new Date()).text);
  assert.ok([...seenLine].some(t => t.includes('1323')), 'ควรมีบรรทัดสายด่วน 1323');
});

check('คำถามความรู้ที่มีคำว่า "คืออะไร" ไม่ตอบด้วยนิยามของมิ้ม', () => {
  const r = think(h, 'ความรักคืออะไร');
  const bad = r.kind === 'answer' && r.entry && /มิ้มคือ/.test(r.text || '');
  assert.ok(!bad, 'ตอบด้วยนิยามของมิ้ม: ' + r.text);
});

check('มิ้มไม่ตอบ "มิ้มชอบอะไร" ด้วยนิยามของมิ้ม', () => {
  const r = think(h, 'มิ้มชอบอะไร');
  assert.strictEqual(r.kind, 'answer');
  assert.ok(!/มิ้มคือระบบ/.test(r.text), r.text);
});

check('คำถามที่ไม่มีในคลังยังขอให้สอน ไม่เดา', () => {
  const r = think(h, 'ดาวอังคารมีกี่ดวง');
  assert.strictEqual(r.kind, 'fallback');
});

check('คำพ้องที่ตรวจแล้วถูกแปลงก่อนค้น และคำตอบที่แสดงยังเป็นคำตอบเดิม', () => {
  assert.strictEqual(N.Aliases.apply('ดอยไหนสูงสุดในไทย'), 'ภูเขาไหนสูงสุดในไทย');
  const r = think(h, 'ดอยไหนสูงสุดในไทย');
  assert.strictEqual(r.kind, 'answer');
  assert.ok(r.text.includes('ภูเขา') || r.text.includes('2,565') || r.text.includes('อินทนนท์'), r.text);
});

check('คำที่ไม่อยู่ในตารางคำพ้องไม่ถูกเปลี่ยน', () => {
  assert.strictEqual(N.Aliases.apply('แมวกินอะไร'), 'แมวกินอะไร');
});

check('คำอุทาน หัวเราะ และความเบื่อ/กังวลได้คำตอบแบบคุยเล่น ไม่ใช่ "ไม่มีความรู้"', () => {
  assert.strictEqual(N.Intent.match('ฮ่าๆๆ', new Date()).id, 'laugh');
  assert.strictEqual(N.Intent.match('555', new Date()).id, 'laugh');
  assert.strictEqual(N.Intent.match('เอ๋?', new Date()).id, 'interject');
  assert.strictEqual(N.Intent.match('เบื่อจัง ไม่รู้จะทำอะไร', new Date()).id, 'feel_bored');
  assert.strictEqual(N.Intent.match('กลัวจัง พรุ่งนี้มีสอบ', new Date()).id, 'feel_worried');
});

check('ฮ่องกงไม่ถูกจับเป็นเสียงหัวเราะ และคำถามความรู้ไม่ถูกจับเป็นอารมณ์', () => {
  assert.strictEqual(N.Intent.match('ฮ่องกงอยู่ตรงไหน', new Date()), null);
  assert.strictEqual(N.Intent.match('ทำไมท้องฟ้าถึงเป็นสีฟ้า', new Date()), null);
});

check('ถามว่ามิ้มเป็นคนหรือไม่ ตอบตรงๆ ว่าเป็นโปรแกรม', () => {
  const r = N.Intent.match('เธอเป็นคนจริงไหม', new Date());
  assert.strictEqual(r.id, 'self_human');
  assert.ok(!/ฉันเป็นคน/.test(r.text), r.text);
  assert.strictEqual(N.Intent.match('เธอเป็นคนไทยไหม', new Date()), null);
});

check('คำถามอ้างถึงสิ่งที่คุยก่อนหน้าแต่ไม่ชัด ถามกลับ ไม่ตอบด้วยเรื่องเดิม', () => {
  h.store.teach('ไก่ย่างกินกับอะไร', 'ไก่ย่างมักกินคู่กับข้าวเหนียวค่ะ');
  const first = think(h, 'ไก่ย่างกินกับอะไร');
  assert.strictEqual(first.kind, 'answer');
  const r = think(h, 'แล้วอันนั้นมีรสชาติยังไง');
  assert.strictEqual(r.kind, 'fallback', r.text);
  assert.ok(r.text.includes('ไก่ย่าง') || r.text.includes('ช่วยบอกชื่อ'), r.text);
  assert.ok(!r.text.includes('ข้าวเหนียว'), r.text);
});

check('ต่อยอดความรู้: หลังสอนเรื่องใหม่ ถามต่อด้วยคำชี้กลับจะได้คำตอบของเรื่องนั้น', () => {
  h.store.teach('ไก่ย่างกินกับอะไร', 'ไก่ย่างมักกินคู่กับข้าวเหนียวค่ะ');
  think(h, 'ไก่ย่างกินกับอะไร');
  const miss = think(h, 'แล้วอันนั้นมีรสชาติยังไง');
  assert.strictEqual(miss.kind, 'fallback', miss.text);
  assert.ok(miss.text.includes('ไก่ย่าง'), 'ควรเอ่ยหัวข้อ: ' + miss.text);
  h.store.teach('ไก่ย่างมีรสชาติยังไง', 'หอมเค็มและมีกลิ่นควันจากเตาถ่านค่ะ');
  think(h, 'ไก่ย่างมีรสชาติยังไง');
  const hit = think(h, 'แล้วอันนั้นมีรสชาติยังไง');
  assert.strictEqual(hit.kind, 'answer', hit.text);
  assert.ok(hit.text.includes('หอมเค็ม'), hit.text);
});

check('ไม่ตอบด้วยประโยคเรียบเรียงที่ไม่มีต้นทาง (เคยได้ประโยคผิดเรื่อง)', () => {
  const r = think(h, 'ผัดไทยใส่อะไรบ้าง');
  assert.notStrictEqual(r.kind, 'composed', r.text);
  const ok = (r.entry && r.entry.q.includes('ผัดไทย')) || (r.alts || []).some(e => e.q.includes('ผัดไทย'));
  assert.ok(ok, 'ควรมีคำตอบหรือทางเลือกเรื่องผัดไทย: ' + r.text);
});

check('คำถามที่มีคำเฉพาะไม่พบในความรู้ ไม่ตอบจากเส้นทางที่มีแค่คำทั่วไป', () => {
  const r = think(h, 'สงกรานต์คือวันไหนของปี');
  assert.ok(!/เดือน/.test(r.text), 'ไม่ควรตอบเรื่องเดือน: ' + r.text);
});

check('ความรักมีนิยามในความรู้ตั้งต้น ตอบนิยามนั้น ไม่ตอบจากประโยคที่มีแค่คำว่ารัก', () => {
  // ปรับรอบ 2026-11-19: เพิ่มนิยามความรักในความรู้ตั้งต้นแล้ว จึงต้องตอบนิยาม (ไม่ใช่ fallback)
  const r = think(h, 'ความรักคืออะไร');
  assert.strictEqual(r.kind, 'answer', r.text);
  assert.ok(r.text.includes('ผูกพัน'), r.text);
  assert.ok(!/เขิน/.test(r.text), r.text);
});

check('ดาวไหนมีวงแหวน ไม่ตอบด้วยดวงอาทิตย์', () => {
  const r = think(h, 'ดาวไหนมีวงแหวน');
  assert.ok(!/ดาวฤกษ์|ดวงอาทิตย์/.test(r.text), r.text);
});

check('เส้นทางเลือกแนบเฉพาะเมื่อคำตอบยังไม่ชัด และคำตอบชัดไม่มีเส้นทางเลือก', () => {
  const sure = think(h, 'มิ้มคืออะไร');
  assert.ok(!sure.text.includes('หรือถ้าหมายถึง'), sure.text);
  const unsure = think(h, 'ผัดไทยใส่อะไรบ้าง');
  if (unsure.kind === 'fallback') assert.ok(unsure.text.includes('เลือก'), unsure.text);
});

check('ความต่อเนื่องหลายหัวข้อ: เก็บหัวข้อล่าสุดไม่เกิน 3 เรื่อง เรื่องล่าสุดอยู่ท้ายและตรงกับ topic', () => {
  for (const q of ['ไก่ย่างกินกับอะไร', 'ไก่ย่างมีรสชาติยังไง', 'ผัดไทยมีส่วนผสมหลักอะไร', 'ฮ่องกงอยู่ตรงไหน']) think(h, q);
  const c = h.thinker.context;
  assert.ok(Array.isArray(c.topics), 'context.topics ต้องเป็นรายการ');
  assert.ok(c.topics.length <= 3, 'หัวข้อเกิน 3: ' + c.topics.join(','));
  if (c.topics.length) assert.strictEqual(c.topics[c.topics.length - 1], c.topic);
});

console.log('\nผ่าน ' + passed + ' ข้อ');
