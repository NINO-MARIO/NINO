/* มิ้ม | ทดสอบพี่นาเดียร์ (mim/nadia.js) โดยไม่ใช้เครือข่ายจริง: node mim/tests/nadia-test.js
 * ตรวจ: ค้นความรู้เพื่อแนบคำสั่ง, กติกาภาษาไทยและไม่มีอิโมจิ, การล้มเหลวทุกแบบกลับมาเป็นผลที่ใช้ต่อได้,
 * การจำคำตอบต้องเกิดเมื่อผู้ใช้สั่งเท่านั้น, การตั้งค่าเก็บแยกจากคีย์ความรู้เดิม
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = [
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
  'engine/48-selfstudy.js', 'engine/49-sources.js', 'engine/54-webcand.js', 'engine/52-coin.js', 'engine/53-skills.js', 'engine/50-chat.js',
  'nadia.js'
];
const KB_KEY = 'nino_local_ai_kb_v1';
const CFG_KEY = 'nino_mim_nadia_v1';
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
  const sandbox = { console, localStorage: ls, setTimeout, clearTimeout, Date };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  const store = new sandbox.NINO.KnowledgeStore(ls).load();
  if (store.ensureSeed(sandbox.NINO.SEED_KNOWLEDGE)) store.save();
  return { sandbox, ls, store, N: sandbox.NINO_NADIA, NINO: sandbox.NINO };
}

const TEACH_Q = 'ท้องฟ้าสีอะไร';
const TEACH_A = 'ท้องฟ้าสีฟ้าค่ะ';

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('จำคำตอบได้เฉพาะเมื่อสั่ง และตอบ invalid เมื่อว่างเปล่า', () => {
  const { store, N } = load();
  const before = store.entries.length;
  assert.strictEqual(N.teach(store, TEACH_Q, TEACH_A).status, 'new');
  assert.ok(store.entries.length >= before + 1, 'at least the taught entry (plus variants)');
  assert.strictEqual(N.teach(store, TEACH_Q, 'คำตอบใหม่ค่ะ').status, 'updated');
  assert.strictEqual(N.teach(store, '', TEACH_A).status, 'invalid');
});

test('ค้นความรู้ที่ใกล้คำถามที่สุดได้', () => {
  const { store, N } = load();
  N.teach(store, TEACH_Q, TEACH_A);
  const hits = N.topHits(store, TEACH_Q, 3);
  assert.ok(hits.length >= 1, 'has hits');
  assert.strictEqual(hits[0].entry.q, TEACH_Q);
});

test('คำสั่งที่แนบมีความรู้ที่สอนไว้ และกติกาภาษาไทยไม่มีอิโมจิ', () => {
  const { store, N } = load();
  N.teach(store, TEACH_Q, TEACH_A);
  const sys = N.buildSystem(N.topHits(store, TEACH_Q, 6));
  assert.ok(sys.indexOf(TEACH_A) >= 0, 'contains taught answer');
  assert.ok(sys.indexOf('ภาษาไทยล้วน') >= 0, 'thai-only rule');
  assert.ok(sys.indexOf('ไม่ใช้อิโมจิ') >= 0, 'no-emoji rule');
  assert.ok(sys.indexOf('ห้ามแต่งข้อเท็จจริง') >= 0, 'honesty rule');
});

test('ตอบสำเร็จ: ส่งคำถามเป็นข้อความผู้ใช้ และตัดอิโมจิออกจากคำตอบ', async () => {
  const { store, N } = load();
  N.teach(store, TEACH_Q, TEACH_A);
  let seen = null;
  const generate = async (args) => {
    seen = args;
    return 'ท้องฟ้าสีฟ้าค่ะ 🌤';
  };
  const r = await N.ask({ question: TEACH_Q, store, generate });
  assert.strictEqual(r.ok, true, 'ok');
  assert.ok(!EMOJI.test(r.text), 'emoji removed: ' + r.text);
  assert.ok(r.text.indexOf('ท้องฟ้าสีฟ้าค่ะ') >= 0);
  assert.ok(r.usedKnowledge >= 1);
  assert.strictEqual(seen.contents[0].parts[0].text, TEACH_Q);
  assert.ok(seen.systemInstruction.indexOf(TEACH_A) >= 0);
});

test('คำตอบที่ไม่มีตัวอักษรไทยถูกปฏิเสธ (กลับไปใช้มิ้มออฟไลน์)', async () => {
  const { store, N } = load();
  const r = await N.ask({ question: 'what is the sky', store, generate: async () => 'Sky is blue.' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.indexOf('ไม่ใช่ภาษาไทย') >= 0, r.error);
});

test('ผู้ให้บริการโยนข้อผิดพลาดมา ต้องได้ผลล้มเหลวกลับ ไม่โยนออกไป', async () => {
  const { store, N } = load();
  const r = await N.ask({ question: TEACH_Q, store, generate: async () => { throw new Error('network down'); } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'network down');
});

test('หมดเวลาแล้วได้ผลล้มเหลว และไม่ค้างรอ', async () => {
  const { store, N } = load();
  const r = await N.ask({ question: TEACH_Q, store, timeoutMs: 30, generate: () => new Promise(() => {}) });
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.indexOf('หมดเวลา') >= 0, r.error);
});

test('ไม่มีฟังก์ชัน API ให้ได้ผลล้มเหลว', async () => {
  const { store, N } = load();
  const r = await N.ask({ question: TEACH_Q, store, generate: undefined });
  assert.strictEqual(r.ok, false);
});

test('รับคำตอบแบบ object ที่มีฟิลด์ text ได้', async () => {
  const { store, N } = load();
  const r = await N.ask({ question: TEACH_Q, store, generate: async () => ({ text: 'ตอบเป็นไทยค่ะ' }) });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.text, 'ตอบเป็นไทยค่ะ');
});

test('การถามไม่จำคำตอบเข้าคลังเอง', async () => {
  const { store, N } = load();
  const before = store.entries.length;
  await N.ask({ question: 'คำถามใหม่ทดสอบ', store, generate: async () => 'คำตอบใหม่ค่ะ' });
  assert.strictEqual(store.entries.length, before, 'no auto-teach');
});

test('การตั้งค่าพี่นาเดียร์เก็บที่คีย์ของตัวเอง ไม่ใช่คีย์ความรู้เดิม', () => {
  const { ls, N } = load();
  assert.strictEqual(N.status().on, false);
  N.setOn(true);
  assert.strictEqual(N.status().on, true);
  assert.ok(N.status().consentAt > 0, 'consent time saved');
  assert.ok(ls._m.get(CFG_KEY), 'own key written');
  assert.notStrictEqual(CFG_KEY, KB_KEY);
  N.setOn(false);
  assert.strictEqual(N.status().on, false);
  assert.ok(N.status().consentAt > 0, 'consent time kept after off');
});

test('ค่าการตั้งค่าที่เสียหายไม่ทำให้โมดูลพัง', () => {
  const { ls, N } = load();
  ls.setItem(CFG_KEY, '{bad json');
  assert.strictEqual(N.status().on, false);
  ls.setItem(CFG_KEY, '"not an object"');
  assert.strictEqual(N.status().on, false);
});

(async () => {
  console.log('== มิ้ม: พี่นาเดียร์ (mim/nadia.js)');
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    try {
      await t.fn();
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
