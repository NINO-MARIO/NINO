/* มิ้ม | วัดการจำหัวข้อในบทสนทนาหลายรอบ (คำชี้กลับ) ทั้งตอบถูกและไม่ตอบผิดเมื่อไม่มีเรื่องที่เกี่ยวข้อง
 * รัน: node mim/tests/followup-eval.js  (ไม่ใช้เครือข่าย)
 */
'use strict';
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

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

function build() {
  const ls = memStorage();
  const sb = { console, localStorage: ls, setTimeout, clearTimeout, Date };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  // สุ่มของเครื่องยนต์ (อยู่ในบริบท vm ที่มี Math ของตัวเอง) กำหนดเมล็ดไว้ เพื่อให้ผลวัดซ้ำได้
  vm.runInContext('(function(){var s=7;Math.random=function(){s=(s*1664525+1013904223)>>>0;return s/4294967296;};})()', sb);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  const N = sb.NINO;
  const store = new N.KnowledgeStore(ls).load();
  if (store.ensureSeed(N.SEED_KNOWLEDGE)) store.save();
  N.Learn.ensurePack(store, sb.NINO_PACK_TH);
  const bus = new N.Bus();
  const graph = new N.Graph();
  const retrieval = graph.add(new N.RetrievalNode('retrieval', bus, store));
  const language = graph.add(new N.LanguageNode('language', bus, store));
  const thinker = new N.ThinkNode('thinker', bus, store, retrieval, language);
  thinker.getGraph();
  return { N, store, thinker };
}

function think(h, text) {
  const gen = h.thinker.think(text);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}


function think(h, text) {
  const gen = h.thinker.think(text);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}
