/* มิ้ม | ทดสอบการเรียนรู้ (39-learn), ผู้เรียบเรียง (47-compose) และกฎการไม่เดา
 * รัน: node mim/tests/learn-test.js  (ไม่ใช้เครือข่าย)
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
const KB_KEY = 'nino_local_ai_kb_v1';
const EMOJI = /\p{Extended_Pictographic}/u;

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _m: m
  };
}

function load() {
  const ls = memStorage();
  const sb = { console, localStorage: ls, setTimeout, clearTimeout, Date };
  sb.window = sb;
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  const N = sb.NINO;
  const store = new N.KnowledgeStore(ls).load();
  store.ensureSeed(N.SEED_KNOWLEDGE);
  const bus = new N.Bus();
  const graph = new N.Graph();
  const retrieval = graph.add(new N.RetrievalNode('retrieval', bus, store));
  const language = graph.add(new N.LanguageNode('language', bus, store));
  const thinker = new N.ThinkNode('thinker', bus, store, retrieval, language);
  thinker.getGraph();
  return { N, store, thinker, ls, pack: sb.NINO_PACK_TH, sb };
}

// ตอบแบบเดียวกับท่อจริง: ผ่านการคิดของผู้คิดทั้งหมด แล้วคืนคำตอบสุดท้าย
function think(h, text) {
  const gen = h.thinker.think(text);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('รูปคำถามใกล้เคียงถูกสร้างจากคำถามเดียว และไม่รวมคำถามเดิม', () => {
  const { N } = load();
  const v = N.Learn.variants('ท้องฟ้าสีอะไร');
  assert.ok(v.indexOf('ท้องฟ้าสี') >= 0, 'drops question word: ' + JSON.stringify(v));
  const w = N.Learn.variants('บอกหน่อยว่าน้ำเดือดที่กี่องศา');
  assert.ok(w.indexOf('น้ำเดือดที่กี่องศา') >= 0, 'drops lead words: ' + JSON.stringify(w));
  assert.ok(!N.Learn.variants('ใครสร้างมิ้มบ้างคะ').includes('ใครสร้างมิ้มบ้างคะ'), 'never returns the original');
});

test('สอนหนึ่งครั้งได้รูปคำถามเพิ่ม และทุกรูปชี้ไปคำตอบเดียวกัน', () => {
  const { N, store } = load();
  const r = N.Learn.teach(store, 'แมวกินอะไร', 'แมวกินปลาค่ะ');
  assert.strictEqual(r.status, 'new');
  assert.ok(r.derived.length >= 1, 'derived variants created');
  for (const v of r.derived) assert.strictEqual(store.find(v).a, 'แมวกินปลาค่ะ');
});

test('การสอนไม่เขียนทับความรู้เดิมที่มีคำถามรูปนั้นอยู่แล้ว', () => {
  const { N, store } = load();
  store.teach('ชื่ออะไร', 'คำตอบเดิมค่ะ');
  N.Learn.teach(store, 'ชื่ออะไรของเมืองนี้', 'คำตอบใหม่ค่ะ');
  assert.strictEqual(store.find('ชื่ออะไร').a, 'คำตอบเดิมค่ะ', 'existing answer intact');
});

test('การอัปเดตคำตอบเดิมไม่สร้างรูปคำถามเพิ่ม', () => {
  const { N, store } = load();
  N.Learn.teach(store, 'ดาวศุกร์อยู่ลำดับที่เท่าไร', 'ลำดับที่สองค่ะ');
  const before = store.entries.length;
  const r = N.Learn.teach(store, 'ดาวศุกร์อยู่ลำดับที่เท่าไร', 'ลำดับที่สองจริงค่ะ');
  assert.strictEqual(r.status, 'updated');
  assert.strictEqual(store.entries.length, before, 'no new variants on update');
});

test('ชุดความรู้เริ่มต้นเติมเฉพาะคำถามที่ยังไม่มี และไม่ถูกเติมซ้ำเมื่อรุ่นเดิม', () => {
  const { N, store, pack } = load();
  store.teach('มิ้มคืออะไร', 'คำตอบของผู้ใช้เองค่ะ');
  N.Learn.ensurePack(store, pack);
  assert.strictEqual(store.find('มิ้มคืออะไร').a, 'คำตอบของผู้ใช้เองค่ะ', 'user answer kept');
  const again = N.Learn.ensurePack(store, pack);
  assert.strictEqual(again, 0, 'same version adds nothing');
  assert.ok(pack.entries.length >= 40, 'pack has a useful size: ' + pack.entries.length);
});

test('ชุดความรู้เริ่มต้นไม่มีอิโมจิ และทุกคำตอบเป็นภาษาไทย', () => {
  const { pack } = load();
  for (const [q, a] of pack.entries) {
    assert.ok(!EMOJI.test(q + a), 'emoji in: ' + q);
    assert.ok(/[ก-๛]/.test(a), 'answer has Thai: ' + q);
  }
});

test('ชื่อที่แสดงเป็นมิ้มในประโยคที่พูดถึงตัวเอง และไม่แตะชื่อแอป', () => {
  const { N } = load();
  assert.strictEqual(N.Learn.displayName('ฉันคือ NINO ค่ะ'), 'ฉันคือมิ้ม ค่ะ');
  assert.strictEqual(N.Learn.displayName('NINO Local AI ช่วยตอบ'), 'มิ้ม ช่วยตอบ');
  assert.strictEqual(N.Learn.displayName('แอป NINO มีโหมด Code'), 'แอป NINO มีโหมด Code', 'app name untouched');
});

test('คำตอบที่เรียบเรียงต้องเป็นภาษาไทย จบด้วยคำลงท้าย และไม่ซ้ำคำตอบเดิม', () => {
  const h = load();
  const { N, store } = h;
  N.Learn.teach(store, 'แมวกินอะไร', 'แมวกินปลาและเนื้อสัตว์ค่ะ');
  N.Learn.teach(store, 'แมวชอบอะไร', 'แมวชอบนอนในที่อบอุ่นและชอบเล่นกับของเล่นค่ะ');
  N.Learn.teach(store, 'แมวเป็นสัตว์อะไร', 'แมวเป็นสัตว์เลี้ยงลูกด้วยนมค่ะ');
  const c = new N.Composer(store, (t) => h.thinker._seg(t));
  const r = c.say(['แมว'], 'เล่าเรื่องแมวให้ฟังหน่อย');
  assert.ok(r, 'composer produces a reply from the cat facts');
  assert.ok(/(?:ค่ะ|คะ|ครับ|นะ)$/.test(r.text), 'ends with particle: ' + r.text);
  assert.ok(!['แมวกินปลาและเนื้อสัตว์ค่ะ', 'แมวชอบนอนในที่อบอุ่นและชอบเล่นกับของเล่นค่ะ', 'แมวเป็นสัตว์เลี้ยงลูกด้วยนมค่ะ'].includes(r.text), 'not a verbatim copy');
  assert.strictEqual(r.topic, 'แมว');
});

test('ผู้เรียบเรียงไม่เลือกคำทั่วไปเป็นหัวเรื่อง และไม่ตอบถ้าไม่มีหัวเรื่อง', () => {
  const h = load();
  const { N, store } = h;
  const c = new N.Composer(store, (t) => h.thinker._seg(t));
  assert.strictEqual(c.say(['มี', 'ค่ะ', 'ไหม'], 'มีไหม'), null, 'function words are never topics');
  assert.strictEqual(c.say([], ''), null, 'no known words, no reply');
});

test('เมล็ดสุ่มเดิมให้ผลเดิม (ตรวจซ้ำได้)', () => {
  const h = load();
  const { N, store } = h;
  N.Learn.teach(store, 'แมวกินอะไร', 'แมวกินปลาและเนื้อสัตว์ค่ะ');
  N.Learn.teach(store, 'แมวชอบอะไร', 'แมวชอบนอนในที่อบอุ่นและชอบเล่นกับของเล่นค่ะ');
  const seg = (t) => h.thinker._seg(t);
  const a = new N.Composer(store, seg).say(['แมว'], 'เล่าเรื่องแมว');
  const b = new N.Composer(store, seg).say(['แมว'], 'เล่าเรื่องแมว');
  assert.deepStrictEqual(a, b);
});

test('คำถามที่มีคำยังไม่รู้จักต้องไม่ถูกตอบจากความรู้ที่บังเอิญตรง (ไม่เดา)', () => {
  const h = load();
  const { store, thinker } = h;
  N_teach(h, 'มีกี่ดวง', 'โลกมีดวงจันทร์ 1 ดวงค่ะ');
  const r = think(h, 'ดาวอังคารมีกี่ดวง');
  assert.ok(!r.text || r.text.indexOf('โลก') < 0, 'must not answer with the moon fact, got: ' + JSON.stringify(r));
  void store; void thinker;
});

function N_teach(h, q, a) {
  h.N.Learn.teach(h.store, q, a);
  h.thinker.getGraph();
}

test('ความรู้เก่าที่เก็บคำว่า NINO ยังเหมือนเดิม และการแสดงผลเปลี่ยนเป็นมิ้ม', () => {
  const { N, store } = load();
  store.teach('ใครสร้างคุณ', 'ฉันคือ NINO ค่ะ');
  const stored = store.find('ใครสร้างคุณ').a;
  assert.strictEqual(stored, 'ฉันคือ NINO ค่ะ', 'stored data not rewritten');
  assert.strictEqual(N.Learn.displayName(stored), 'ฉันคือมิ้ม ค่ะ', 'shown with the system name');
});

(() => {
  console.log('== มิ้ม: การเรียนรู้ ผู้เรียบเรียง และกฎการไม่เดา');
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    try {
      t.fn();
      pass++;
      console.log('  ok    ' + t.name);
    } catch (e) {
      fail++;
      console.log('  FAIL  ' + t.name + ': ' + (e && e.message ? e.message : e));
    }
  }
  console.log('\nผ่าน ' + pass + ' ไม่ผ่าน ' + fail);
  process.exit(fail ? 1 : 0);
})();
