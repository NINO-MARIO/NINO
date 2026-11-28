// มิ้ม | ทดสอบปุ่มตอบถูก/ไม่ถูก (ระดับเอนจิน ไม่ต้องใช้เบราว์เซอร์)
// ตรวจ: คำตอบจากความรู้ส่ง entryQ ไปกับข้อความ, คำตอบที่ไม่ได้มาจากความรู้ไม่ส่ง, ผลตอบรับบันทึกเข้ารายการนั้น,
// ไม่นับซ้ำกับสัญญาณจากการถามต่อของรอบเดียวกัน, คำถามที่ไม่มีอยู่ไม่พัง, ผลตอบรับคงอยู่หลังโหลดใหม่
// รัน: node mim/tests/feedback-test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = ['engine/00-core.js', 'engine/10-text.js', 'engine/12-romanize.js', 'engine/05-seed.js', 'engine/38-profile.js', 'engine/35-lexicon.js', 'engine/36-graph.js', 'engine/20-store.js', 'engine/31-calibrate.js', 'engine/30-retrieval.js', 'engine/40-language.js', 'engine/32-intent.js', 'engine/33-links.js', 'engine/37-thinker.js', 'engine/45-manners.js', 'engine/46-textpipe.js', 'engine/39-learn.js', 'engine/47-compose.js', 'engine/48-selfstudy.js', 'engine/49-sources.js', 'engine/54-webcand.js', 'engine/52-coin.js', 'engine/53-skills.js', 'engine/50-chat.js', 'engine/34-aliases.js', 'data/aliases-th.js', 'data/sources-th.js', 'data/pack-th.js'];

let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }

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
  bus.on('chat.out', m => out.push({ kind: m.kind, text: m.text, meta: m.meta || '', entryQ: m.entryQ || '' }));
  return { N, store, chat, bus, out, ls };
}

const mem = new Map();
let w = world(mem);
const last = () => w.out[w.out.length - 1] || {};
function ask(q) { w.out.length = 0; w.chat.handle(q); return last(); }

(async () => {
  console.log('== มิ้ม ปุ่มตอบถูก/ไม่ถูก');
  // สอนคำถามทดสอบหนึ่งข้อ แล้วถามให้มิ้มตอบจากความรู้นั้น
  const Q = 'ทดสอบเรื่องแมวผลตอบรับ';
  ask('สอน ' + Q + ' | แมวกินปลา');
  const a1 = ask(Q);
  ok(a1.kind === 'answer' && a1.text.indexOf('แมวกินปลา') >= 0, 'taught answer comes from knowledge: ' + a1.kind + ' ' + a1.text);
  ok(a1.entryQ === Q, 'answer from knowledge carries its question id: ' + JSON.stringify(a1.entryQ));

  // ตอบจากคลังที่ไม่มีคำตอบ ต้องไม่ส่ง entryQ
  const f = ask('ถามเรื่องที่ไม่มีอยู่จริงเลยxyz');
  ok(f.entryQ === '', 'fallback/related reply carries no question id: ' + f.kind);

  // ผลตอบรับบันทึกเข้ารายการนั้น
  // ฐาน: การถามเรื่องอื่นต่อจากคำตอบนี้นับเป็นสัญญาณ "ถามต่อ" (ตามกติกาเดิม) จึงวัดเป็นผลต่างจากฐาน
  const fbOf = () => { const e = w.store.find(Q); return { a: (e.fb && e.fb.a) || 0, b: (e.fb && e.fb.b) || 0 }; };
  const base = fbOf();
  w.bus.emit('chat.feedback', { q: Q, ok: false });
  ok(fbOf().b === base.b + 1 && fbOf().a === base.a, 'ไม่ถูก adds one wrong: ' + JSON.stringify(fbOf()));
  w.bus.emit('chat.feedback', { q: Q, ok: true });
  ok(fbOf().a === base.a + 1, 'ตอบถูก adds one ok');

  // ไม่นับซ้ำ: กดไม่ถูกหลังคำตอบล่าสุด แล้วถามเรื่องใหม่ ต้องนับเพิ่มเพียงหนึ่งครั้ง
  ask(Q);
  w.bus.emit('chat.feedback', { q: Q, ok: false });
  ask('เรื่องอื่นที่ไม่เกี่ยวเลยxyz');
  ok(fbOf().b === base.b + 2, 'manual verdict is not counted twice with the follow-up signal: ' + JSON.stringify(fbOf()));

  // คำถามที่ไม่มีอยู่ในคลัง ต้องไม่พัง
  const miss = w.chat.feedback('ไม่มีคำถามนี้ในคลังแน่นอน', true);
  ok(miss.status === 'missing', 'unknown question returns missing without throwing');

  // คงอยู่หลังโหลดใหม่
  const before = JSON.stringify(w.store.find(Q).fb);
  w = world(mem);
  const again = w.store.find(Q);
  ok(again && JSON.stringify(again.fb) === before, 'feedback survives reload: ' + before + ' vs ' + JSON.stringify(again && again.fb));

  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL: crashed: ' + e.stack); process.exit(1); });
