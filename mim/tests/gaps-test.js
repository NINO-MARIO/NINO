// คำถามทั้งข้อที่มิ้มตอบไม่ได้: จดไว้ เก็บข้ามการโหลดใหม่ ออกจากรายการเมื่อสอนแล้ว และจำกัดจำนวน
// รัน: node mim/tests/gaps-test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = ['engine/00-core.js', 'engine/10-text.js', 'engine/12-romanize.js', 'engine/05-seed.js', 'engine/38-profile.js', 'engine/35-lexicon.js', 'engine/36-graph.js', 'engine/20-store.js', 'engine/31-calibrate.js', 'engine/30-retrieval.js', 'engine/40-language.js', 'engine/32-intent.js', 'engine/33-links.js', 'engine/37-thinker.js', 'engine/45-manners.js', 'engine/46-textpipe.js', 'engine/39-learn.js', 'engine/47-compose.js', 'engine/48-selfstudy.js', 'engine/49-sources.js', 'engine/54-webcand.js', 'engine/52-coin.js', 'engine/53-skills.js', 'engine/50-chat.js', 'engine/34-aliases.js', 'data/aliases-th.js', 'data/sources-th.js', 'data/pack-th.js'];

let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
const FLOOR = 8;

function world(mem) {
  const ls = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  const sb = { console, localStorage: ls, setTimeout, clearTimeout, Date };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  const N = sb.NINO;
  const store = new N.KnowledgeStore(ls).load();
  if (store.ensureSeed(N.SEED_KNOWLEDGE)) store.save();
  N.Learn.ensurePack(store, sb.NINO_PACK_TH);
  store.settings.enabled = true;
  const bus = new N.Bus(), graph = new N.Graph();
  const retrieval = graph.add(new N.RetrievalNode('retrieval', bus, store));
  const language = graph.add(new N.LanguageNode('language', bus, store));
  const thinker = new N.ThinkNode('thinker', bus, store, retrieval, language);
  thinker.getGraph();
  const chat = new N.ChatNode('chat', bus, store, thinker);
  const out = [];
  bus.on('chat.out', m => out.push({ kind: m.kind, text: m.text, meta: m.meta || '' }));
  return { N, store, chat, out, ls };
}

const mem = new Map();
let w = world(mem);
w.chat.handle('ฝนตกทำไง');
ok(w.out[w.out.length - 1].kind === 'fallback', 'unknown question falls back');
ok(w.store.qgaps.length === 1 && w.store.qgaps[0] === 'ฝนตกทำไง', 'fallback question is logged');

// โหลดใหม่ ยังอยู่
w = world(mem);
ok(w.store.qgaps.indexOf('ฝนตกทำไง') >= 0, 'gap survives reload');

// ถามซ้ำไม่ซ้ำรายการ
w.chat.handle('ฝนตกทำไง');
ok(w.store.qgaps.filter(x => x === 'ฝนตกทำไง').length === 1, 'same question is not duplicated');

// คำที่ตอบได้ไม่ถูกจด
w.out.length = 0;
w.chat.handle('สวัสดี');
ok(w.store.qgaps.indexOf('สวัสดี') < 0, 'answered question is not logged');

// สอนแล้วออกจากรายการ
w.store.teach('ฝนตกทำไง', 'กางร่มหรือหลบในที่ร่มก่อนค่ะ');
ok(w.store.qgaps.indexOf('ฝนตกทำไง') < 0, 'taught question leaves the gap list');

// จำกัดจำนวน
for (let i = 0; i < 40; i++) w.store.noteQuestionGap('คำถามทดสอบ ' + i);
ok(w.store.qgaps.length <= 30, 'gap list is capped at 30, got ' + w.store.qgaps.length);
ok(w.store.qgaps[w.store.qgaps.length - 1] === 'คำถามทดสอบ 39', 'newest question is kept at the end');

console.log('gaps-test: ' + pass + '/' + (pass + fail) + ' passed, ' + fail + ' failed (ต้องผ่านอย่างน้อย ' + FLOOR + ')');
process.exit(fail || pass < FLOOR ? 1 : 0);
