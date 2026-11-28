// มิ้ม | ทดสอบเครื่องมือความจำ: การเรียนรู้ ช่องว่าง บันทึกคำถามแบบเปิดเอง ทดสอบซ้ำ และร่างคำตอบเข้าถาดยืนยัน
// ระดับเอนจิน ไม่ต้องใช้เบราว์เซอร์ รัน: node mim/tests/memory-tools-test.js
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
  return { N, store, chat, bus, out, ls, thinker };
}

const mem = new Map();
let w = world(mem);
const last = () => w.out[w.out.length - 1] || {};
function say(q) { w.out.length = 0; const r = w.chat.handle(q); return { r, last: last() }; }

(async () => {
  console.log('== มิ้ม เครื่องมือความจำ');
  const UNK = 'ถามเรื่องที่ไม่มีอยู่จริงxyz';
  const UNK2 = 'ถามเรื่องอีกอย่างxyz';
  const Q = 'ทดสอบเครื่องมือความจำ';

  // 1) การเรียนรู้: หลังสอนและกดตอบถูก มุมมองการเรียนรู้ต้องเห็นรายการนี้
  say('สอน ' + Q + ' | คำตอบทดสอบเครื่องมือความจำ');
  say(Q);
  w.chat.feedback(Q, true);
  const learn = say('มิ้มเรียนอะไร').last;
  ok(learn.kind === 'learning' && learn.text.indexOf('ความรู้ทั้งหมด') >= 0, 'learning view lists the store: ' + learn.text.slice(0, 60));
  ok(learn.text.indexOf('ตอบถูกบ่อย') >= 0 && learn.text.indexOf(Q) >= 0, 'learning view shows the rated question: ' + learn.text);

  // 2) ช่องว่าง: คำถามที่ตอบไม่ได้ถูกนับ และหายไปเมื่อสอนแล้ว
  say(UNK); say(UNK);
  const gaps1 = say('ช่องว่าง').last;
  ok(gaps1.kind === 'gaps' && gaps1.text.indexOf(UNK) >= 0 && gaps1.text.indexOf('2 ครั้ง') >= 0, 'gaps list counts repeats: ' + gaps1.text);
  say('สอน ' + UNK + ' | ตอบแล้ว');
  const gaps2 = say('ช่องว่าง').last;
  ok(gaps2.text.indexOf(UNK) < 0, 'taught question leaves the gap list');

  // 3) บันทึกคำถาม: ปิดเป็นค่าเริ่มต้น เปิดแล้วจดเฉพาะคำถามที่มิ้มตอบ และคงอยู่หลังโหลดใหม่
  say('ทดสอบ '); say(UNK2);
  ok(w.store.qlog.length === 0, 'question log is off by default');
  say('เปิดบันทึกคำถาม');
  say(UNK2);
  ok(w.store.qlog.length === 1 && w.store.qlog[0].q === UNK2 && w.store.qlog[0].kind === 'fallback', 'question log records the answered question: ' + JSON.stringify(w.store.qlog));
  w = world(mem);
  ok(w.store.qlogOn === true && w.store.qlog.length === 1, 'question log and flag survive reload');

  // 4) ทดสอบซ้ำ: ไม่มีอะไรเปลี่ยนก็ต้องเหมือนเดิมทั้งหมด และไม่แตะความรู้หรือบริบท
  const beforeEntries = JSON.stringify(w.store.entries);
  const ctxBefore = w.thinker.context;
  const rep1 = say('ทดสอบซ้ำ').last;
  ok(rep1.kind === 'replay' && rep1.text.indexOf('เปลี่ยน 0') >= 0, 'replay with no change reports 0 changes: ' + rep1.text);
  ok(JSON.stringify(w.store.entries) === beforeEntries, 'replay does not change knowledge');
  ok(w.thinker.context === ctxBefore && w.thinker.frozen !== true, 'replay restores context and unfreezes');

  // 5) ทดสอบซ้ำจับการเปลี่ยน: สอนคำถามที่เคยตอบไม่ได้ แล้วทดสอบซ้ำต้องเห็นการเปลี่ยนชนิดคำตอบ
  w.chat.handle('สอน ' + UNK2 + ' | ตอบแล้วอีกเรื่อง');
  const rep2 = say('ทดสอบซ้ำ').last;
  ok(rep2.text.indexOf('เปลี่ยน 1') >= 0 && rep2.text.indexOf('fallback → answer') >= 0, 'replay reports the change since last replay: ' + rep2.text);
  const rep3 = say('ทดสอบซ้ำ').last;
  ok(rep3.text.indexOf('เปลี่ยน 0') >= 0, 'next replay compares against the last one: ' + rep3.text);

  // 6) ล้างบันทึก
  say('ล้างบันทึกคำถาม');
  ok(w.store.qlog.length === 0, 'clear empties the question log');

  // 7) ร่างคำตอบ: ไม่มีโมเดลก็บอกตรงๆ, มีโมเดลก็เข้าถาดยืนยันเท่านั้น และยังไม่เข้าความรู้จนกว่าจะยืนยัน
  const noModel = say('ร่างคำตอบ').last;
  ok(noModel.kind === 'drafts' && noModel.text.indexOf('ยังไม่มีโมเดล') >= 0, 'draft without a model says so: ' + noModel.text);
  const DRAFT_Q = 'ถามร่างได้xyz';
  const SKIP_Q = 'ถามร่างไม่ได้xyz';
  say(DRAFT_Q); say(DRAFT_Q); say(SKIP_Q);
  const asked = [];
  w.chat.drafter = q => { asked.push(q); return Promise.resolve(q === DRAFT_Q ? 'คำตอบที่ร่างขึ้น' : null); };
  await w.chat.handle('ร่างคำตอบ');
  await new Promise(r => setTimeout(r, 20));
  const cand = w.store.candidates.find(c => c.q === DRAFT_Q);
  ok(asked.indexOf(DRAFT_Q) >= 0 && asked.indexOf(SKIP_Q) >= 0, 'drafter was asked about each gap');
  ok(cand && cand.src === 'llm' && cand.trust === 'low', 'draft lands in the confirm tray as an llm candidate');
  ok(!w.store.candidates.some(c => c.q === SKIP_Q), 'uncertain draft (null) is not queued');
  ok(w.store.find(DRAFT_Q) === null, 'draft does not enter knowledge before confirmation');
  const lastDraft = w.out.filter(o => o.kind === 'drafts').pop() || {};
  ok(lastDraft.text.indexOf('ร่างไว้ 1 ข้อ') >= 0, 'draft reply counts queued drafts: ' + lastDraft.text);
  const id = w.N.WebCand.list(w.store).find(c => c.q === DRAFT_Q).id;
  const conf = w.N.WebCand.confirm(w.store, id);
  ok(conf.status === 'new' && w.store.find(DRAFT_Q), 'confirming a draft teaches it: ' + conf.status);

  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL: crashed: ' + e.stack); process.exit(1); });
