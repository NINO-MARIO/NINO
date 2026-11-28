/* มิ้ม | เทสต์ความกว้างของการคุย (ไม่ใช้เครือข่าย)
 * รัน: node mim/tests/breadth-test.js
 * วัดการคุยหลายเรื่องในรอบเดียว: ทักทาย/ความรู้สึก/เวลา/ตัวมิ้มเอง (ต้องตอบ), ความรู้ที่สอนไว้ (ตอบถูก),
 * เรื่องที่ไม่รู้ (ต้องไม่ตอบเดา), การสร้างคำ, การสอนแล้วตอบ, การโหลดแหล่งแล้วตอบ
 * ตัวเลขที่รายงานคือจำนวนข้อที่ผ่านจริง ไม่ใช่คะแนนความฉลาด
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
  'engine/39-learn.js', 'engine/47-compose.js', 'engine/48-selfstudy.js', 'engine/49-sources.js', 'engine/54-webcand.js',
  'engine/52-coin.js', 'engine/53-skills.js', 'engine/50-chat.js', 'engine/34-aliases.js', 'data/aliases-th.js', 'data/sources-th.js', 'data/pack-th.js'
];
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
  const chat = new N.ChatNode('chat', bus, store, thinker);
  return { N, store, thinker, chat, ls };
}
function say(h, text) {
  const out = [];
  h.chat.reply = (kind, t, meta) => out.push({ kind, text: t, meta: meta || '' });
  h.chat.handle(text);
  return out[out.length - 1] || { kind: 'none', text: '', meta: '' };
}
// ทักษะกฎตายตัว (53-skills) ตอบจริงเช่นกัน จึงนับเป็นคำตอบ; ผิดถ้ากฎตอบในข้อที่ควรไม่เดา
const SKILL_KINDS = ['math', 'date', 'antonym', 'feel', 'insult', 'praise', 'nadia', 'story', 'crisis'];
const ANSWERED = r => r.kind === 'answer' || SKILL_KINDS.includes(r.kind);
const ABSTAIN = r => !ANSWERED(r);

const ls = memStorage();
const h = build(ls);
const groups = {};
const results = [];
function item(group, name, fn) {
  let ok = false, detail = '';
  try { fn(); ok = true; } catch (e) { detail = String(e.message || e).split('\n')[0]; }
  (groups[group] = groups[group] || { ok: 0, n: 0 }).n++;
  if (ok) groups[group].ok++;
  results.push({ group, name, ok, detail });
}

// 1) ทักทาย ความรู้สึก เวลา ตัวมิ้มเอง: ต้องตอบเสมอ (ไม่ต้องรู้ข้อเท็จจริง)
item('คุยทั่วไป', 'ทักทาย', () => assert.ok(ANSWERED(say(h, 'สวัสดี'))));
item('คุยทั่วไป', 'ขอบคุณ', () => assert.ok(ANSWERED(say(h, 'ขอบคุณนะ'))));
item('คุยทั่วไป', 'ลาก่อน', () => assert.ok(ANSWERED(say(h, 'ราตรีสวัสดิ์'))));
item('คุยทั่วไป', 'เหนื่อย', () => assert.ok(ANSWERED(say(h, 'เหนื่อยจังเลย'))));
item('คุยทั่วไป', 'ดีใจ', () => assert.ok(ANSWERED(say(h, 'ดีใจมาก'))));
item('คุยทั่วไป', 'เศร้า', () => assert.ok(ANSWERED(say(h, 'เศร้าจัง'))));
item('คุยทั่วไป', 'ถามวันที่', () => assert.ok(/พ\.ศ\./.test(say(h, 'วันนี้วันอะไร').text)));
item('คุยทั่วไป', 'ถามเวลา', () => assert.ok(/น\./.test(say(h, 'ตอนนี้กี่โมง').text)));
item('คุยทั่วไป', 'ถามชื่อมิ้ม', () => assert.ok(/มิ้ม/.test(say(h, 'มิ้มเป็นใคร').text)));
item('คุยทั่วไป', 'ถามความชอบมิ้ม', () => assert.ok(ANSWERED(say(h, 'มิ้มชอบอะไร'))));
item('คุยทั่วไป', 'ถามความสามารถ', () => assert.ok(ANSWERED(say(h, 'ทำอะไรได้บ้าง'))));

// 2) ความรู้ที่มีอยู่แล้ว: ต้องตอบถูกเรื่อง
item('ความรู้', 'น้ำเดือด', () => assert.ok(/100/.test(say(h, 'น้ำเดือดที่กี่องศา').text)));
item('ความรู้', 'ดาวฤกษ์', () => assert.ok(/ดาวฤกษ์/.test(say(h, 'ดวงอาทิตย์เป็นดาวอะไร').text)));
item('ความรู้', 'ท้องฟ้าสีฟ้า', () => assert.ok(/กระเจิง/.test(say(h, 'ทำไมท้องฟ้าสีฟ้า').text)));
item('ความรู้', 'ผัดไทยไม่ตอบเมืองหลวง', () => {
  const r = say(h, 'ผัดไทยคืออะไร');
  assert.ok(ANSWERED(r) && /ผัดไทย/.test(r.text) && !/กรุงเทพ/.test(r.text), r.text);
});

// 3) เรื่องที่ไม่รู้: ต้องไม่ตอบเดา (ให้สอนหรือบอกว่าไม่รู้)
item('ไม่รู้แล้วไม่เดา', 'เมืองหลวงญี่ปุ่น', () => assert.ok(ABSTAIN(say(h, 'เมืองหลวงของญี่ปุ่นคืออะไร'))));
item('ไม่รู้แล้วไม่เดา', 'สงกรานต์', () => assert.ok(ABSTAIN(say(h, 'วันสงกรานต์คือวันไหน'))));
item('ไม่รู้แล้วไม่เดา', 'แมวกินอะไร', () => assert.ok(ABSTAIN(say(h, 'แมวกินอะไร'))));
item('ไม่รู้แล้วไม่เดา', 'ฝนตกทำไง', () => assert.ok(ABSTAIN(say(h, 'ฝนตกทำไง'))));

// 4) สร้างคำ
item('สร้างคำ', 'เสนอคำจากราก', () => {
  say(h, 'สอน ดนตรี | ศิลปะที่ใช้เสียงเรียบเรียงเป็นทำนองค่ะ');
  const r = say(h, 'เสนอคำ ดนตรี');
  assert.ok(ANSWERED(r) && r.text.includes('นักดนตรี') && r.text.includes('ยังไม่ได้ยืนยัน'), r.text);
});
item('สร้างคำ', 'บอกวิธีเมื่อไม่ระบุราก', () => assert.ok(/เสนอคำ/.test(say(h, 'สร้างคำใหม่').text)));

// 5) สอนแล้วตอบได้ทันที (ไม่ต้องรอ)
item('เรียนรู้', 'สอนแล้วตอบ', () => {
  say(h, 'สอน แมวกินอะไร | แมวกินเนื้อสัตว์เป็นอาหารหลักค่ะ');
  assert.ok(/เนื้อสัตว์/.test(say(h, 'แมวกินอะไร').text));
});

// 6) โหลดแหล่งแล้วตอบได้ พร้อมอ้างที่มา
item('เรียนรู้', 'โหลดแหล่งแล้วตอบพร้อมที่มา', () => {
  say(h, 'โหลดแหล่ง thaipbs-durian');
  const r = say(h, 'ทุเรียนปลูกที่ไหน');
  assert.ok(ANSWERED(r) && /แหล่ง/.test(r.meta), 'kind=' + r.kind + ' meta=' + r.meta + ' text=' + r.text.slice(0, 60));
});

// รายงาน
let total = 0, pass = 0;
for (const g of Object.keys(groups)) { total += groups[g].n; pass += groups[g].ok; }
for (const r of results) console.log((r.ok ? 'ok  ' : 'FAIL ') + '[' + r.group + '] ' + r.name + (r.ok ? '' : ' -> ' + r.detail));
console.log('');
for (const g of Object.keys(groups)) console.log(g + ': ' + groups[g].ok + ' / ' + groups[g].n);
console.log('รวม: ' + pass + ' / ' + total);
process.exitCode = 0;
