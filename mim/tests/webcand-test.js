/* มิ้ม | เทสต์ผู้สมัครจากการค้นเว็บ (ไม่ใช้เครือข่าย ใช้ผลค้นปลอม)
 * รัน: node mim/tests/webcand-test.js
 * ครอบคลุม: ดึงเฉพาะนิยามที่ชื่อเรื่องอยู่ในคำถาม, ระดับความน่าเชื่อถือ, พักไว้ไม่เข้าความรู้เอง,
 * ยืนยันแล้วจึงจำพร้อมที่มา, ไม่เขียนทับความรู้เดิม, ทิ้งได้, คงอยู่หลังโหลดใหม่, ตอบได้หลังยืนยันเท่านั้น
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
  'engine/39-learn.js', 'engine/47-compose.js', 'engine/48-selfstudy.js', 'engine/49-sources.js',
  'engine/54-webcand.js',
  'engine/52-coin.js', 'engine/53-skills.js', 'engine/50-chat.js', 'engine/34-aliases.js', 'data/aliases-th.js', 'data/sources-th.js', 'data/pack-th.js'
];

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}

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
  return { sb, N, store, thinker, ls };
}

function think(h, text) {
  const gen = h.thinker.think(text);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

const WIKI = 'https://th.wikipedia.org/wiki/test';
const FAKE_Q = 'ทดลองดาวจำลองคืออะไร';
const FAKE_A = 'ทดลองดาวจำลอง คือ ดาวสมมติที่ใช้ทดสอบระบบผู้สมัคร';
const FAKE_RESULTS = [
  { src: 'Wikipedia', title: 'ทดลองดาวจำลอง', url: WIKI, text: FAKE_A + '. ดาวพุธ เป็นดาวเคราะห์ดวงแรกในระบบสุริยะ.' },
];

// ผู้สมัครจากผลค้นปลอม (ไม่ใช้เครือข่าย)
{
  const h = build(memStorage());
  const WC = h.N.WebCand;

  ok('ดึงนิยามที่ชื่อเรื่องอยู่ในคำถาม และตั้งระดับ medium ให้ Wikipedia', () => {
    const c = WC.candidates(FAKE_Q, FAKE_RESULTS);
    assert.strictEqual(c.length, 1, 'ควรได้ 1 ข้อ ได้ ' + c.length);
    assert.strictEqual(c[0].q, FAKE_Q);
    assert.strictEqual(c[0].a, FAKE_A);
    assert.strictEqual(c[0].trust, 'medium');
    assert.strictEqual(c[0].url, WIKI);
  });

  ok('ไม่ดึงนิยามเรื่องอื่นที่ชื่อไม่อยู่ในคำถาม (ดาวพุธ)', () => {
    const c = WC.candidates(FAKE_Q, FAKE_RESULTS);
    assert.ok(!c.some(x => x.q.includes('ดาวพุธ')));
  });

  ok('คำถามที่ชื่อเรื่องไม่ตรงกับผลค้น ไม่ได้ผู้สมัครเลย', () => {
    const c = WC.candidates('แมวกินอะไร', FAKE_RESULTS);
    assert.strictEqual(c.length, 0);
  });

  ok('แหล่งที่ไม่ใช่ Wikipedia ได้ระดับ low', () => {
    const c = WC.candidates(FAKE_Q, [{ src: 'DuckDuckGo', title: 'x', url: 'https://example.com/a', text: FAKE_A }]);
    assert.strictEqual(c[0].trust, 'low');
    assert.strictEqual(WC.hostOf(c[0].url), 'example.com');
  });

  ok('ผลค้นว่างหรือผิดรูป ไม่พัง', () => {
    assert.strictEqual(WC.candidates(FAKE_Q, null).length, 0);
    assert.strictEqual(WC.candidates(FAKE_Q, [null, {}]).length, 0);
    assert.strictEqual(WC.candidates('', FAKE_RESULTS).length, 0);
  });

  ok('พักผู้สมัครไม่เข้าความรู้ (ยังตอบไม่ได้จนกว่าจะยืนยัน)', () => {
    const added = WC.queue(h.store, WC.candidates(FAKE_Q, FAKE_RESULTS));
    assert.strictEqual(added, 1);
    assert.strictEqual(h.store.find(FAKE_Q), null, 'ห้ามเข้าคลังโดยไม่ยืนยัน');
    const r = think(h, FAKE_Q);
    assert.ok(!(r && r.entry && r.entry.a === FAKE_A), 'ก่อนยืนยันห้ามตอบจากผู้สมัคร');
  });

  ok('พักซ้ำและความรู้เดิมไม่ถูกเพิ่มซ้ำ', () => {
    assert.strictEqual(WC.queue(h.store, WC.candidates(FAKE_Q, FAKE_RESULTS)), 0);
    assert.strictEqual(h.store.candidates.length, 1);
  });

  const id = WC.list(h.store)[0].id;

  ok('ยืนยันแล้วจำพร้อมที่มา (src web-Wikipedia, trust medium) และนำออกจากรายการรอ', () => {
    const r = WC.confirm(h.store, id);
    assert.strictEqual(r.status, 'new');
    const e = h.store.find(FAKE_Q);
    assert.ok(e, 'ต้องมีความรู้แล้ว');
    assert.strictEqual(e.a, FAKE_A);
    assert.strictEqual(e.src, 'web-Wikipedia');
    assert.strictEqual(e.trust, 'medium');
    assert.strictEqual(h.store.candidates.length, 0);
  });

  ok('หลังยืนยันมิ้มตอบได้ตรงคำถามนั้น', () => {
    const r = think(h, FAKE_Q);
    assert.ok(r && r.entry && r.entry.a === FAKE_A, 'ควรตอบด้วยคำตอบที่ยืนยันแล้ว');
  });

  ok('ยืนยันผู้สมัครที่มีความรู้เดิมแล้ว ไม่เขียนทับ', () => {
    const existingQ = 'ปัญญาคืออะไร';
    const before = h.store.find(existingQ);
    assert.ok(before, 'ต้องมีความรู้เดิมจาก seed');
    const old = before.a;
    h.store.candidates.push({ q: existingQ, a: 'ข้อความจากเว็บที่ไม่ควรมาแทน', src: 'Wikipedia', title: '', url: WIKI, trust: 'medium', quote: 'x' });
    const cid = WC.list(h.store).find(x => x.q === existingQ).id;
    const r = WC.confirm(h.store, cid);
    assert.strictEqual(r.status, 'exists');
    assert.strictEqual(h.store.find(existingQ).a, old, 'ความรู้เดิมต้องไม่เปลี่ยน');
    assert.strictEqual(h.store.candidates.length, 0);
  });

  ok('ทิ้งผู้สมัครได้ และทิ้งซ้ำไม่มีผล', () => {
    WC.queue(h.store, [{ q: 'ทดลองทิ้งคืออะไร', a: 'ทดลองทิ้ง คือ รายการที่ถูกทิ้ง', src: 'DuckDuckGo', title: '', url: '', trust: 'low', quote: 'x' }]);
    const cid = WC.list(h.store)[0].id;
    assert.strictEqual(WC.dismiss(h.store, cid), true);
    assert.strictEqual(WC.dismiss(h.store, cid), false);
    assert.strictEqual(h.store.find('ทดลองทิ้งคืออะไร'), null);
  });

  ok('ยืนยันรหัสที่ไม่มีอยู่ ตอบ missing', () => {
    assert.strictEqual(WC.confirm(h.store, 'ไม่มี|x').status, 'missing');
  });

  ok('ผู้สมัครคงอยู่หลังโหลดใหม่ และความรู้ที่ยืนยันแล้วคงอยู่ด้วย', () => {
    WC.queue(h.store, [{ q: 'ทดลองคงอยู่คืออะไร', a: 'ทดลองคงอยู่ คือ รายการที่รอดหลังโหลดใหม่', src: 'Wikipedia', title: '', url: WIKI, trust: 'medium', quote: 'x' }]);
    h.store.save();
    const again = new h.N.KnowledgeStore(h.ls).load();
    assert.strictEqual(again.candidates.length, 1);
    assert.strictEqual(again.candidates[0].q, 'ทดลองคงอยู่คืออะไร');
    assert.ok(again.find(FAKE_Q), 'ความรู้ที่ยืนยันแล้วต้องคงอยู่');
  });

  ok('ไม่เขียนทับหรือเก็บผู้สมัครที่ข้อมูลไม่ครบ (ไม่มีคำตอบ)', () => {
    const n = h.store.candidates.length;
    assert.strictEqual(WC.queue(h.store, [{ q: 'ไม่มีคำตอบ', a: '' }]), 0);
    assert.strictEqual(h.store.candidates.length, n);
  });

  ok('เล่นแบบเต็ม: ลบการค้นเว็บเมื่อล้างคลังแล้วผู้สมัครหายไปด้วย', () => {
    h.store.clear();
    assert.strictEqual(h.store.candidates.length, 0);
  });
}

// ความรู้ของแหล่งที่เพิ่มใหม่ (Mars) ยังติดตั้งได้เหมือนเดิม
ok('แหล่งดาวอังคารลงทะเบียนแล้ว และติดตั้งได้โดยไม่เขียนทับความรู้เดิม', () => {
  const h = build(memStorage());
  const src = h.N.Sources.get('trueplookpanya-mars');
  assert.ok(src, 'ต้องมีแหล่ง');
  assert.strictEqual(src.trust, 'medium');
  assert.strictEqual(src.lines.length, 2);
  const r = h.N.Sources.load(h.store, h.thinker, 'trueplookpanya-mars');
  assert.ok(!r.error, r.error);
});

console.log('\n' + passed + ' ผ่าน');
