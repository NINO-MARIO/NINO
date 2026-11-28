/* ชุดทดสอบแกนกลาง: node tests/run-tests.js
 * โหลดไฟล์ src ตามลำดับลงใน vm sandbox เดียวกับเบราว์เซอร์ แล้วตรวจพฤติกรรมสำคัญ
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CORE_FILES = [
  'engine/00-core.js',
  'engine/10-text.js',
  'engine/12-romanize.js',
  'engine/05-seed.js',
  'engine/38-profile.js',
  'engine/35-lexicon.js',
  'engine/36-graph.js',
  'engine/20-store.js',
  'engine/31-calibrate.js',
  'engine/30-retrieval.js',
  'engine/40-language.js',
  'engine/32-intent.js',
  'engine/33-links.js',
  'engine/37-thinker.js',
  'engine/45-manners.js',
  'engine/46-textpipe.js',
  'engine/39-learn.js',
  'engine/47-compose.js',
  'engine/48-selfstudy.js', 'engine/49-sources.js', 'engine/54-webcand.js', 'engine/52-coin.js', 'engine/53-skills.js', 'engine/50-chat.js'
];

function loadNino() {
  const sandbox = { console, performance: global.performance };
  vm.createContext(sandbox);
  for (const f of CORE_FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox.NINO;
}

// rng แบบกำหนดค่าได้ เพื่อให้ผลทดสอบซ้ำได้เสมอ
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeMemStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k)
  };
}

const NINO = loadNino();
const { Text, KnowledgeStore, RetrievalNode, LanguageNode, ThinkNode, ChatNode, Graph, Lexicon, WordGraph } = NINO;
const { performance: _perf } = { performance: global.performance };
const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u;

// ทุกเคสทำงานผ่านระบบเต็ม: คลัง -> ผู้คิด -> แชต (ไม่เรียกทีละโมดูล)
function makeSystem(opts) {
  const o = opts || {};
  const graph = new Graph();
  const store = new KnowledgeStore(makeMemStorage()).load();
  const retrieval = graph.add(new RetrievalNode('retrieval', graph.bus, store));
  const language = graph.add(new LanguageNode('language', graph.bus, store, { rng: seeded(7) }));
  const thinker = graph.add(new ThinkNode('thinker', graph.bus, store, retrieval, language));
  graph.add(new ChatNode('chat', graph.bus, store, thinker));
  const out = [];
  const events = [];
  const steps = [];
  graph.bus.on('chat.out', m => { out.push(m); events.push('chat.out'); });
  graph.bus.on('think.begin', () => events.push('think.begin'));
  graph.bus.on('think.end', () => events.push('think.end'));
  graph.bus.on('think.step', m => { steps.push(m); events.push('think.step'); });
  if (o.enabled !== false) store.settings.enabled = true;
  return { graph, store, retrieval, language, thinker, bus: graph.bus, out, events, steps };
}

// เก็บขั้นตอนการคิดทั้งหมดจากตัวสร้าง (generator) ของผู้คิด
function runThink(sys, text) {
  const steps = [];
  const it = sys.thinker.think(text);
  let r = it.next();
  while (!r.done) { steps.push(r.value); r = it.next(); }
  return { steps, result: r.value };
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok      ' + name);
  } catch (e) {
    failed++;
    console.log('FAILED  ' + name + '\n        ' + e.message);
  }
}

// ---------- ข้อความ ----------
test('normalize เก็บสระและวรรณยุกต์ไทยไว้ (บั๊กเดิมตัดทิ้ง)', () => {
  assert.strictEqual(Text.normalize('สวัสดี ครับ!'), 'สวัสดี ครับ');
  assert.strictEqual(Text.normalize('สวัสดี'), 'สวัสดี');
});

test('stripEmoji ตัดอิโมจิออก', () => {
  assert.strictEqual(Text.stripEmoji('สวัสดี 👋 ครับ'), 'สวัสดี ครับ');
  assert.strictEqual(Text.stripEmoji('เขิน 🥰'), 'เขิน');
});

test('keepThai ตัดอักษรอังกฤษออก เหลือภาษาไทยและเลข', () => {
  const s = Text.keepThai('AI ฉันชื่อ NINO ได้ 123');
  assert.ok(Text.isThaiOnly(s), 'ผลลัพธ์ต้องเป็นไทยล้วน: ' + s);
  assert.ok(s.includes('ฉันชื่อ'));
  assert.ok(!/[A-Za-z]/.test(s));
});

// ---------- แยกคำและกราฟ ----------
test('Lexicon แยกคำที่รู้จักจากข้อความไทยที่ไม่มีช่องว่าง', () => {
  const lx = new Lexicon(NINO.BASE_WORDS);
  const words = lx.segment('ฉันชอบแมว').map(t => t.w);
  assert.ok(words.includes('ฉัน') && words.includes('ชอบ') && words.includes('แมว'), words.join('|'));
});

test('Lexicon เรียนเฉพาะช่วงที่ไม่รู้จัก ไม่เรียนทั้งประโยคเป็นคำเดียว', () => {
  const lx = new Lexicon(NINO.BASE_WORDS);
  const learned = lx.learn('ทดสอบระบบ');
  assert.ok(learned.includes('ทดสอบ'), 'ต้องเรียนคำ ทดสอบ: ' + learned.join(','));
  const words = lx.segment('ทดสอบระบบ').map(t => t.w);
  assert.strictEqual(JSON.stringify(words), JSON.stringify(['ทดสอบ', 'ระบบ']));
});

test('Lexicon แบ่งประโยคไทยที่รู้จักคำได้ถูกต้อง', () => {
  const lx = new Lexicon(NINO.BASE_WORDS);
  const words = lx.segment('ฉันชอบกินข้าว').map(t => t.w);
  assert.strictEqual(JSON.stringify(words), JSON.stringify(['ฉัน', 'ชอบ', 'กิน', 'ข้าว']));
});

test('Lexicon ไม่ตัดสระและวรรณยุกต์ออกจากพยัญชนะ (กลุ่มอักขระ)', () => {
  const lx = new Lexicon([]);
  const tokens = lx.segment('ห้องน้ำ');
  // ต้องไม่มีโทเค็นที่ขึ้นต้นด้วยเครื่องหมายกำกับ (สระหรือวรรณยุกต์) ลอยเดี่ยวๆ
  for (const t of tokens) assert.ok(!/^\p{M}/u.test(t.w), 'โทเค็นขึ้นต้นด้วยเครื่องหมาย: ' + t.w);
  assert.strictEqual(tokens.map(t => t.w).join(''), 'ห้องน้ำ');
});

test('Lexicon ช่วงที่ไม่รู้จักติดกันถูกรวมเป็นโทเค็นเดียว และต่อกลับได้เท่าเดิม', () => {
  const lx = new Lexicon(NINO.BASE_WORDS);
  const text = 'กระต่ายปักกิ่ง';
  const tokens = lx.segment(text);
  assert.strictEqual(tokens.map(t => t.w).join(''), text);
  assert.strictEqual(tokens.filter(t => !t.known).length, 1);
});

test('Profiler สะสมจำนวนครั้งและเวลาของแต่ละช่วง', () => {
  const p = new NINO.Profiler();
  const v = p.span('งาน', () => 42);
  p.record('งาน', 5);
  assert.strictEqual(v, 42);
  const s = p.summary().find(x => x.name === 'งาน');
  assert.strictEqual(s.count, 2);
  assert.ok(s.totalMs >= 5);
});

test('n-gram ไม่เบลอการแจกแจง: ความถี่ที่สุ่มได้ตรงกับจำนวนที่นับ', () => {
  const m = new NINO.NgramModel(3);
  m.train(['กขค', 'กขง', 'กขค']); // หลัง "กข" มี ค 2 ครั้ง ง 1 ครั้ง
  const rng = seeded(11);
  let c = 0, d = 0;
  const N = 30000;
  for (let i = 0; i < N; i++) {
    const ch = m._sample('กข', rng);
    if (ch === 'ค') c++;
    else if (ch === 'ง') d++;
  }
  assert.ok(Math.abs(c / N - 2 / 3) < 0.02, 'ค ได้ ' + (c / N).toFixed(3));
  assert.ok(Math.abs(d / N - 1 / 3) < 0.02, 'ง ได้ ' + (d / N).toFixed(3));
});

test('WordGraph ให้น้ำหนักคำถามเชื่อมคำตอบมากกว่าคำร่วมฝั่งเดียวกัน', () => {
  const g = WordGraph.build([{ entry: {}, q: ['ก', 'ข'], a: ['ค'] }]);
  assert.ok(g.weight('ก', 'ค') > g.weight('ก', 'ข'));
});

test('WordGraph หาเส้นทางระหว่างสองคำผ่านคำกลาง', () => {
  const g = WordGraph.build([
    { entry: {}, q: ['แมว'], a: ['สัตว์'] },
    { entry: {}, q: ['หมา'], a: ['สัตว์'] }
  ]);
  assert.deepStrictEqual(Array.from(g.path('แมว', 'หมา', 3)), ['แมว', 'สัตว์', 'หมา']);
});

// ---------- คลังความรู้ ----------
test('teach คืนสถานะ new / updated / invalid / too_long', () => {
  const s = new KnowledgeStore(makeMemStorage()).load();
  assert.strictEqual(s.teach('ก', 'ข'), 'new');
  assert.strictEqual(s.teach('ก', 'ค'), 'updated');
  assert.strictEqual(s.teach('', 'ข'), 'invalid');
  assert.strictEqual(s.teach('!!!', 'ข'), 'invalid');
  assert.strictEqual(s.teach('ก'.repeat(NINO.LIMITS.question + 1), 'ข'), 'too_long');
  assert.strictEqual(s.entries.length, 1);
  assert.strictEqual(s.entries[0].a, 'ค');
});

test('forget ลบรายการตามชื่อที่ทำให้เป็นรูปมาตรฐาน', () => {
  const s = new KnowledgeStore(makeMemStorage()).load();
  s.teach('สวัสดี', 'จ้า');
  assert.strictEqual(s.forget('สวัสดี'), true);
  assert.strictEqual(s.forget('สวัสดี'), false);
});

test('ค้นหาตรงตัวได้คะแนน 1 และค้นหาแบบใกล้เคียงได้', () => {
  const sys = makeSystem();
  sys.store.teach('สวัสดี', 'สวัสดีจ้า');
  const exact = sys.retrieval.match('สวัสดี');
  assert.ok(exact && exact.score === 1);
  const fuzzy = sys.retrieval.match('สวัสดีครับ');
  assert.ok(fuzzy && fuzzy.entry.q === 'สวัสดี');
});

test('นำเข้ารูปแบบเวอร์ชัน 1 ได้ทั้ง array และ {knowledge}', () => {
  const s = new KnowledgeStore(makeMemStorage()).load();
  let r = s.importData([{ question: 'ก', answer: 'ข' }, { key: 'ค', value: 'ง' }, null]);
  assert.strictEqual(r.added, 2);
  assert.strictEqual(r.skipped, 1);
  r = s.importData({ knowledge: [{ q: 'ก', a: 'ใหม่' }] });
  assert.strictEqual(r.updated, 1);
  assert.strictEqual(s.entries.length, 2);
});

test('นำเข้าไฟล์ที่ไม่ถูกรูปแบบต้องแจ้งข้อผิดพลาด', () => {
  const s = new KnowledgeStore(makeMemStorage()).load();
  assert.ok(s.importData({ foo: 1 }).error);
});

test('ส่งออกแล้วนำเข้าเครื่องใหม่ได้ข้อมูลครบ', () => {
  const a = new KnowledgeStore(makeMemStorage()).load();
  a.importData({ knowledge: NINO.SEED_KNOWLEDGE });
  const exported = JSON.parse(JSON.stringify(a.exportData()));
  const b = new KnowledgeStore(makeMemStorage()).load();
  const r = b.importData(exported);
  assert.strictEqual(r.added, NINO.SEED_KNOWLEDGE.length);
  assert.strictEqual(b.entries.length, a.entries.length);
});

test('บันทึกและโหลดซ้ำแล้วข้อมูลและข้อสังเกตไม่หาย (คีย์ localStorage เดิม)', () => {
  const storage = makeMemStorage();
  const a = new KnowledgeStore(storage).load();
  a.teach('ทดสอบ', 'ผ่าน');
  a.addInsight({ text: 'x เกี่ยวข้องกับ y', a: 'x', b: 'y', via: 'z', conf: 0.5 });
  a.noteGap('ราคา');
  a.settings.enabled = true;
  a.save();
  const b = new KnowledgeStore(storage).load();
  assert.strictEqual(b.entries.length, 1);
  assert.strictEqual(b.settings.enabled, true);
  assert.strictEqual(b.insights.length, 1);
  assert.strictEqual(JSON.stringify(b.gaps), JSON.stringify(['ราคา']));
  assert.ok(storage.getItem('nino_local_ai_kb_v1'));
});

test('ensureSeed เติมความรู้ตั้งต้นเพียงครั้งเดียว', () => {
  const s = new KnowledgeStore(makeMemStorage()).load();
  assert.strictEqual(s.ensureSeed(NINO.SEED_KNOWLEDGE), true);
  assert.strictEqual(s.entries.length, NINO.SEED_KNOWLEDGE.length);
  assert.strictEqual(s.ensureSeed(NINO.SEED_KNOWLEDGE), false);
  assert.strictEqual(s.entries.length, NINO.SEED_KNOWLEDGE.length);
});

test('persona ถูกตัดที่ 20000 ตัวอักษร', () => {
  const s = new KnowledgeStore(makeMemStorage()).load();
  assert.strictEqual(s.setPersona('x'.repeat(25000)), 20000);
});

// ---------- การคิดและแชต ----------
test('คำสั่งสอนผ่านการคิดก่อนแล้วจึงตอบ (ลำดับบนบัส)', () => {
  const sys = makeSystem();
  sys.bus.emit('chat.in', 'สอน ทดสอบระบบ | ระบบทำงานได้ดี');
  sys.events.length = 0;
  sys.bus.emit('chat.in', 'ทดสอบระบบ');
  assert.strictEqual(sys.events[0], 'think.begin');
  assert.strictEqual(sys.events[sys.events.length - 2], 'think.end');
  assert.strictEqual(sys.events[sys.events.length - 1], 'chat.out');
  assert.strictEqual(sys.out[sys.out.length - 1].kind, 'answer');
  assert.strictEqual(sys.out[sys.out.length - 1].text, 'ระบบทำงานได้ดี');
});

test('ขั้นตอนการคิดขึ้นต้นด้วย start และไม่มีอิโมจิ', () => {
  const sys = makeSystem();
  sys.store.teach('สวัสดี', 'สวัสดีจ้า');
  const { steps } = runThink(sys, 'สวัสดีครับ');
  assert.strictEqual(steps[0].kind, 'start');
  assert.ok(steps.some(s => s.kind === 'segment'));
  for (const s of steps) assert.ok(!EMOJI_RE.test(s.text), 'มีอิโมจิ: ' + s.text);
});

test('ไม่รู้จักคำ ระบบถามตัวเองและบันทึกเป็นช่องว่างความรู้', () => {
  const sys = makeSystem();
  const { steps, result } = runThink(sys, 'ราคาทองวันนี้เท่าไร');
  assert.ok(steps.some(s => s.kind === 'question'), 'ต้องมีขั้นถามตัวเอง');
  assert.ok(sys.store.gaps.length > 0);
  assert.strictEqual(result.kind, 'fallback');
});

test('ประกอบคำตอบจากเส้นทางความหมายเมื่อคำตอบตรงไม่มี', () => {
  const sys = makeSystem();
  sys.store.teach('แมว', 'สัตว์เลี้ยง');
  sys.store.teach('หมา', 'สัตว์เลี้ยง');
  sys.store.settings.threshold = 0.95;   // ปิดการจับคู่ตรงตัว
  sys.thinker.options.activation = 2;    // ปิดการกระตุ้นตรง เพื่อทดสอบเส้นทาง
  const { steps, result } = runThink(sys, 'แมว หมา');
  assert.strictEqual(result.kind, 'composed');
  assert.strictEqual(result.text, 'สัตว์เลี้ยง');
  assert.ok(steps.some(s => s.kind === 'path' && s.text.includes('สัตว์เลี้ยง')));
});

test('ทบทวนหลังสอนคำใหม่ แล้วบันทึกข้อสังเกตที่เชื่อมสองชั้น', () => {
  const sys = makeSystem();
  sys.bus.emit('chat.in', 'สอน แมว | สัตว์เลี้ยง');
  sys.steps.length = 0;
  sys.bus.emit('chat.in', 'สอน หมา | สัตว์เลี้ยง');
  assert.ok(sys.steps.some(s => s.kind === 'reflect'));
  assert.ok(sys.store.insights.some(x => x.text.includes('แมว') && x.text.includes('หมา')),
    'ไม่พบข้อสังเกต: ' + JSON.stringify(sys.store.insights));
  assert.strictEqual(sys.out[sys.out.length - 1].kind, 'taught');
});

test('เมื่อปิดใช้งาน ไม่มีขั้นตอนการคิด', () => {
  const sys = makeSystem({ enabled: false });
  sys.bus.emit('chat.in', 'สวัสดี');
  assert.strictEqual(sys.out[0].kind, 'disabled');
  assert.strictEqual(sys.events.includes('think.begin'), false);
});

test('ลืมความรู้ผ่านแชตได้', () => {
  const sys = makeSystem();
  sys.bus.emit('chat.in', 'สอน ทดสอบ | ผ่าน');
  sys.bus.emit('chat.in', 'ลืม ทดสอบ');
  assert.strictEqual(sys.out[sys.out.length - 1].kind, 'forgot');
  assert.strictEqual(sys.store.entries.length, 0);
});

test('โมเดลสำรองเปิดอยู่ ผลลัพธ์ต้องเป็นไทยล้วนและไม่มีอิโมจิ', () => {
  const sys = makeSystem();
  sys.store.settings.generator = true;
  sys.store.importData({ knowledge: NINO.SEED_KNOWLEDGE });
  const prompts = NINO.SEED_KNOWLEDGE.map(e => e.q).concat(['ได้ไหม', 'ทำไม']);
  let produced = 0;
  for (let round = 0; round < 3; round++) {
    for (const p of prompts) {
      const g = sys.language.generate(p);
      if (g === null) continue;
      produced++;
      assert.ok(Text.isThaiOnly(g), 'ต้องเป็นไทยล้วน: ' + g);
      assert.ok(!EMOJI_RE.test(g));
    }
  }
  assert.ok(produced > 0, 'ควรสร้างข้อความได้อย่างน้อยหนึ่งครั้ง');
});

test('โมเดลสำรองปิดเป็นค่าเริ่มต้น และ use() รับ adapter ที่ไม่ครบไม่ได้', () => {
  const sys = makeSystem();
  assert.strictEqual(sys.store.settings.generator, false);
  assert.strictEqual(sys.language.generate('สวัสดี'), null);
  assert.throws(() => sys.language.use({ id: 'bad' }));
});

// ---------- ข้อมูลตั้งต้น ----------
test('ความรู้พื้นฐานไม่มีอิโมจิ', () => {
  for (const e of NINO.SEED_KNOWLEDGE) {
    assert.ok(!EMOJI_RE.test(e.a) && !EMOJI_RE.test(e.q), 'มีอิโมจิใน: ' + e.q);
  }
});

// ---------- ผังโหนด ----------
test('Graph.describe บอกการเชื่อมต่อของโหนดได้', () => {
  const sys = makeSystem();
  const chat = sys.graph.describe().find(n => n.id === 'chat');
  assert.ok(chat.in.includes('chat.in'));
  assert.ok(chat.out.includes('chat.out'));
});

test('ห้ามรหัสโหนดซ้ำ', () => {
  const sys = makeSystem();
  assert.throws(() => sys.graph.add(new RetrievalNode('retrieval', sys.bus, sys.store)));
});

test('เพิ่มความรู้ทีละรายการให้กราฟเหมือนการสร้างใหม่ทั้งชุด (เพิ่ม/แก้ไข/ลบ)', () => {
  const rng = seeded(42);
  const words = ['ฉัน', 'ชอบ', 'กิน', 'ข้าว', 'แมว', 'หมา', 'บ้าน', 'น้ำ', 'ทะเล', 'ภูเขา', 'ป่า', 'ดอกไม้', 'ท้องฟ้า', 'สีฟ้า', 'ดาว', 'พระจันทร์'];
  const pick = () => words[Math.floor(rng() * words.length)];
  const bus = new NINO.Graph().bus;
  const store = new NINO.KnowledgeStore(makeMemStorage()).load();
  const inc = new NINO.ThinkNode('inc', bus, store, null, null);
  const snap = t => {
    const g = t.getGraph();
    const sortKey = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    return JSON.stringify({
      df: [...g.df.entries()].sort(sortKey),
      top: [...g.adj.keys()].sort().map(k => [k, g.neighbors(k).map(n => [n.w, n.weight])]),
      docs: t._docs.map(d => [d.q, d.a])
    });
  };
  const fresh = () => {
    const f = new NINO.ThinkNode('fresh', bus, store, null, null);
    f.rebuildAll();
    return snap(f);
  };
  for (let i = 0; i < 30; i++) {
    store.teach(pick() + ' ' + pick() + ' ข้อ' + i, pick() + ' ' + pick() + ' ' + pick());
    inc.getGraph();
  }
  assert.strictEqual(snap(inc), fresh(), 'เพิ่มต่อท้ายแล้วต้องตรงกับสร้างใหม่');

  store.teach(words[0] + ' ' + words[1] + ' ข้อ0', 'คำตอบใหม่ ' + pick());
  inc.getGraph();
  assert.strictEqual(snap(inc), fresh(), 'แก้ไขรายการเดิมต้องสร้างกราฟใหม่แล้วตรงกัน');

  store.forget(store.entries[3].q);
  assert.strictEqual(snap(inc), fresh(), 'ลบรายการต้องสร้างกราฟใหม่แล้วตรงกัน');
});

test('กฎเจตนาตอบ "ทำอะไรอยู่" ทั้งที่คำหยุดถูกตัดจนไม่เหลือคำให้จับคู่', () => {
  assert.strictEqual(NINO.Intent.match('ทำอะไรอยู่').id, 'doing');
  assert.strictEqual(NINO.Intent.match('กำลังทำอะไร').id, 'doing');
  assert.strictEqual(NINO.Intent.match('ขอบคุณมากค่ะ').id, 'thanks');
  assert.strictEqual(NINO.Intent.match('ทำอะไรได้บ้าง'), null, 'ต้องไม่ปนกับคำถามความสามารถ');
  assert.strictEqual(NINO.Intent.match(''), null);
});

test('คลาสมารยาทเติมคำลงท้ายสุภาพโดยไม่แก้ประโยคที่สุภาพอยู่แล้ว', () => {
  assert.strictEqual(NINO.Manners.polish('ข้าวอร่อยมาก'), 'ข้าวอร่อยมากค่ะ');
  assert.strictEqual(NINO.Manners.polish('สบายดีไหม'), 'สบายดีไหมคะ');
  assert.strictEqual(NINO.Manners.polish('คุณชื่ออะไร'), 'คุณชื่ออะไรคะ');
  assert.strictEqual(NINO.Manners.polish('ขอบคุณค่ะ'), 'ขอบคุณค่ะ');
  assert.strictEqual(NINO.Manners.polish('ไปกันเถอะ.'), 'ไปกันเถอะค่ะ');
  assert.strictEqual(NINO.Manners.polish('   '), '');
});

test('ไปป์ไลน์ .txt: สร้างแล้วอ่านกลับได้ และรายงานบรรทัดที่อ่านไม่ได้', () => {
  const text = NINO.TextPipe.generate([{ q: 'ทำอะไรได้บ้าง', a: 'ตอบได้หลายอย่างค่ะ' }]);
  assert.ok(text.includes('ถาม: ทำอะไรได้บ้าง'));
  assert.ok(text.includes('คำถามอื่น:'));
  const parsed = NINO.TextPipe.parse(text + '\nบรรทัดแปลก\n');
  const qs = parsed.items.map(i => i.q);
  assert.ok(qs.includes('ทำอะไรได้บ้าง'));
  assert.ok(qs.includes('ทำอะไรได้ไหม'), 'ควรได้คำถามทางเลือกที่สร้างจากกฎ');
  assert.ok(parsed.items.every(i => i.a === 'ตอบได้หลายอย่างค่ะ'));
  assert.strictEqual(parsed.errors.length, 1);
  assert.strictEqual(parsed.errors[0].text, 'บรรทัดแปลก');
});

test('ไปป์ไลน์ .txt นำเข้าผ่านคลาสมารยาทและนับผลการสอน', () => {
  const store = new NINO.KnowledgeStore(makeMemStorage()).load();
  const res = NINO.TextPipe.ingest(store, 'ถาม: ราคาทอง\nตอบ: ดูได้จากเว็บธนาคารนะ\n\nถาม: ราคาทอง\nตอบ: ดูได้จากเว็บธนาคาร');
  assert.strictEqual(res.parsed, 2);
  assert.strictEqual(res.counts.new, 1);
  assert.strictEqual(res.counts.updated, 1);
  assert.strictEqual(store.find('ราคาทอง').a, 'ดูได้จากเว็บธนาคารค่ะ', 'คำตอบต้องผ่านคลาสมารยาท');
});

test('โหนดเชื่อมรูปคำถามต่างกันแต่ความหมายเดียวกัน ให้คำตอบและบอกว่ามาจากโหนดใด', () => {
  const sys = makeSystem();
  sys.store.teach('ข้าวอร่อยไหม', 'อร่อยมากค่ะ');
  const r = runThink(sys, 'ข้าวอร่อยมั้ย');
  assert.strictEqual(r.result.kind, 'answer');
  assert.strictEqual(r.result.text, 'อร่อยมากค่ะ');
  assert.ok(r.steps.some(s => s.kind === 'link' && s.text.includes('paraphrase')), 'ต้องมีขั้นตอนจากโหนดเชื่อม');
  assert.ok(!r.result.fuzzy, 'คำตอบจากโหนดเชื่อมไม่ถูกนับเป็นการจับคู่คล้ายกัน');
});

test('โหนดเชื่อมไม่เสนอเมื่อคีย์ชนกันหลายรายการ (กำกวม)', () => {
  const sys = makeSystem();
  sys.store.teach('ทำงานไหม', 'ทำงานอยู่ค่ะ');
  sys.store.teach('ทำงานบ้าง', 'ทำงานหลายอย่างค่ะ');
  assert.strictEqual(sys.thinker.links[0].propose('ทำงาน').length, 0);
});

test('โหนดเทียบเสียงจับ "ใทย" กับ "ไทย" ได้ และไม่จับคำที่เสียงต่างกัน', () => {
  const sys = makeSystem();
  sys.store.teach('ไทย', 'ไทยคือภาษาของเรา');
  const sound = sys.thinker.links[1];
  assert.strictEqual(sound.propose('ใทย').length, 1);
  assert.strictEqual(sound.propose('ไกล').length, 0);
});

test('โหนดเชื่อมเห็นความรู้ที่เพิ่งสอนทันที (ดัชนีตามเวอร์ชันของคลัง)', () => {
  const sys = makeSystem();
  assert.strictEqual(sys.thinker.links[0].propose('อากาศดีไหม').length, 0);
  sys.store.teach('อากาศดีไหม', 'ดีมากค่ะ');
  assert.strictEqual(sys.thinker.links[0].propose('อากาศดีมั้ย').length, 1);
});

test('มีโหนดเชื่อมสามตัวอยู่ที่ผู้คิด และไม่มีข้อเสนอเมื่อไม่มีความรู้ที่เทียบได้', () => {
  const sys = makeSystem();
  assert.strictEqual(sys.thinker.links.length, 3);
  assert.strictEqual(sys.thinker._propose('ทั่วไปมาก'), null);
});

test('โหนดบริบทตอบคำอ้างอิงจากเรื่องที่คุยอยู่ และบอกชัดว่าเป็นเรื่องไหน', () => {
  const sys = makeSystem();
  sys.store.teach('ท้องฟ้าสีอะไร', 'ท้องฟ้าสีฟ้าค่ะ');
  runThink(sys, 'ท้องฟ้าสีอะไร');
  const r = runThink(sys, 'มันคืออะไร');
  assert.strictEqual(r.result.kind, 'answer');
  assert.ok(r.result.text.includes('ท้องฟ้าสีฟ้าค่ะ'));
  assert.ok(r.result.text.includes('ท้องฟ้าสีอะไร'), 'ต้องบอกเรื่องที่อ้างถึง');
  assert.ok(r.steps.some(s => s.kind === 'link' && s.text.includes('context')));
});

test('คำอ้างอิงที่ไม่มีเรื่องก่อนหน้า ไม่ถูกเดาว่าหมายถึงเรื่องใด', () => {
  const sys = makeSystem();
  sys.store.teach('ท้องฟ้าสีอะไร', 'ท้องฟ้าสีฟ้าค่ะ');
  const r = runThink(sys, 'มันคืออะไร');
  assert.ok(!r.steps.some(s => s.kind === 'link' && s.text.includes('context')));
  assert.notStrictEqual(r.result.text, 'ท้องฟ้าสีฟ้าค่ะ');
});

test('โหนดบริบทไม่เสนอเมื่อมีคำอื่นติดมา เช่น "มันเทศคืออะไร" แต่เสนอ "แล้วมันล่ะ"', () => {
  const sys = makeSystem();
  sys.store.teach('ท้องฟ้าสีอะไร', 'ท้องฟ้าสีฟ้าค่ะ');
  runThink(sys, 'ท้องฟ้าสีอะไร');
  assert.strictEqual(sys.thinker.links[2].propose('มันเทศคืออะไร').length, 0);
  assert.strictEqual(sys.thinker.links[2].propose('แล้วมันล่ะ').length, 1);
});

test('คำทักทายไม่กลายเป็นเรื่องที่คุยอยู่ จึงไม่ถูกใช้เป็นบริบท', () => {
  const sys = makeSystem();
  sys.store.teach('ท้องฟ้าสีอะไร', 'ท้องฟ้าสีฟ้าค่ะ');
  runThink(sys, 'สวัสดี');
  assert.strictEqual(sys.thinker.context.last, null);
});

test('ความรู้ที่ผู้ใช้สอนมีลำดับเหนือกฎเจตนา', () => {
  const sys = makeSystem();
  sys.store.settings.enabled = true;
  sys.bus.emit('chat.in', 'สอน ทำอะไรอยู่ | กำลังทำการบ้านอยู่');
  sys.bus.emit('chat.in', 'ทำอะไรอยู่');
  const last = sys.out[sys.out.length - 1];
  assert.strictEqual(last.text, 'กำลังทำการบ้านอยู่');
  assert.strictEqual(last.meta.startsWith('ตรงกับ'), true);
});

test('เมื่อไม่มีความรู้ที่สอนและไม่เข้ากฎเจตนา ระบบบอกว่าไม่รู้ ไม่เดาคำตอบ', () => {
  const sys = makeSystem();
  sys.store.settings.enabled = true;
  sys.bus.emit('chat.in', 'ท้องฟ้าสีอะไรในเวลาที่ไม่มีใครรู้');
  const last = sys.out[sys.out.length - 1];
  assert.ok(['fallback', 'answer'].includes(last.kind));
  assert.ok(last.kind !== 'answer' || last.meta !== 'จากกฎเจตนา');
});

test('ตัวปรับเกณฑ์เริ่มที่ค่าเดิม ยกขึ้นเมื่อจับคู่ผิด และคืนสู่ค่าเดิมเมื่อยอมรับ โดยไม่ต่ำกว่าค่าที่ตั้ง', () => {
  const store = new NINO.KnowledgeStore(makeMemStorage()).load();
  assert.strictEqual(NINO.Calibrator.effective(store), 0.34);
  NINO.Calibrator.feedback(store, 'wrong');
  assert.ok(NINO.Calibrator.effective(store) > 0.34);
  for (let i = 0; i < 100; i++) NINO.Calibrator.feedback(store, 'wrong');
  assert.ok(Math.abs(NINO.Calibrator.effective(store) - 0.49) < 1e-9, 'ต้องไม่เกินขอบบน');
  for (let i = 0; i < 200; i++) NINO.Calibrator.feedback(store, 'ok');
  assert.strictEqual(NINO.Calibrator.offset(store), 0);
  assert.ok(Math.abs(NINO.Calibrator.effective(store) - 0.34) < 1e-9, 'ต้องไม่ต่ำกว่าเกณฑ์ที่ผู้ใช้ตั้ง');
});

test('ค่าปรับของตัวปรับเกณฑ์ถูกบันทึกและอ่านกลับได้', () => {
  const storage = makeMemStorage();
  const a = new NINO.KnowledgeStore(storage).load();
  NINO.Calibrator.feedback(a, 'wrong');
  a.save();
  const b = new NINO.KnowledgeStore(storage).load();
  assert.ok(Math.abs(NINO.Calibrator.offset(b) - 0.02) < 1e-9);
  assert.strictEqual(NINO.Calibrator.describe(b).wrong, 1);
});

test('จับคู่คล้ายแล้วผู้ใช้สอนคำตอบอื่นทันที ตัวปรับเกณฑ์ยกขึ้น', () => {
  const sys = makeSystem();
  sys.store.settings.enabled = true;
  sys.store.teach('ฟ้าใสจัง', 'ใช่ค่ะ ฟ้าสดใสมาก');
  sys.bus.emit('chat.in', 'ฟ้าใสจังเลย');
  const last = sys.out[sys.out.length - 1];
  assert.strictEqual(last.kind, 'answer');
  assert.ok(last.meta.startsWith('ตรงกับ'), 'ต้องเป็นการจับคู่คล้าย: ' + last.meta);
  const before = NINO.Calibrator.offset(sys.store);
  sys.bus.emit('chat.in', 'สอน ฟ้าใสจังเลย | ฟ้าใสจริงๆ ค่ะ');
  assert.ok(NINO.Calibrator.offset(sys.store) > before, 'ต้องยกเกณฑ์หลังผู้ใช้แก้คำตอบ');
  assert.strictEqual(NINO.Calibrator.describe(sys.store).wrong, 1);
});

test('คำตอบตรงตัวไม่ถูกนับเป็นสัญญาณตัวปรับเกณฑ์', () => {
  const sys = makeSystem();
  sys.store.settings.enabled = true;
  sys.store.teach('ฟ้าใสจัง', 'ใช่ค่ะ');
  sys.bus.emit('chat.in', 'ฟ้าใสจัง');
  sys.bus.emit('chat.in', 'สอน อะไรก็ได้ | ตอบอันอื่น');
  assert.strictEqual(NINO.Calibrator.describe(sys.store).wrong, 0);
});

console.log('\nผ่าน ' + passed + ' ไม่ผ่าน ' + failed);
process.exit(failed ? 1 : 0);
