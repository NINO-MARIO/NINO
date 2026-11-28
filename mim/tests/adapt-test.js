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

// ทดสอบการสำรวจคำตอบและการเรียนรู้จากผลตอบรับ (Thompson sampling ต่อรายการความรู้)
// ตรวจ: (1) ยังไม่มีผลตอบรับ ทางเลือกถูกสุ่มน้อย (2) ผลตอบรับทำให้เลือกคำตอบที่ดีกว่า (3) คำถามที่ตรงตัวไม่เปลี่ยน
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
function seeded(seed) { let x = seed >>> 0; return () => { x = (x * 1103515245 + 12345) >>> 0; return x / 4294967296; }; }
const GOOD = 'ต้มไก่ก่อนค่ะ';        // ทำข้าวมันไก่ยังไง (คำตอบแรก)
const ALT = 'หุงข้าวด้วยน้ำซุปค่ะ';   // วิธีทำข้าวมันไก่ (ทางเลือก)
const Q = 'ข้าวมันไก่ทำยังไงดี';      // คำถามที่ไม่ตรงตัว ได้ทั้งสองคำตอบเป็นผู้สมัคร

// (1) ยังไม่มีผลตอบรับเลย: ตอบแบบเดิมทุกครั้ง (ไม่สำรวจ) และหลังมีผลตอบรับ ทางเลือกเริ่มออกบ้างแต่น้อย
{
  const h = build();
  h.store.teach('ทำข้าวมันไก่ยังไง', GOOD);
  h.store.teach('วิธีทำข้าวมันไก่', ALT);
  let alt = 0;
  for (let i = 0; i < 200; i++) {
    h.thinker.rng = seeded(1000 + i);
    const r = think(h, Q);
    if (r.entry && r.entry.a === ALT) alt++;
  }
  ok(alt === 0, 'ยังไม่มีผลตอบรับ ต้องตอบแบบเดิมทุกครั้ง: ' + alt + '/200');
  h.thinker.reward(h.store.find('ทำข้าวมันไก่ยังไง'), true);
  let alt2 = 0;
  for (let i = 0; i < 200; i++) {
    h.thinker.rng = seeded(2000 + i);
    const r = think(h, Q);
    if (r.entry && r.entry.a === ALT) alt2++;
  }
  ok(alt2 > 0 && alt2 < 60, 'หลังมีผลตอบรับ ทางเลือกควรออกบ้างแต่น้อย (ไม่ตายตัว): ' + alt2 + '/200');
}

// (2) ผลตอบรับ: คำตอบแรกผิดสม่ำเสมอ คำตอบทางเลือกถูก ต้องค่อย ๆ เลือกทางเลือกบ่อยขึ้น
{
  const h = build();
  h.store.teach('ทำข้าวมันไก่ยังไง', GOOD);
  h.store.teach('วิธีทำข้าวมันไก่', ALT);
  const picks = [];
  for (let i = 0; i < 160; i++) {
    h.thinker.rng = seeded(5000 + i);
    const r = think(h, Q);
    picks.push(r.entry && r.entry.a === ALT);
    if (r.entry) h.thinker.reward(r.entry, r.entry.a === ALT); // ผู้ใช้ตอบรับเมื่อเป็นทางเลือก และแก้เมื่อเป็นคำแรก
  }
  const late = picks.slice(-40).filter(Boolean).length;
  ok(late >= 32, 'หลังเรียนรู้ 120 รอบ ควรเลือกคำตอบที่ถูกอย่างน้อย 80%: ' + late + '/40');
  ok(picks.slice(0, 40).filter(Boolean).length < late + 10, 'ช่วงต้นยังไม่ค่อยเลือกทางเลือก');
}

// (3) คำถามที่ตรงตัวกับความรู้ที่สอนไว้ ต้องได้คำตอบเดิมเสมอ แม้มีทางเลือกและผลตอบรับ
{
  const h = build();
  h.store.teach('ทำข้าวมันไก่ยังไง', GOOD);
  h.store.teach('วิธีทำข้าวมันไก่', ALT);
  for (let i = 0; i < 30; i++) h.thinker.reward(h.store.find('วิธีทำข้าวมันไก่'), true);
  let changed = 0;
  for (let i = 0; i < 50; i++) {
    h.thinker.rng = seeded(9000 + i);
    const r = think(h, 'ทำข้าวมันไก่ยังไง');
    if (r.entry.a !== GOOD) changed++;
  }
  ok(changed === 0, 'คำถามตรงตัวต้องได้คำตอบเดิมเสมอ: เปลี่ยน ' + changed + '/50');
}

console.log('adapt: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