// เคสบวก: คำชี้กลับต้องได้คำตอบที่มีคำเฉลย   เคสลบ: ต้องไม่ตอบด้วยคำที่ผิด (ถามกลับ หรือบอกว่าไม่มีข้อมูลได้)
const CASES = [
  { id: 'ข้าวมันไก่ -> เรื่องล่าสุดไม่มีคำตอบ', teach: [['ข้าวมันไก่กินกับอะไร', 'กินคู่กับน้ำจิ้มและแตงกวาค่ะ'], ['ทุเรียนมีรสชาติยังไง', 'หวานมันค่ะ']], ask: ['ข้าวมันไก่กินกับอะไร', 'ทุเรียนมีรสชาติยังไง'], follow: 'แล้วอันนั้นกินกับอะไร', expect: 'น้ำจิ้ม', bad: 'หวานมัน' },
  { id: 'ปลาทู -> เรื่องล่าสุดไม่มีคำตอบ', teach: [['ปลาทูกินกับอะไร', 'กินคู่กับน้ำพริกค่ะ'], ['มะม่วงมีรสชาติยังไง', 'เปรี้ยวหวานค่ะ']], ask: ['ปลาทูกินกับอะไร', 'มะม่วงมีรสชาติยังไง'], follow: 'อันนั้นกินกับอะไร', expect: 'น้ำพริก', bad: 'เปรี้ยวหวาน' },
  { id: 'เรื่องล่าสุดตอบได้ ต้องไม่ดึงเรื่องเก่า', teach: [['ข้าวมันไก่กินกับอะไร', 'กินคู่กับน้ำจิ้มค่ะ'], ['ข้าวมันไก่มีรสชาติยังไง', 'มันและหอมค่ะ']], ask: ['ข้าวมันไก่กินกับอะไร', 'ข้าวมันไก่มีรสชาติยังไง'], follow: 'แล้วอันนั้นมีรสชาติยังไง', expect: 'มันและหอม', bad: 'น้ำจิ้ม' },
  { id: 'ไม่มีเรื่องเกี่ยวข้อง -> ต้องไม่ตอบด้วยเรื่องเดิม', teach: [['ข้าวมันไก่กินกับอะไร', 'กินคู่กับน้ำจิ้มค่ะ']], ask: ['ข้าวมันไก่กินกับอะไร'], follow: 'แล้วอันนั้นราคาเท่าไร', expect: null, bad: 'น้ำจิ้ม' },
  { id: 'คำชี้กลับหลังคุยสามเรื่อง ตอบเรื่องที่ถามถึง', teach: [['ข้าวมันไก่กินกับอะไร', 'กินคู่กับน้ำจิ้มค่ะ'], ['ปลาทูกินกับอะไร', 'กินคู่กับน้ำพริกค่ะ'], ['มะม่วงมีรสชาติยังไง', 'เปรี้ยวหวานค่ะ']], ask: ['ข้าวมันไก่กินกับอะไร', 'ปลาทูกินกับอะไร', 'มะม่วงมีรสชาติยังไง'], follow: 'แล้วอันนั้นกินกับอะไร', expect: 'น้ำพริก', bad: 'เปรี้ยวหวาน' },
  { id: 'คำชี้กลับ "ส่วนนั้น"', teach: [['ข้าวมันไก่กินกับอะไร', 'กินคู่กับน้ำจิ้มค่ะ'], ['ทุเรียนมีรสชาติยังไง', 'หวานมันค่ะ']], ask: ['ข้าวมันไก่กินกับอะไร', 'ทุเรียนมีรสชาติยังไง'], follow: 'ส่วนนั้นกินกับอะไร', expect: 'น้ำจิ้ม', bad: 'หวานมัน' },
  { id: 'คำชี้กลับ "ตัวนั้น"', teach: [['ข้าวมันไก่กินกับอะไร', 'กินคู่กับน้ำจิ้มค่ะ'], ['ทุเรียนมีรสชาติยังไง', 'หวานมันค่ะ']], ask: ['ข้าวมันไก่กินกับอะไร', 'ทุเรียนมีรสชาติยังไง'], follow: 'ตัวนั้นกินกับอะไร', expect: 'น้ำจิ้ม', bad: 'หวานมัน' },
  { id: 'คำอ้างถึง "ที่พูดเมื่อกี้"', teach: [['ข้าวมันไก่กินกับอะไร', 'กินคู่กับน้ำจิ้มค่ะ'], ['ทุเรียนมีรสชาติยังไง', 'หวานมันค่ะ']], ask: ['ข้าวมันไก่กินกับอะไร', 'ทุเรียนมีรสชาติยังไง'], follow: 'ที่พูดเมื่อกี้กินกับอะไร', expect: 'น้ำจิ้ม', bad: 'หวานมัน' },
  { id: 'ตัวแทนที่ไม่ชัด "มัน" ไม่ดึงเรื่องผิด', teach: [['ข้าวมันไก่กินกับอะไร', 'กินคู่กับน้ำจิ้มค่ะ'], ['ทุเรียนมีรสชาติยังไง', 'หวานมันค่ะ']], ask: ['ข้าวมันไก่กินกับอะไร', 'ทุเรียนมีรสชาติยังไง'], follow: 'แล้วมันกินกับอะไร', expect: 'น้ำจิ้ม', bad: 'หวานมัน' },
  { id: 'ถามเรื่องอื่นคั่นกลาง แล้วกลับมาชี้', teach: [['ข้าวมันไก่กินกับอะไร', 'กินคู่กับน้ำจิ้มค่ะ']], ask: ['ข้าวมันไก่กินกับอะไร', 'ฮ่องกงอยู่ตรงไหน'], follow: 'แล้วอันนั้นกินกับอะไร', expect: 'น้ำจิ้ม', bad: 'ฮ่องกง' },
];

