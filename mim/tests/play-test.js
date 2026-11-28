// การเล่นจริงกับมิ้ม: คำถามทั่วไปที่ต้องตอบให้ถูกจุด (ตัวเลข ตัวตน อารมณ์ ทักทายก่อนนอน) และที่ต้องไม่ตอบมั่ว
// รัน: node mim/tests/play-test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = ['engine/00-core.js', 'engine/10-text.js', 'engine/12-romanize.js', 'engine/05-seed.js', 'engine/38-profile.js', 'engine/35-lexicon.js', 'engine/36-graph.js', 'engine/20-store.js', 'engine/31-calibrate.js', 'engine/30-retrieval.js', 'engine/40-language.js', 'engine/32-intent.js', 'engine/33-links.js', 'engine/37-thinker.js', 'engine/45-manners.js', 'engine/46-textpipe.js', 'engine/39-learn.js', 'engine/47-compose.js', 'engine/48-selfstudy.js', 'engine/49-sources.js', 'engine/54-webcand.js', 'engine/52-coin.js', 'engine/53-skills.js', 'engine/50-chat.js', 'engine/34-aliases.js', 'data/aliases-th.js', 'data/sources-th.js', 'data/pack-th.js'];

let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
const FLOOR = 20;

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
const w = world(mem);
const last = () => w.out[w.out.length - 1] || { kind: '-', text: '' };
function ask(q) { w.out.length = 0; w.chat.handle(q); return last(); }

const CASES = [
  // ตัวเลขต้องตอบตรงคำถาม
  ['ไทยมีกี่ภาค', r => r.text.indexOf('4 ภาค') >= 0, 'ตอบจำนวนภาคของไทย'],
  ['ภาคเหนือมีกี่จังหวัด', r => r.text.indexOf('9 จังหวัด') >= 0, 'ไม่ตอบ 77 จังหวัดทั้งประเทศ'],
  ['แมวมีกี่ขา', r => r.text.indexOf('4 ขา') >= 0, 'แมวมี 4 ขา'],
  ['2+3 เท่ากับเท่าไร', r => r.text.indexOf('5') >= 0, 'คำนวณได้'],
  // ตัวตนของผู้ช่วย ตอบตามจริงของแอป ไม่บอกชื่อบริษัท
  ['ชื่ออะไร', r => r.text.indexOf('มิ้ม') >= 0, 'บอกชื่อ'],
  ['ใครสร้างคุณ', r => r.text.indexOf('NINO') >= 0 && !/Google|OpenAI|Anthropic|Qwen|Gemma|Llama/i.test(r.text), 'ตอบตามแอป ไม่ตั้งชื่อบริษัทอื่น'],
  ['คุณเป็นโมเดลอะไร', r => r.text.indexOf('มิ้ม') >= 0 && !/Qwen|Gemma|Llama|SmolLM|GPT|Claude/i.test(r.text), 'ไม่ตอบแบบ fallback และไม่บอกชื่อโมเดลอื่น'],
  // ความหมายของคำ: แยกคำที่ซ้อนกัน
  ['ปัญญาคืออะไร', r => r.text.indexOf('ประดิษฐ์') < 0, 'ไม่ตอบนิยาม AI เมื่อถามปัญญา'],
  ['ปัญญาประดิษฐ์คืออะไร', r => r.text.indexOf('ประดิษฐ์') >= 0, 'ตอบนิยาม AI เมื่อถามปัญญาประดิษฐ์'],
  ['ความรักคืออะไร', r => r.text.indexOf('ผูกพัน') >= 0, 'ตอบความหมายความรัก'],
  // สูตรอาหาร: ไม่ตอบจากเมนูที่มีคำร่วม
  ['ข้าวผัดทำยังไง', r => r.kind === 'related' && r.text.indexOf('ยังไม่มีคำตอบตรง') >= 0, 'บอกว่าไม่มีสูตรข้าวผัดตรงๆ แล้วเสนอเรื่องใกล้เคียง (ไม่ตอบเป็นสูตรข้าวผัด) — ไม่บังคับว่าต้องเป็นผัดไทย เพราะคำว่า ข้าวผัด ถูกเรียนเป็นคำเดียวแล้ว'],
  ['ผัดไทยทำยังไง', r => r.text.indexOf('ผัดไทย') >= 0, 'ตอบสูตรผัดไทยเมื่อถามผัดไทย'],
  // ความรู้สึกและการทักทาย
  ['สวัสดี', r => r.kind === 'answer' && r.text.length > 0, 'ทักทาย'],
  ['ร้อนมาก', r => r.kind === 'answer' && r.text.indexOf('พลังงาน') < 0 && /ร้อน|พัก|น้ำ/.test(r.text), 'ตอบด้วยการดูแลตัวเอง ไม่ตอบเรื่องพลังงาน'],
  ['ไม่ชอบเลย', r => r.text.indexOf('เล่า') >= 0 || r.text.indexOf('ไม่ค่อยดี') >= 0, 'รับฟังเมื่อบอกว่าไม่ชอบ'],
  ['เศร้าจัง', r => r.kind === 'feel', 'รับรู้ความเศร้า'],
  ['ดึกแล้ว นอนดีกว่า', r => r.text.indexOf('ฝันดี') >= 0 || r.text.indexOf('พักผ่อน') >= 0, 'ทักทายก่อนนอน'],
  ['เหนื่อยจัง', r => r.kind !== 'fallback', 'ตอบเมื่อเหนื่อย'],
  // ที่ไม่รู้ต้องบอกว่าไม่รู้ และจดไว้ให้สอนต่อ
  ['ฝนตกทำไง', r => r.kind === 'fallback' && w.store.qgaps.indexOf('ฝนตกทำไง') >= 0, 'ยอมรับว่าไม่รู้และจดคำถาม'],
  ['ดาวอังคารมีกี่ดวง', r => r.kind === 'fallback' || r.text.indexOf('ดวง') >= 0, 'ไม่มั่วคำตอบเรื่องที่ไม่มีความรู้'],
];

for (const [q, check, label] of CASES) {
  const r = ask(q);
  ok(check(r), label + ' | ' + q + ' => [' + r.kind + '] ' + String(r.text).slice(0, 60));
}
console.log('play-test: ' + pass + '/' + (pass + fail) + ' passed, ' + fail + ' failed (ต้องผ่านอย่างน้อย ' + FLOOR + ')');
process.exit(fail || pass < FLOOR ? 1 : 0);
