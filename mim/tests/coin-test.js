/* มิ้ม | เทสต์การสร้างคำใหม่ (ไม่ใช้เครือข่าย)
 * รัน: node mim/tests/coin-test.js
 * ครอบคลุม: รากต้องรู้จักแล้ว, คำหน้าที่/หน่วยคำไม่เป็นราก, คำที่เสนอยังไม่รู้จักและแยกส่วนได้,
 * ติดป้ายว่าเสนอเอง, สอนแล้วไม่เสนอซ้ำ, คงอยู่หลังโหลดใหม่, คำสั่งแชต
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
  return { N, store, thinker, chat, ls };
}
function say(h, text) {
  const out = [];
  h.chat.reply = (kind, t, meta) => out.push({ kind, text: t, meta: meta || '' });
  h.chat.handle(text);
  return out[out.length - 1];
}
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('ok  ' + name); }

const ls = memStorage();
const h = build(ls);
const N = h.N;
const lex = () => h.thinker.lexicon;

check('ราก: คำที่ยังไม่รู้จักหรือคำหน้าที่หรือหน่วยคำเอง ไม่ถูกใช้เป็นราก', () => {
  assert.strictEqual(N.Coin.propose(lex(), 'ฟ้าผ่าxyz').length, 0);
  assert.strictEqual(N.Coin.propose(lex(), 'อะไร').length, 0);
  assert.strictEqual(N.Coin.propose(lex(), 'นัก').length, 0);
  assert.strictEqual(N.Coin.propose(lex(), '').length, 0);
});

say(h, 'สอน ดนตรี | ศิลปะที่ใช้เสียงเรียบเรียงเป็นทำนองค่ะ');
check('หลังสอน คำว่า ดนตรี กลายเป็นรากที่รู้จัก', () => {
  assert.ok(N.Coin.isRoot(lex(), 'ดนตรี'));
});

check('เสนอคำจากราก: ได้หลายรูปแบบ ทุกคำยังไม่รู้จัก แยกส่วนได้ และติดป้ายว่าเสนอเอง', () => {
  const list = N.Coin.propose(lex(), 'ดนตรี');
  assert.ok(list.length >= 3, 'got ' + list.length);
  const words = list.map(x => x.word);
  assert.ok(words.includes('นักดนตรี'), words.join(','));
  for (const x of list) {
    assert.strictEqual(x.status, 'proposed');
    assert.ok(!lex().has(x.word), 'already known: ' + x.word);
    assert.ok(x.word === x.affix + x.root || x.word === x.root + x.affix, 'bad parts: ' + x.word);
    assert.ok(x.gloss.includes('ดนตรี'), x.gloss);
  }
});

check('คำสั่งแชต "เสนอคำ" ตอบพร้อมป้ายว่าเป็นคำที่เสนอเอง ไม่อ้างว่ายืนยันแล้ว', () => {
  const r = say(h, 'เสนอคำ ดนตรี');
  assert.strictEqual(r.kind, 'answer');
  assert.ok(r.text.includes('นักดนตรี'), r.text);
  assert.ok(r.text.includes('ยังไม่ได้ยืนยัน'), r.text);
  assert.ok(r.meta.includes('คำที่เสนอเอง'), r.meta);
});

check('คำหน้าที่และคำที่ไม่รู้จักถูกปฏิเสธอย่างสุภาพ ไม่เดาคำ', () => {
  assert.ok(say(h, 'เสนอคำ อะไร').text.includes('ยังไม่รู้จัก'));
  assert.ok(say(h, 'เสนอคำ ฟ้าผ่าxyz').text.includes('ยังไม่รู้จัก'));
});

check('"สร้างคำใหม่" เปล่าๆ บอกวิธีใช้ ไม่ตกไปหาคำตอบอื่น', () => {
  const r = say(h, 'สร้างคำใหม่');
  assert.ok(r.text.includes('เสนอคำ'), r.text);
});

say(h, 'สอน นักดนตรี | คนที่เล่นดนตรีเป็นอาชีพค่ะ');
check('สอนคำที่เสนอแล้ว: คำนั้นเข้าความรู้ และไม่ถูกเสนอซ้ำ', () => {
  assert.ok(h.store.find('นักดนตรี'), 'taught entry missing');
  const taken = w => !!(h.store.find(w) || h.store.find(w + 'คืออะไร'));
  assert.ok(!N.Coin.propose(lex(), 'ดนตรี', taken).some(x => x.word === 'นักดนตรี'));
  assert.ok(!say(h, 'เสนอคำ ดนตรี').text.includes('นักดนตรี'));
});

check('คำที่สอนแล้วคงอยู่หลังโหลดใหม่ (คลังคำสร้างจากความรู้ที่เก็บไว้)', () => {
  const h2 = build(ls);
  assert.ok(h2.store.find('นักดนตรี'), 'taught entry lost after reload');
  assert.ok(N.Coin.isRoot(h2.thinker.lexicon, 'ดนตรี'));
});

check('รากอื่นที่รู้จักตั้งแต่แรกก็เสนอได้ (เรียน)', () => {
  const list = N.Coin.propose(lex(), 'เรียน');
  assert.ok(list.length >= 2, 'got ' + list.length);
});

console.log('\nผ่าน ' + passed + ' ข้อ');
