/* มิ้ม | ประเมินคุณภาพการค้นคำตอบ (ไม่ใช่เกตบังคับ: รายงานตัวเลข)
 * รัน: node mim/tests/eval-retrieval.js
 *
 * ชุดข้อมูล:
 *   - ความรู้ = ชุด pack-th เท่านั้น (สอนเข้าคลังตรงๆ ไม่ผ่านการเติมจากชุดเริ่มต้น)
 *   - DEV  ใช้ปรับจูนการค้นได้
 *   - HELD ห้ามใช้ปรับจูน ดูเฉพาะตอนจบงานเพื่อวัดการทั่วไป
 *   - NEG  คำถามที่ไม่มีคำตอบในคลัง ต้องไม่ตอบด้วยคำตอบของเรื่องอื่น
 *
 * ตัววัด (แยกสองชั้น):
 *   retrieval = RetrievalNode.match เพียงอย่างเดียว (ชั้นค้นคำตอบ)
 *   pipeline  = ผู้คิดทั้งหมดตามท่อจริง (รวมกฎการไม่เดา)
 *   ถูก = ตอบด้วยคำตอบของคำถามนั้นเอง, ผิด = ตอบด้วยคำตอบของเรื่องอื่น, พลาด = ไม่ตอบ/ขอให้สอน,
 *   เรียบเรียง = ตอบด้วยประโยคที่เรียบเรียงใหม่ (ติดป้ายทดลอง ไม่นับว่าถูกหรือผิดโดยตรง)
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

// ----- ชุดทดสอบ: คู่ [คำถามถอดความ, คำถามเดิมในคลัง] -----
// DEV: ใช้ระหว่างปรับจูน
const DEV = [
  ['ไทยมีจังหวัดทั้งหมดกี่จังหวัด', 'ประเทศไทยมีกี่จังหวัด'],
  ['เมืองหลวงไทยชื่ออะไร', 'เมืองหลวงของไทยคืออะไร'],
  ['ดอยไหนสูงสุดในไทย', 'ภูเขาที่สูงที่สุดในประเทศไทยคืออะไร'],
  ['น้ำเดือดอุณหภูมิเท่าไหร่', 'น้ำเดือดที่กี่องศา'],
  ['น้ำแข็งละลายกี่องศา', 'น้ำแข็งละลายที่กี่องศา'],
  ['หนึ่งสัปดาห์กี่วัน', 'หนึ่งสัปดาห์มีกี่วัน'],
  ['ปีหนึ่งมีกี่เดือน', 'หนึ่งปีมีกี่เดือน'],
  ['หัวใจคนมีกี่ห้อง', 'หัวใจมนุษย์มีกี่ห้อง'],
  ['ผู้ใหญ่นอนกี่ชั่วโมงดี', 'ผู้ใหญ่ควรนอนวันละกี่ชั่วโมง'],
  ['ดาวเคราะห์ดวงที่ใหญ่ที่สุดคือดวงไหน', 'ดาวเคราะห์ที่ใหญ่ที่สุดในระบบสุริยะคืออะไร'],
  ['ดาวใกล้ดวงอาทิตย์มากที่สุดคืออะไร', 'ดาวเคราะห์ที่อยู่ใกล้ดวงอาทิตย์ที่สุดคืออะไร'],
  ['โลกมีดวงจันทร์กี่ใบ', 'โลกมีดวงจันทร์กี่ดวง'],
  ['ทำไมฟ้าถึงสีฟ้า', 'ทำไมท้องฟ้าถึงเป็นสีฟ้า'],
  ['รุ้งเกิดจากอะไร', 'รุ้งกินน้ำเกิดจากอะไร'],
  ['มิ้มคืออะไรเหรอ', 'มิ้มคืออะไร'],
  ['มิ้มทำงานยังไง', 'มิ้มทำงานอย่างไร'],
  ['อินเทอร์เน็ตคืออะไรอ่ะ', 'อินเทอร์เน็ตคืออะไร'],
  ['CSS เอาไว้ทำอะไร', 'CSS ใช้ทำอะไร'],
  ['JavaScript เอาไว้ทำอะไร', 'JavaScript ใช้ทำอะไร'],
  ['วันสงกรานต์ตรงวันไหน', 'สงกรานต์ตรงกับวันที่เท่าไร'],
  ['วันลอยกระทงคือวันไหน', 'วันลอยกระทงตรงกับวันไหน'],
  ['ผัดไทยใส่อะไรบ้าง', 'ผัดไทยมีส่วนผสมหลักอะไร'],
  ['ต้มยำรสชาติยังไง', 'ต้มยำมีรสชาติอย่างไร'],
  ['ข้าวหอมมะลิปลูกที่ไหนเยอะ', 'ข้าวหอมมะลิปลูกมากในภาคไหน'],
  ['ดวงอาทิตย์เป็นดาวอะไร', 'ดวงอาทิตย์เป็นดาวประเภทไหน'],
  ['ไฟกระแสตรงต่างกับสลับยังไง', 'ไฟฟ้ากระแสตรงกับกระแสสลับต่างกันอย่างไร'],
  ['พืชต้องการอะไรในการสังเคราะห์แสง', 'พืชสังเคราะห์แสงต้องการอะไรบ้าง'],
  ['ลดโลกร้อนทำยังไง', 'ลดโลกร้อนทำได้อย่างไร'],
  ['วัดพระแก้วอยู่ตรงไหน', 'วัดพระแก้วอยู่ที่ไหน'],
  ['ภาษาเหนือเรียกว่าอะไร', 'ภาษาถิ่นทางเหนือเรียกว่าอะไร'],
  ['ดวงจันทร์เปล่งแสงเองได้มั้ย', 'ดวงจันทร์ส่องแสงเองได้ไหม']
];

// HELD: เขียนไว้ก่อนดูผล ห้ามปรับจูนตามชุดนี้
const HELD = [
  ['จังหวัดในประเทศไทยมีทั้งหมดเท่าไหร่', 'ประเทศไทยมีกี่จังหวัด'],
  ['ยอดเขาที่สูงที่สุดของไทยอยู่ที่ไหน', 'ภูเขาที่สูงที่สุดในประเทศไทยคืออะไร'],
  ['จุดเดือดของน้ำคือเท่าไร', 'น้ำเดือดที่กี่องศา'],
  ['น้ำแข็งเริ่มละลายที่อุณหภูมิเท่าไร', 'น้ำแข็งละลายที่กี่องศา'],
  ['ใน 1 สัปดาห์มีวันทั้งหมดกี่วัน', 'หนึ่งสัปดาห์มีกี่วัน'],
  ['หนึ่งปีนับได้กี่เดือน', 'หนึ่งปีมีกี่เดือน'],
  ['หัวใจของคนเรามีกี่ห้องกันนะ', 'หัวใจมนุษย์มีกี่ห้อง'],
  ['ผู้ใหญ่ควรนอนกี่ชั่วโมงต่อวัน', 'ผู้ใหญ่ควรนอนวันละกี่ชั่วโมง'],
  ['ดาวที่อยู่ใกล้ดวงอาทิตย์ที่สุดชื่ออะไร', 'ดาวเคราะห์ที่อยู่ใกล้ดวงอาทิตย์ที่สุดคืออะไร'],
  ['สาเหตุที่ท้องฟ้าเป็นสีฟ้าคืออะไร', 'ทำไมท้องฟ้าถึงเป็นสีฟ้า'],
  ['รุ้งกินน้ำเป็นเพราะอะไร', 'รุ้งกินน้ำเกิดจากอะไร'],
  ['อินเทอร์เน็ตหมายถึงอะไร', 'อินเทอร์เน็ตคืออะไร'],
  ['HTML ย่อมาจากคำว่าอะไร', 'HTML ย่อมาจากอะไร'],
  ['จาวาสคริปต์เอาไว้ทำอะไร', 'JavaScript ใช้ทำอะไร'],
  ['สงกรานต์คือวันไหนของปี', 'สงกรานต์ตรงกับวันที่เท่าไร'],
  ['วันลอยกระทงตรงกับวันอะไร', 'วันลอยกระทงตรงกับวันไหน'],
  ['ส่วนผสมหลักของผัดไทยมีอะไรบ้าง', 'ผัดไทยมีส่วนผสมหลักอะไร'],
  ['รสชาติของต้มยำเป็นยังไง', 'ต้มยำมีรสชาติอย่างไร'],
  ['ข้าวหอมมะลิมาจากภาคไหน', 'ข้าวหอมมะลิปลูกมากในภาคไหน'],
  ['ไฟฟ้ากระแสสลับต่างกับกระแสตรงยังไง', 'ไฟฟ้ากระแสตรงกับกระแสสลับต่างกันอย่างไร'],
  ['ต้องการอะไรบ้างในการสังเคราะห์แสงของพืช', 'พืชสังเคราะห์แสงต้องการอะไรบ้าง'],
  ['วิธีลดภาวะโลกร้อน', 'ลดโลกร้อนทำได้อย่างไร'],
  ['การลืมความรู้ของมิ้มทำยังไง', 'ลืมความรู้ทำอย่างไร'],
  ['ส่งออกความรู้ของมิ้มทำยังไง', 'ส่งออกความรู้ทำอย่างไร'],
  ['ทำไมควรสอนมิ้ม', 'ทำไมต้องสอนมิ้ม'],
  ['อักษรไทยมีกี่ตัวพยัญชนะ', 'อักษรไทยมีพยัญชนะกี่รูป'],
  ['ระบอบการปกครองไทยเป็นแบบไหน', 'ระบอบการปกครองของไทยคืออะไร'],
  ['ภาษาทางการของไทยคืออะไร', 'ภาษาทางการของประเทศไทยคือภาษาอะไร']
];

// NEG: ไม่มีคำตอบในคลัง ต้องไม่ตอบด้วยคำตอบของเรื่องอื่น
const NEG = [
  'วันนี้อากาศเป็นยังไง',
  'แมวชอบกินอะไร',
  'ราคาหุ้น Apple วันนี้เท่าไร',
  'ช่วยแต่งกลอนเกี่ยวกับทะเลหน่อย',
  'สวัสดีตอนเช้า',
  'เหนื่อยจังเลย',
  'ปลาทูนึ่งทำยังไง',
  'กรุงเทพมีกี่เขต',
  'ดาวอังคารมีกี่ดวง',
  'ภูเขาในญี่ปุ่นชื่ออะไร',
  'ข้าวผัดทำยังไง',
  'น้ำมันเครื่องรถเปลี่ยนทุกกี่กิโล',
  'ประเทศจีนมีกี่มณฑล',
  'ดอกไม้ประจำชาติไทยคืออะไร',
  'ดาวศุกร์อยู่ไกลจากดวงอาทิตย์แค่ไหน'
];

// KNOWN: ปัญหาที่รู้แล้วยังไม่แก้ รายงานไว้แต่ไม่นับในเกณฑ์กันถอยหลัง (ต้องให้ตอบ "ยังไม่รู้" ไม่ใช่ตอบเรื่องอื่น)
const KNOWN = [
  'ดาวไหนมีวงแหวน'
];

// ----- เครื่องมือ -----
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }
  };
}

// คลังที่สอนเฉพาะชุด pack (ไม่เติมจากชุดเริ่มต้นและไม่มีคำถามอื่นปน)
function build() {
  const ls = memStorage();
  const sb = { console, localStorage: ls, setTimeout, clearTimeout, Date };
  sb.window = sb;
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  const N = sb.NINO;
  const store = new N.KnowledgeStore(ls).load();
  for (const [q, a] of sb.NINO_PACK_TH.entries) store.teach(q, a);
  const bus = new N.Bus();
  const graph = new N.Graph();
  const retrieval = graph.add(new N.RetrievalNode('retrieval', bus, store));
  const language = graph.add(new N.LanguageNode('language', bus, store));
  const thinker = new N.ThinkNode('thinker', bus, store, retrieval, language);
  thinker.getGraph();
  return { N, store, retrieval, thinker, pack: sb.NINO_PACK_TH };
}

function think(h, text) {
  const gen = h.thinker.think(text);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

// ----- การประเมิน -----
function evalPositives(h, set, expectedFor) {
  const out = { ret: { ok: 0, wrong: 0, miss: 0 }, pipe: { ok: 0, wrong: 0, miss: 0, composed: 0 }, rows: [],
    alt: { shown: 0, hitWhenBad: 0, bad: 0, noiseOnOk: 0, ok: 0 } };
  for (const [q, src] of set) {
    const want = expectedFor(src);
    // ชั้นค้น: match เพียงอย่างเดียว
    const r = h.retrieval.match(q);
    const rv = !r ? 'miss' : r.entry.a === want ? 'ok' : 'wrong';
    out.ret[rv]++;
    // ท่อจริง
    const t = think(h, q);
    // คำตอบที่มาจากรายการความรู้ (รวมถึงเส้นทางความหมาย) ต้องเทียบกับคำตอบของรายการนั้นเสมอ
    // ประโยคเรียบเรียงใหม่ที่ไม่มีรายการต้นทางเท่านั้นที่นับเป็น "เรียบเรียง"
    let pv;
    if (t.kind === 'generated' || (t.kind === 'composed' && !t.entry)) pv = 'composed';
    else if (t.kind === 'answer' || t.kind === 'composed') pv = (t.entry ? t.entry.a : t.text) === want ? 'ok' : 'wrong';
    else pv = 'miss';
    if (pv === 'composed') out.pipe.composed++;
    else out.pipe[pv]++;
    // เส้นทางเลือก: ดูว่าเมื่อคำตอบหลักไม่ถูก คำตอบที่ถูกอยู่ในทางเลือกหรือไม่ และทางเลือกไปรบกวนคำตอบที่ถูกหรือไม่
    const alts = t.alts || [];
    if (alts.length) out.alt.shown++;
    if (pv === 'ok') { out.alt.ok++; if (alts.length) out.alt.noiseOnOk++; }
    else if (pv === 'wrong' || pv === 'miss') {
      out.alt.bad++;
      if (alts.some(e => e.a === want)) out.alt.hitWhenBad++;
    }
    out.rows.push({ q, src, ret: rv, pipe: pv, got: t.text });
  }
  return out;
}

function evalNegatives(h) {
  let retFalse = 0, pipeFalse = 0, pipeComposed = 0;
  const rows = [];
  for (const q of NEG) {
    const r = h.retrieval.match(q);
    if (r) retFalse++;
    const t = think(h, q);
    // ทักทาย/ตอบเจตนาเป็นคำตอบที่ถูกต้องตามกฎ จึงไม่นับเป็นการตอบผิดในชุดนี้ (แยกนับไว้)
    const answered = (t.kind === 'answer' && !t.entry && /เจตนา/.test(t.meta || '')) ? false : (t.kind === 'answer' || t.kind === 'composed' || t.kind === 'generated');
    if (answered) pipeFalse++;
    if (t.kind === 'composed' || t.kind === 'generated') pipeComposed++;
    rows.push({ q, kind: t.kind, got: t.text });
  }
  return { retFalse, pipeFalse, pipeComposed, rows };
}

function pct(n, d) { return d ? ((100 * n) / d).toFixed(1) + '%' : '-'; }

function report(label, res, n) {
  const r = res.ret, p = res.pipe;
  console.log(`\n[${label}] ${n} ข้อ`);
  console.log(`  ชั้นค้น  ถูก ${r.ok} (${pct(r.ok, n)})  ผิด ${r.wrong} (${pct(r.wrong, n)})  พลาด ${r.miss} (${pct(r.miss, n)})`);
  console.log(`  ท่อจริง  ถูก ${p.ok} (${pct(p.ok, n)})  ผิด ${p.wrong} (${pct(p.wrong, n)})  พลาด ${p.miss} (${pct(p.miss, n)})  เรียบเรียง ${p.composed}`);
  const a = res.alt;
  console.log(`  เส้นทางเลือก  มีทางเลือก ${a.shown} ข้อ  ในข้อที่ตอบผิด/พลาด ${a.bad} ข้อ ทางเลือกมีคำตอบที่ถูก ${a.hitWhenBad} ข้อ  รบกวนข้อที่ถูก ${a.noiseOnOk} จาก ${a.ok} ข้อ`);
}

function main() {
  const json = process.argv.includes('--json');
  const h = build();
  const packAnswer = new Map(h.pack.entries.map(([q, a]) => [q, a]));
  const expect = (src) => packAnswer.get(src);

  const dev = evalPositives(h, DEV, expect);
  const held = evalPositives(h, HELD, expect);
  const neg = evalNegatives(h);

  if (json) {
    console.log(JSON.stringify({ dev: { ret: dev.ret, pipe: dev.pipe, alt: dev.alt }, held: { ret: held.ret, pipe: held.pipe, alt: held.alt }, neg: { retFalse: neg.retFalse, pipeFalse: neg.pipeFalse, pipeComposed: neg.pipeComposed } }, null, 2));
    return;
  }
  console.log('มิ้ม | ประเมินการค้นคำตอบ (ชุดความรู้ pack-th, ไม่ใช้เครือข่าย)');
  report('DEV ใช้ปรับจูน', dev, DEV.length);
  report('HELD ห้ามใช้ปรับจูน', held, HELD.length);
  console.log(`\n[NEG ไม่มีคำตอบในคลัง] ${NEG.length} ข้อ`);
  console.log(`  ชั้นค้นตอบทั้งที่ไม่ควร (ตอบผิด) ${neg.retFalse}  ท่อจริงตอบทั้งที่ไม่ควร ${neg.pipeFalse} (เรียบเรียง ${neg.pipeComposed})`);

  const misses = [...dev.rows, ...held.rows].filter(x => x.ret !== 'ok');
  // เกณฑ์กันถอยหลัง: ค่าเพดานตามผลที่วัดได้ตอนนี้ ถ้าตอบผิดเพิ่มหรือตอบคำถามที่ไม่มีคำตอบ ให้ล้มเหลว
  if (process.argv.includes('--gate')) {
    const fails = [];
    if (dev.pipe.wrong > 0) fails.push(`DEV ตอบผิด ${dev.pipe.wrong} (เพดาน 0)`);
    if (held.pipe.wrong > 1) fails.push(`HELD ตอบผิด ${held.pipe.wrong} (เพดาน 1: ปัญหาที่รู้แล้วหนึ่งข้อ ดู HANDOFF)`);
    if (neg.retFalse > 0) fails.push(`NEG ชั้นค้นตอบ ${neg.retFalse} (เพดาน 0)`);
    if (neg.pipeFalse > 0) fails.push(`NEG ท่อจริงตอบ ${neg.pipeFalse} (เพดาน 0)`);
    if (fails.length) { console.log('\nเกณฑ์กันถอยหลังไม่ผ่าน: ' + fails.join('; ')); process.exitCode = 1; }
    else console.log('\nเกณฑ์กันถอยหลังผ่าน');
  }
  if (process.argv.includes('--pipe')) {
    console.log('\nท่อจริงที่ไม่ถูก (ทั้ง DEV และ HELD):');
    for (const x of [...dev.rows, ...held.rows]) if (x.pipe !== 'ok') console.log(`  ${x.pipe.padEnd(6)} ret=${x.ret.padEnd(5)} | ${x.q} -> ${(x.got || '').slice(0, 40)}`);
  }
  if (misses.length && process.argv.includes('--detail')) {
    console.log('\nรายการที่ชั้นค้นไม่ตรง:');
    for (const x of misses) console.log(`  ${x.ret.padEnd(5)} | ${x.q}  -> ${x.src}`);
  }
  for (const q of KNOWN) {
    const t = think(h, q);
    console.log(`\nที่รู้แล้ว (ไม่นับในเกณฑ์): "${q}" -> ${t.kind} ${(t.text || '').slice(0, 40)}`);
  }
  if (process.argv.includes('--neg')) {
    console.log('\nผลคำถามที่ไม่มีคำตอบ:');
    for (const x of neg.rows) console.log(`  ${x.kind.padEnd(9)} | ${x.q}  => ${(x.got || '').slice(0, 50)}`);
  }
}

main();
