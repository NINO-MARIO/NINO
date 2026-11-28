// โหมด 1 ในหน้ามิ้มจริง (เบราว์เซอร์): มิ้มตอบไม่ได้ -> โมเดลตอบจากความรู้ของมิ้ม -> ตรวจแล้วจึงแสดง
// โมเดลเป็นตัวปลอมของ wllama (ไม่มีเครือข่าย) ตัวปลอมตอบด้วยข้อความจากความรู้ที่ส่งมาเท่านั้น
// รัน: node tools/test/mim-llm-popup.test.js
const H = require('./harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
const FLOOR = 15;

const FAKE = `
export class Wllama {
  constructor(paths, opts) {}
  async loadModelFromHF(m, c) { c.progressCallback({ loaded: 1, total: 1 }); }
  async createChatCompletion(o) {
    window.__lastSys = o.messages[0].content;
    window.__calls = (window.__calls || 0) + 1;
    // ตอบด้วยคำตอบของความรู้ข้อแรกที่ส่งให้ (ข้อความจริงของมิ้ม จึงผ่านตัวตรวจ)
    const m = /ตอบ: ([^\\n]+)/.exec(o.messages[0].content);
    return { choices: [{ message: { content: m ? m[1] : 'ยังไม่รู้เรื่องนี้ค่ะ' } }] };
  }
  async exit() {}
}`;

(async () => {
  console.log('== โหมด 1 ในหน้ามิ้ม: ตอบจากความรู้ของมิ้ม ตรวจก่อนแสดง ไม่แสดงชื่อโมเดลอื่น');
  const h = await H.start();
  const P = h.page;
  await h.ctx.route(u => u.href === 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js',
    r => r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE }));
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1500);
  await P.evaluate(() => { localStorage.setItem('nino.llm.consent', 'q2_k'); localStorage.setItem('nino.llm.mode', 'mim'); });
  await P.evaluate(() => NINOLocalLLM.load().catch(() => {}));
  await sleep(400);
  ok(await P.evaluate(() => NINOLocalLLM.isReady() && NINOLocalLLM.mode() === 'mim'), 'model ready in mode 1');

  await P.click('#mode-mim');
  await sleep(300);
  await P.click('#mim-enable');
  await sleep(200);
  const ask = async (q) => {
    await P.fill('#mim-input', q);
    await P.click('#mim-send');
    await sleep(900);
    return P.evaluate(() => { const b = [...document.querySelectorAll('#mim-msgs .mim-bub-nino')]; const last = b[b.length - 1]; return last ? { text: last.querySelector('.mim-bub-text').textContent, meta: (last.querySelector('.mim-bub-meta') || {}).textContent || '' } : null; });
  };

  // 1) คำที่มิ้มไม่รู้ และไม่มีความรู้ที่เกี่ยวข้อง: กลับไปตอบแบบเดิมพร้อมเหตุผล
  let r = await ask('ฝนตกทำไง');
  ok(r && r.meta.indexOf('โหมด 1 ใช้ไม่ได้') >= 0, 'no related knowledge: falls back with reason, got ' + (r && r.meta));
  ok(r && r.text.indexOf('SmolLM') < 0, 'no foreign model name');

  // 1b) คำถามที่ตอบไม่ได้ สอนต่อได้จากปุ่มในฟอง และจากรายการคำถามในช่องสอน
  const fixLabel = await P.evaluate(() => { const b = [...document.querySelectorAll('#mim-msgs .mim-bub-fix')]; return b.length ? b[b.length - 1].textContent : ''; });
  ok(fixLabel === 'สอนเรื่องนี้', 'unanswered bubble offers teaching, got ' + fixLabel);
  await P.click('#mim-msgs .mim-bub-fix >> nth=-1');
  await sleep(150);
  ok(await P.evaluate(() => document.getElementById('mim-teach-input').value.indexOf('ฝนตกทำไง') === 0), 'teach box is prefilled with the question');
  ok(await P.evaluate(() => [...document.querySelectorAll('#mim-gaps .mim-gap-chip')].some(b => b.textContent === 'ฝนตกทำไง')), 'gap chip lists the question');
  // ปิดช่องสอนด้วยปุ่มเดิม (ไม่ให้ข้อความถัดไปถูกส่งเป็นการสอน)
  await P.click('#mim-qa');
  await sleep(100);
  await P.evaluate(() => { document.getElementById('mim-teach-input').value = ''; });

  // 2) สอนความรู้ แล้วถามคำที่มิ้มไม่รู้ แต่ความรู้ใกล้เคียง: โมเดลตอบจากความรู้นั้น
  await P.fill('#mim-input', 'สอน ทุเรียนมาจากไหน | ทุเรียนปลูกมากในภาคตะวันออกและภาคใต้ค่ะ');
  await P.click('#mim-send');
  await sleep(300);
  r = await ask('ทุเรียนปลูกที่ไหนบ้าง');
  console.log('  durian reply: ' + JSON.stringify(r));
  // หมายเหตุ: คำตอบนี้มาจากเส้นทางความหมายของมิ้มเอง ไม่ใช่โหมด 1 (เส้นทางโหมด 1 ทดสอบด้วยหน่วยทดสอบ mim-llm.test.js)
  ok(r && r.text.indexOf('ภาคตะวันออก') >= 0, 'taught durian fact is answered, got ' + (r && r.text.slice(0, 40)));

  // 2b) โมเดลตอบจากความรู้ที่สอนไว้ แล้วผู้ใช้ยืนยัน มิ้มจำคำถามนั้น ครั้งหน้าตอบเองโดยไม่เรียกโมเดล
  let learnQ = null;
  for (const q of ['ทุเรียนอร่อยไหม', 'ผลไม้ทุเรียนมาจากที่ไหน', 'สวนทุเรียนอยู่ไหน']) {
    const x = await ask(q);
    if (x && x.meta.indexOf('โหมด 1 · โมเดล') === 0) { learnQ = q; break; }
  }
  ok(learnQ !== null, 'some question reaches mode 1 with a model answer');
  if (learnQ) {
    const before = await P.evaluate(() => window.__calls || 0);
    await P.click('text=ใช่ ตอบตรง ให้มิ้มจำ');
    await sleep(300);
    ok(await P.evaluate(() => document.getElementById('mim-msgs').textContent.indexOf('มิ้มจำคำถามนี้แล้ว') >= 0), 'confirm teaches Mim');
    const r2 = await ask(learnQ);
    ok(r2 && r2.meta.indexOf('โหมด 1') < 0 && r2.text.indexOf('ภาคตะวันออก') >= 0, 'after learning Mim answers the same question itself, got ' + JSON.stringify(r2));
    ok(await P.evaluate(() => window.__calls || 0) === before, 'no model call after learning');
  }

  // 3) โหมด 2: ไม่ใช้โมเดลในหน้ามิ้มเลย
  await P.evaluate(() => NINOLocalLLM.setMode('plain'));
  await sleep(100);
  r = await ask('ฝนตกทำไง');
  ok(r && r.meta.indexOf('โหมด 1') < 0, 'plain mode: no mode-1 text');

  // 4) ปุ่มสลับโหมดในแท็บ LLM
  await P.evaluate(() => ninoConsole.open('llm'));
  await sleep(150);
  ok(await P.evaluate(() => document.querySelectorAll('#nc-p-llm .nc-row button').length >= 3), 'mode buttons present in LLM tab');
  await P.click('#nc-p-llm >> text=โหมด 1: รวมกับมิ้ม');
  await sleep(100);
  ok(await P.evaluate(() => NINOLocalLLM.mode() === 'mim'), 'mode button switches to mode 1');
  await P.evaluate(() => ninoConsole.close());

  ok(h.errors.length === 0, 'no page errors: ' + JSON.stringify(h.errors.slice(0, 3)));
  await h.close();
  const total = pass + fail;
  console.log('mim-llm-popup: ' + pass + '/' + total + ' passed, ' + fail + ' failed (ต้องผ่านอย่างน้อย ' + FLOOR + ')');
  process.exit(fail || total < FLOOR ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
