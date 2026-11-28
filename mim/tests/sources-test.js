/* มิ้ม | เทสต์แหล่งข้อมูลที่ติดตั้งได้ (ไม่ใช้เครือข่าย)
 * รัน: node mim/tests/sources-test.js
 * ครอบคลุม: ไม่ติดตั้งแล้วไม่ตอบจากแหล่ง, ติดตั้งแล้วตอบพร้อมชื่อแหล่ง, เรียนนิยามพร้อมที่มา,
 * ไม่เขียนทับความรู้เดิม, ถอนแหล่งลบความรู้ของแหล่งนั้น, ติดตั้งซ้ำไม่เพิ่มเอง, คงอยู่หลังโหลดใหม่
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
  const N = sb.NINO;
  const store = new N.KnowledgeStore(ls).load();
  if (store.ensureSeed(N.SEED_KNOWLEDGE)) store.save();
  N.Learn.ensurePack(store, sb.NINO_PACK_TH);
  store.settings.enabled = true;
  const bus = new N.Bus();
  const graph = new N.Graph();
  const retrieval = graph.add(new N.RetrievalNode('retrieval', bus, store));
  const language = graph.add(new N.LanguageNode('language', bus, store));
  const thinker = new N.ThinkNode('thinker', bus, store, retrieval, language);
  thinker.getGraph();
  const chat = new N.ChatNode('chat', bus, store, thinker);
  return { sb, N, store, thinker, chat, ls };
}

function think(h, text) {
  const gen = h.thinker.think(text);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

function say(h, text) {
  const out = [];
  h.chat.reply = (kind, t, meta) => out.push({ kind, text: t, meta: meta || '' });
  h.chat.handle(text);
  return out[out.length - 1];
}

const DURIAN_Q = 'ไทยปลูกทุเรียนที่ไหนบ้าง';
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('ok  ' + name); }

// 1. ก่อนติดตั้ง ไม่มีการอ้างแหล่งใด
const h = build(memStorage());
check('ก่อนติดตั้ง มีแหล่งที่ลงทะเบียนแต่ยังไม่ติดตั้ง และไม่ตอบจากแหล่ง', () => {
  const rows = h.N.Sources.listing(h.store);
  assert.strictEqual(rows.length, 2);
  assert.ok(rows.every(r => r.loaded === false));
  const r = think(h, DURIAN_Q);
  assert.ok(!/แหล่ง/.test(r.meta || '') && !/แหล่ง/.test(r.text || ''), r.text);
});

check('ค้นแหล่งก่อนติดตั้งบอกว่ายังไม่ติดตั้ง', () => {
  const r = say(h, 'ค้นแหล่ง ทุเรียน');
  assert.ok(r.text.includes('ทุเรียน'), r.text);
  assert.ok(r.meta === '' && r.text.includes('ยังไม่ติดตั้ง'), r.text);
});

// 2. ติดตั้งแล้วอ่านจากแหล่งและอ้างชื่อแหล่ง
check('โหลดแหล่งแล้วตอบด้วยประโยคในแหล่งพร้อมชื่อและระดับความเชื่อถือ', () => {
  const r = say(h, 'โหลดแหล่ง thaipbs-durian');
  assert.strictEqual(r.kind, 'taught', r.text);
  assert.ok(h.store.sources['thaipbs-durian'], 'ควรบันทึกสถานะการติดตั้ง');
  const a = think(h, DURIAN_Q);
  assert.strictEqual(a.kind, 'answer', a.text);
  assert.ok(a.text.includes('ปลูกทุเรียน'), a.text);
  assert.ok(a.meta.includes('อ่านจากแหล่ง: ทุเรียน (ไทยพีบีเอส)'), a.meta);
  const c = say(h, DURIAN_Q);
  assert.ok(c.meta.includes('แหล่ง: ทุเรียน (ไทยพีบีเอส)') && c.meta.includes('สรุปจากหน้าเว็บ'), c.meta);
});

check('คำถามที่ไม่เกี่ยวกับแหล่งไม่ถูกอ้างแหล่ง', () => {
  const r = think(h, 'ดาวอังคารมีกี่ดวง');
  assert.ok(!/แหล่ง/.test(r.meta || '') && !/แหล่ง/.test(r.text || ''), r.text);
});

check('ติดตั้งซ้ำไม่เพิ่มเอง', () => {
  const r = say(h, 'โหลดแหล่ง thaipbs-durian');
  assert.ok(r.text.includes('ติดตั้งแล้ว'), r.text);
});

// 3. แหล่งที่มีนิยาม: เรียนพร้อมที่มา ไม่เขียนทับ ไม่ตรวจผ่านไม่เก็บ
const fixtureA = {
  id: 'fixture-mango',
  title: 'ทดสอบมะม่วง',
  trust: 'high',
  method: 'ทดสอบ',
  lines: [
    'มะม่วงน้ำดอกไม้คือมะม่วงพันธุ์ที่มีเนื้อเหลืองหวานและกลิ่นหอม',
    'แม้มะม่วงจะมีหลายพันธุ์ แต่รสชาติต่างกันมาก',
    'ปลาดุกคือปลาน้ำจืดที่มีหนวด'
  ]
};
const fixtureB = {
  id: 'fixture-conflict',
  title: 'ทดสอบขัดแย้ง',
  trust: 'low',
  method: 'ทดสอบ',
  lines: [
    'มะม่วงน้ำดอกไม้คือผลไม้ที่ปลูกในภาคกลางเท่านั้น'
  ]
};
h.sb.NINO_SOURCES = [...h.sb.NINO_SOURCES, fixtureA, fixtureB];

check('แหล่งที่มีนิยาม เรียนได้เฉพาะประโยคที่เป็นนิยามและผ่านการตรวจ พร้อมที่มา', () => {
  const r = h.N.Sources.load(h.store, h.thinker, 'fixture-mango');
  assert.strictEqual(r.error, undefined, r.error);
  assert.strictEqual(r.learned.length, 2, JSON.stringify(r.learned.map(x => x.q)));
  const e = h.store.find('มะม่วงน้ำดอกไม้คืออะไร');
  assert.ok(e && e.src === 'fixture-mango' && e.trust === 'high', JSON.stringify(e));
  const a = think(h, 'มะม่วงน้ำดอกไม้คืออะไร');
  assert.ok(a.entry && a.entry.src === 'fixture-mango', a.text);
  const c = say(h, 'มะม่วงน้ำดอกไม้คืออะไร');
  assert.ok(c.meta.includes('ตรวจกับต้นฉบับแล้ว'), c.meta);
  assert.ok(!h.store.find('แม้มะม่วงจะคืออะไร'), 'ประโยคที่ขึ้นต้นด้วย แม้ ต้องไม่กลายเป็นนิยาม');
});

check('แหล่งที่ขัดกับความรู้เดิมไม่เขียนทับ', () => {
  const before = h.store.find('มะม่วงน้ำดอกไม้คืออะไร').a;
  const r = h.N.Sources.load(h.store, h.thinker, 'fixture-conflict');
  assert.strictEqual(r.learned.length, 0);
  assert.ok(r.skipped.some(x => x.reason.includes('มีจากแหล่งอื่นแล้ว')), JSON.stringify(r.skipped));
  assert.strictEqual(h.store.find('มะม่วงน้ำดอกไม้คืออะไร').a, before);
});

// 4. ถอนแหล่งลบความรู้ของแหล่งนั้น และติดตั้งใหม่ได้
check('ถอนแหล่งลบความรู้ที่มาจากแหล่งนั้น แต่ไม่แตะความรู้อื่น', () => {
  const n = h.store.entries.length;
  const r = say(h, 'ลบแหล่ง fixture-mango');
  assert.strictEqual(r.kind, 'forgot', r.text);
  assert.ok(!h.store.find('มะม่วงน้ำดอกไม้คืออะไร'), 'ควรลบความรู้ที่มาจากแหล่ง');
  assert.ok(h.store.entries.length < n);
  assert.ok(!h.store.sources['fixture-mango'], 'ควรลบสถานะการติดตั้ง');
  const again = h.N.Sources.load(h.store, h.thinker, 'fixture-mango');
  assert.strictEqual(again.learned.length, 2);
});

// 5. คงอยู่หลังโหลดใหม่
check('สถานะแหล่งและที่มาของความรู้คงอยู่หลังโหลดใหม่', () => {
  h.store.save();
  const again = build(h.ls);
  again.sb.NINO_SOURCES = [...again.sb.NINO_SOURCES, fixtureA, fixtureB];
  assert.ok(again.store.sources['thaipbs-durian'], 'สถานะแหล่งควรคงอยู่');
  const e = again.store.find('มะม่วงน้ำดอกไม้คืออะไร');
  assert.ok(e && e.src === 'fixture-mango', 'ที่มาของความรู้ควรคงอยู่');
  const c = say(again, DURIAN_Q);
  assert.ok(c.meta.includes('ทุเรียน (ไทยพีบีเอส)'), c.meta);
});

// 6. คำสั่งจัดการแหล่ง
check('คำสั่ง "แหล่ง" แสดงรายการพร้อมสถานะ', () => {
  const r = say(h, 'แหล่ง');
  assert.ok(r.text.includes('thaipbs-durian') && r.text.includes('ติดตั้งแล้ว'), r.text);
});

check('อ่านแหล่ง: เมื่อความครอบคลุมเท่ากัน ประโยคที่มีคำหายากชนะประโยคที่มีแต่คำทั่วไป', () => {
  const h2 = build(memStorage());
  h2.sb.NINO_SOURCES = [{ id: 'rank-test', title: 'ทดสอบจัดอันดับ', lines: [
    'ทุกคนชอบกินข้าวทุกวัน',
    'ทุกคนชอบกินอาหารทุกมื้อ',
    'ทุกคนชอบกินผลไม้ตามฤดู',
    'ทุเรียนหมอนทองชอบ'
  ], trust: 'high' }];
  h2.store.sources['rank-test'] = { loaded: 1 };
  const b = h2.N.Sources.openBook(h2.store, ['ทุเรียน', 'หมอนทอง', 'ทุกคน', 'ชอบ', 'กิน']);
  assert.ok(b, 'ต้องพบประโยค');
  assert.ok(b.text.includes('ทุเรียน'), 'ต้องเลือกประโยคที่มีคำหายาก ได้: ' + b.text);
});

console.log('\nผ่าน ' + passed + ' ข้อ');