// ชุดสุ่มแบบเป็นระบบ: หัวข้อเก่า/ใหม่ทุกคู่ (30 คู่) ใช้คำอ้างอิงหมุนเวียน 6 แบบ และเคสลบ 10 เคส
const TOPICS = ['ข้าวมันไก่', 'ปลาทู', 'มะม่วง', 'ก๋วยเตี๋ยว', 'ทุเรียน', 'ส้มตำ'];
const REFS = ['อันนั้น', 'ส่วนนั้น', 'ตัวนั้น', 'ที่พูดเมื่อกี้', 'มัน', 'เรื่องนั้น'];
const ansOld = t => 'เรื่อง' + t + 'ตอบว่ากินคู่กับน้ำพริกและผักค่ะ';
const ansNew = t => 'เรื่อง' + t + 'มีรสชาติหวานมันค่ะ';
function genCases() {
  const out = [];
  let k = 0;
  for (const a of TOPICS) for (const b of TOPICS) {
    if (a === b) continue;
    const ref = REFS[k++ % REFS.length];
    out.push({ id: 'สุ่ม ' + a + ' -> ' + b + ' (' + ref + ')', teach: [[a + 'กินกับอะไร', ansOld(a)], [b + 'มีรสชาติยังไง', ansNew(b)]], ask: [a + 'กินกับอะไร', b + 'มีรสชาติยังไง'], follow: 'แล้ว' + ref + 'กินกับอะไร', expect: ansOld(a), bad: ansNew(b) });
  }
  for (let i = 0; i < 10; i++) {
    const a = TOPICS[i % TOPICS.length];
    out.push({ id: 'ลบ ' + a + ' (ไม่เกี่ยว ' + i + ')', teach: [[a + 'กินกับอะไร', ansOld(a)]], ask: [a + 'กินกับอะไร'], follow: 'แล้วอันนั้นราคาเท่าไร', expect: null, bad: ansOld(a) });
  }
  return out;
}
CASES.push(...genCases());

// ชุดทดสอบซ้อน (ไม่ได้ใช้ตอนปรับแต่ง): หัวข้อใหม่ คำถามใหม่ และรูปประโยคต่างจากชุดสุ่ม
const TOPICS2 = ['ลูกชิ้น', 'ขนมจีน', 'กล้วยทอด', 'แกงเขียวหวาน'];
const REFS2 = ['อันนั้น', 'ส่วนนั้น', 'เรื่องนั้น', 'ที่พูดเมื่อกี้', 'นั่น', 'ตัวนั้น'];
const a2 = t => 'สูตรของ' + t + 'ใช้วัตถุดิบหลักค่ะ';
const b2 = t => 'วิธีทำ' + t + 'ต้องตั้งไฟให้พอดีค่ะ';
const HELD = [];
{
  let k = 0;
  for (const a of TOPICS2) for (const b of TOPICS2) {
    if (a === b) continue;
    const ref = REFS2[k++ % REFS2.length];
    const noLead = k % 2 === 0; // สลับรูปประโยค: มีหรือไม่มี "แล้ว" นำหน้า
    HELD.push({ id: 'ซ้อน ' + a + ' -> ' + b + ' (' + ref + ')', teach: [[a + 'ใส่อะไรบ้าง', a2(a)], [b + 'ทำยังไง', b2(b)]], ask: [a + 'ใส่อะไรบ้าง', b + 'ทำยังไง'], follow: (noLead ? '' : 'แล้ว') + ref + 'ใส่อะไรบ้าง', expect: a2(a), bad: b2(b) });
  }
}
CASES.push(...HELD);
let pos = 0, posOk = 0, neg = 0, negOk = 0, falseAns = 0;
const rows = [];
for (const c of CASES) {
  const h = build();
  for (const [q, a] of c.teach) h.store.teach(q, a);
  for (const q of c.ask) think(h, q);
  const r = think(h, c.follow);
  const text = r.text || '';
  const hit = c.expect ? text.includes(c.expect) : false;
  const wrong = text.includes(c.bad);
  if (c.expect) { pos++; if (hit && !wrong) posOk++; }
  else { neg++; if (!wrong) negOk++; }
  if (wrong) falseAns++;
  rows.push((c.expect ? (hit && !wrong ? 'PASS' : 'FAIL') : (wrong ? 'FAIL' : 'PASS')) + '  ' + c.id + ' -> ' + r.kind + ': ' + text.slice(0, 80));
}
rows.filter(r => r.startsWith('FAIL')).forEach(r => console.log(r));
console.log('\nตอบถูก ' + posOk + '/' + pos + '   ไม่ตอบผิดในเคสลบ ' + negOk + '/' + neg + '   ตอบผิดรวม ' + falseAns);
process.exit(posOk === pos && negOk === neg ? 0 : 1);
