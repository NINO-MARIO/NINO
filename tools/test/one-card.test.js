/* One card per message, with a small scripted "clone bot" that streams the way the model does,
   including the auto-continue turns that used to open a second card. Run: node tools/test/one-card.test.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'hud-card.js'), 'utf8');
const ctx = { window: {}, document: { addEventListener() {}, getElementById() { return null; } }, console, Date, Math, String, Number, Array, Object, RegExp, JSON, Promise, setTimeout, clearTimeout, URL };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const H = ctx.ninoHud;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const plain = s => '<p>' + esc(s) + '</p>';
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('  FAIL: ' + name); } }

/* scripted streams: the first turn writes a card, auto-continue turns keep writing (some with a second card) */
const CARD1 = '[[CARD]]\nสถานะ: เสร็จแล้ว\nสถานการณ์: ✅ | แก้ปุ่มเพลงแล้ว\nสภาพแวดล้อม: js/music.js\nระบบ: diff +42 -3\nตัวเลือก1: ทดสอบในเครื่อง\n[[/CARD]]';
const STREAM_CODE = [
  { turn: 1, text: CARD1 },
  { turn: 2, text: '\n\nต่อไปนี้คือโค้ดที่เพิ่ม\n[[CODE js]]const a = 1;\n[[/CODE]]\n\n[[CARD]]\nสถานะ: กำลังเขียน\nสถานการณ์: อธิบายผล\nตัวเลือก1: ดูตาราง\n[[/CARD]]' },
  { turn: 3, text: '\n[[TABLE]]\nชื่อ | ค่า\nเวลา | 2 นาที\n[[/TABLE]]\n[[PLAN]]\n[x] แก้เพลง\n[ ] เทส\n[[/PLAN]]' }
];
const STREAM_ROLE = [
  { turn: 1, text: '[[CARD]]\nสถานะ: ปกติ\nเวลา: 14:20\nสถานการณ์: 🌧 | ร้านกาแฟเงียบ\nพูด: นิโนะ | ยิ้ม | ยินดีต้อนรับค่ะ\n[[/CARD]]' },
  { turn: 2, text: '\n\nเธอเดินไปที่เคาน์เตอร์ ลมฝนพัดเข้ามาตามประตู\n[[CARD]]\nสถานการณ์: ลูกค้าอีกคนเข้ามา\nพูด: ลูกค้า | ทักทาย\n[[/CARD]] [[END]]' }
];

function run(stream, mode) {
  return stream.map(s => s.text).join('');
}

console.log('== code mode: one card, later turns are text, code and plan blocks');
const code = run(STREAM_CODE, 'code');
const out = H.mixed(code, plain, { mode: 'code', name: 'NINO', ts: 0 });
const cardCount = (out.match(/class="nino-hud"/g) || []).length;
ok(cardCount === 1, 'exactly one card for the message (got ' + cardCount + ')');
ok(out.indexOf('ดูตาราง') < 0, 'options from the second card are not drawn as buttons');
ok(/<pre[^>]*>[\s\S]*const a = 1/.test(out), 'the code block from a later turn is still rendered');
ok(/<table/.test(out), 'the table from a later turn is still rendered');
ok(/แก้ปุ่มเพลงแล้ว|อธิบายผล/.test(out), 'the story line of the second card is kept as text');

console.log('== roleplay mode: a second card becomes prose');
const rp = run(STREAM_ROLE, 'roleplay');
const rpOut = H.mixed(rp, plain, { mode: 'roleplay', name: 'NINO', ts: 0 });
ok((rpOut.match(/class="nino-hud"/g) || []).length === 1, 'roleplay keeps one card per message');
ok(/ลูกค้าอีกคนเข้ามา/.test(rpOut), 'the second card text is still shown as plain prose');
ok(/ลูกค้า:/.test(rpOut), 'dialogue from the later card is shown');
ok(H.stopped(rp) && H.clean(rp).indexOf('[[END]]') < 0, 'stop marker is detected and hidden');

console.log('== oneCard() used by the continuation loop');
const joined = CARD1 + '\n\nต่อจากนี้เป็นข้อความธรรมดา\n[[CARD]]\nสถานการณ์: อีกใบ\n[[/CARD]]';
const once = H.oneCard(joined, 'code');
ok((once.match(/\[\[CARD\]\]/g) || []).length === 1, 'oneCard leaves a single [[CARD]] marker');
ok(once.indexOf('อีกใบ') >= 0, 'the extra card text survives as prose');
ok(H.oneCard('ไม่มีการ์ดเลย', 'code') === 'ไม่มีการ์ดเลย', 'text without a card is untouched');
ok(H.oneCard('[[CARD]]\nสถานการณ์: ยังไม่ปิด', 'code').indexOf('ยังไม่ปิด') >= 0, 'an unfinished card is kept as it is');

console.log('== streaming: the card renders while it is still open, later text stays readable');
const partial = H.mixed('[[CARD]]\nสถานะ: กำลังเขียน\nเวลา: 1', plain, { mode: 'roleplay', name: 'NINO', ts: 0 });
ok(/LOG: กำลังเขียน/.test(partial), 'an open card shows what it has so far');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
