/* มิ้ม | ทดลองคุยกับมิ้มผ่านท่อเดียวกับป็อปอัพ (ไม่ใช่การทดสอบผ่าน/ไม่ผ่าน)
 * ใช้: node mim/tests/chat-session.js   จะพิมพ์บทสนทนาให้อ่านและตรวจด้วยตา
 * ทุกบรรทัดของมิ้มแสดงชนิดคำตอบและป้ายที่ระบบติดไว้ เพื่อให้เห็นว่าตอบจากอะไร
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
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }
  };
}

function boot() {
  const ls = memStorage();
  const sb = { console, localStorage: ls, setTimeout, clearTimeout, Date };
  sb.window = sb;
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  const N = sb.NINO;
  const bus = new N.Bus();
  const graph = new N.Graph();
  const store = new N.KnowledgeStore(ls).load();
  const retrieval = graph.add(new N.RetrievalNode('retrieval', bus, store));
  const language = graph.add(new N.LanguageNode('language', bus, store));
  const thinker = graph.add(new N.ThinkNode('thinker', bus, store, retrieval, language));
  graph.add(new N.ChatNode('chat', bus, store, thinker));
  if (store.ensureSeed(N.SEED_KNOWLEDGE)) store.save();
  if (N.Learn) N.Learn.ensurePack(store, sb.NINO_PACK_TH);
  store.settings.enabled = true; // เทียบเท่าการกดเปิดใช้งานในป็อปอัพ
  store.save();
  const out = [];
  bus.on('chat.out', (m) => out.push(m));
  return { N, bus, store, out };
}

async function say(h, text) {
  h.out.length = 0;
  h.bus.emit('chat.in', text);
  await new Promise((r) => setTimeout(r, 0));
  return h.out.slice();
}

const SCRIPT = [
  ['ทักทาย', 'สวัสดี'],
  ['ความรู้จากชุดเริ่มต้น', 'มิ้มคืออะไร'],
  ['ชุดเริ่มต้น แบบถามต่าง', 'ประเทศไทยมีกี่จังหวัดนะ'],
  ['ชุดเริ่มต้น แบบถามต่าง', 'น้ำเดือดกี่องศา'],
  ['ชุดเริ่มต้น แบบถามต่าง', 'ทำไมท้องฟ้าสีฟ้า'],
  ['สอนครั้งเดียว', 'สอน สีของท้องฟ้า | ท้องฟ้าสีฟ้าค่ะ'],
  ['ถามข้อที่สอนด้วยคำอื่น', 'ท้องฟ้าสีอะไร'],
  ['ถามข้อที่สอนด้วยคำอื่น', 'สีของท้องฟ้าคืออะไร'],
  ['สอนชุดเรื่องแมว', 'สอน แมวกินอะไร | แมวกินปลาและเนื้อสัตว์ค่ะ'],
  ['สอนชุดเรื่องแมว', 'สอน แมวชอบอะไร | แมวชอบนอนในที่อบอุ่นและชอบเล่นกับของเล่นค่ะ'],
  ['สอนชุดเรื่องแมว', 'สอน แมวเป็นสัตว์อะไร | แมวเป็นสัตว์เลี้ยงลูกด้วยนมค่ะ'],
  ['ให้เรียบเรียงจากคำที่เรียนรู้', 'แมวเป็นยังไง'],
  ['ให้เรียบเรียงจากคำที่เรียนรู้', 'เล่าเรื่องแมวให้ฟังหน่อย'],
  ['ไม่รู้เรื่องนี้เลย', 'ดาวอังคารมีกี่ดวง'],
  ['อารมณ์และทักทาย', 'เหนื่อยจัง'],
  ['อารมณ์และทักทาย', 'ขอบคุณนะ']
];

(async () => {
  const h = boot();
  console.log('== บทสนทนาทดลอง (ความรู้ทั้งหมด ' + h.store.entries.length + ' รายการ)\n');
  for (const [group, text] of SCRIPT) {
    const replies = await say(h, text);
    console.log('[' + group + ']');
    console.log('  ผู้ใช้: ' + text);
    if (!replies.length) console.log('  มิ้ม: (ไม่มีคำตอบ)');
    for (const r of replies) {
      console.log('  มิ้ม (' + r.kind + '): ' + r.text.split('\n').join(' / '));
      if (r.meta) console.log('      ป้าย: ' + r.meta);
    }
  }
  console.log('\nความรู้หลังการทดลอง ' + h.store.entries.length + ' รายการ');
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
