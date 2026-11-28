// มิ้ม | ทดสอบป็อปอัพในเบราว์เซอร์ (ต้องใช้ playwright เหมือนชุดทดสอบอื่นของ NINO)
// ตรวจ: เปิด/ปิด, สอน, เปิดใช้งาน, ตอบ, จำข้ามการรีโหลด, ไม่มีการเลื่อนแนวนอนบนจอแคบ, ไม่มีข้อผิดพลาดของหน้า
const H = require('../../tools/test/harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }

(async () => {
  console.log('== มิ้ม popup: open, teach, enable, answer, close, persist, phone width');
  const h = await H.start();
  const P = h.page;
  const TEACH_Q = 'ทดสอบมิ้มห้องนี้';
  const TEACH_A = 'ตอบแล้วค่ะจากมิ้ม';

  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1500);

  ok(await P.evaluate(() => !!document.getElementById('mode-mim')), 'third mode button exists');
  ok(await P.evaluate(() => !document.getElementById('mim-root')), 'popup is built lazily (not before first open)');

  await P.click('#mode-mim');
  await sleep(300);
  ok(await P.evaluate(() => !document.getElementById('mim-root').hidden), 'popup opens on click');
  ok(await P.evaluate(() => document.getElementById('mode-mim').classList.contains('active')), 'mim button shows active while open');
  ok(await P.evaluate(() => !document.getElementById('mode-code').classList.contains('active')), 'code button is not active while mim is open');
  const title = await P.evaluate(() => document.getElementById('mim-title').textContent);
  ok(title === 'มิ้ม', 'title is มิ้ม, got: ' + title);
  const greet = await P.evaluate(() => document.getElementById('mim-msgs').textContent);
  ok(greet.indexOf('มิ้ม') >= 0, 'greeting mentions มิ้ม');

  // ยังไม่เปิดใช้งาน: ปุ่มเปิดต้องโชว์
  ok(await P.evaluate(() => !document.getElementById('mim-enable').hidden), 'enable button shows before enabling');

  // สอนได้แม้ยังไม่เปิดใช้งาน (ตามลำดับของเครื่องยนต์)
  await P.fill('#mim-input', 'สอน ' + TEACH_Q + ' | ' + TEACH_A);
  await P.click('#mim-send');
  await sleep(200);

  await P.click('#mim-enable');
  await sleep(150);
  ok(await P.evaluate(() => document.getElementById('mim-status').textContent.indexOf('พร้อมใช้งาน') >= 0), 'status becomes ready after enabling');
  ok(await P.evaluate(() => document.getElementById('mim-enable').hidden), 'enable button hides after enabling');

  await P.fill('#mim-input', TEACH_Q);
  await P.click('#mim-send');
  await sleep(200);
  const last = () => P.evaluate(() => {
    const w = document.querySelectorAll('#mim-msgs > div');
    return w.length ? w[w.length - 1].textContent : '';
  });
  ok((await last()).indexOf(TEACH_A) >= 0, 'answers the taught question, got: ' + (await last()).slice(0, 120));
  // ฟองข้อความต้องมีสไตล์จากไฟล์ของมิ้มเอง (ไม่พึ่ง Tailwind)
  ok(await P.evaluate(() => {
    const u = document.querySelector('#mim-msgs .mim-bub-user');
    return !!u && getComputedStyle(u).backgroundColor === 'rgb(31, 111, 235)';
  }), 'user bubble has its own blue style');
  ok(await P.evaluate(() => document.querySelectorAll('#mim-msgs .mim-bub-nino').length >= 2), 'mim replies use the card bubble style');
  // ปุ่มที่พิมพ์ในมิ้มต้องไม่ทะลุถึง document (ทางลัดของแชตหลักอยู่ที่ document ทั้งหมด)
  // ข้อความ "ตั้งค่า API" ที่เห็นบนจอเป็นของ app.js ที่ขึ้นตอนโหลดหน้าเมื่อยังไม่มีคีย์ ไม่เกี่ยวกับการพิมพ์
  await P.evaluate(() => {
    window.__mimLeak = 0;
    document.addEventListener('keydown', () => { window.__mimLeak++; });
  });
  await P.focus('#mim-input');
  await P.keyboard.type('ก');
  await P.keyboard.press('Control+f');
  await P.keyboard.press('Control+k');
  await P.keyboard.press('Control+Enter');
  await sleep(100);
  ok(await P.evaluate(() => window.__mimLeak === 0), 'keys typed in มิ้ม do not reach document shortcuts, leaked ' + (await P.evaluate(() => window.__mimLeak)));

  // คำถามที่ไม่มีในคลังต้องไม่เดา
  await P.fill('#mim-input', 'ดาวอังคารมีกี่ดวง');
  await P.click('#mim-send');
  await sleep(200);
  ok((await last()).indexOf(TEACH_A) < 0, 'unknown question does not reuse a taught answer');

  // ปิดด้วย Escape แล้วคืนสถานะปุ่มโหมด
  await P.keyboard.press('Escape');
  await sleep(150);
  ok(await P.evaluate(() => document.getElementById('mim-root').hidden), 'Escape closes the popup');
  ok(await P.evaluate(() => !document.getElementById('mode-mim').classList.contains('active')), 'mim button inactive after close');

  // จำข้ามการรีโหลด: ความรู้และสถานะเปิดใช้งานต้องอยู่ใน localStorage เดิม
  await P.reload({ waitUntil: 'load' });
  await sleep(1500);
  await P.click('#mode-mim');
  await sleep(250);
  ok(await P.evaluate(() => document.getElementById('mim-status').textContent.indexOf('พร้อมใช้งาน') >= 0), 'enabled state persists across reload');
  await P.fill('#mim-input', TEACH_Q);
  await P.click('#mim-send');
  await sleep(200);
  ok((await last()).indexOf(TEACH_A) >= 0, 'taught answer persists across reload');

  // พี่นาเดียร์: ไม่มี API ต้องไม่เปิด และต้องบอกผู้ใช้
  await P.click('#mim-nadia');
  await sleep(150);
  ok(await P.evaluate(() => document.getElementById('mim-nadia').textContent === 'นาเดียร์: ปิด'), 'nadia stays off without an API key');
  ok(await P.evaluate(() => document.getElementById('mim-msgs').textContent.indexOf('ยังไม่ได้ตั้งค่า API') >= 0), 'nadia explains the missing API key');

  // ตั้ง API จำลองในหน้านี้ (ไม่มีเครือข่ายจริง) แล้วเปิดนาเดียร์โดยยืนยันกล่องถาม
  await P.evaluate(() => {
    window.getCfg = () => ({ provider: 'gemini' });
    window.providerHasKey = () => true;
    window.geminiGenerate = async (args) => { window.__nadiaSeen = args; return 'คำตอบจาก API ค่ะ'; };
  });
  P.once('dialog', (d) => d.accept());
  await P.click('#mim-nadia');
  await sleep(150);
  ok(await P.evaluate(() => document.getElementById('mim-nadia').textContent === 'นาเดียร์: เปิด'), 'nadia turns on after confirm');
  ok(await P.evaluate(() => JSON.parse(localStorage.getItem('nino_mim_nadia_v1') || '{}').on === true), 'nadia on is saved');

  await P.fill('#mim-input', 'ทดสอบนาเดียร์');
  await P.click('#mim-send');
  await sleep(300);
  ok((await last()).indexOf('คำตอบจาก API ค่ะ') >= 0, 'nadia answer comes from the configured API, got: ' + (await last()).slice(0, 120));
  ok(await P.evaluate(() => !!window.__nadiaSeen && window.__nadiaSeen.systemInstruction.indexOf('ภาษาไทยล้วน') >= 0), 'nadia call carries the Thai-only rule');
  ok(await P.evaluate(() => document.getElementById('mim-msgs').textContent.indexOf('ยังไม่ยืนยัน') >= 0), 'nadia answer is labelled unverified');

  // จำคำตอบเข้าคลังออฟไลน์ได้เฉพาะเมื่อกดปุ่มเอง
  const taughtBefore = await P.evaluate(() => (localStorage.getItem('nino_local_ai_kb_v1') || '').indexOf('ทดสอบนาเดียร์') >= 0);
  ok(taughtBefore === false, 'not taught before pressing the button');
  await P.click('.mim-bub-teach');
  await sleep(150);
  ok(await P.evaluate(() => (localStorage.getItem('nino_local_ai_kb_v1') || '').indexOf('คำตอบจาก API ค่ะ') >= 0), 'pressing the teach button saves the answer to offline knowledge');

  // API ล้มเหลว: ต้องแจ้งผู้ใช้และตอบด้วยมิ้มออฟไลน์แทน
  await P.evaluate(() => { window.geminiGenerate = async () => { throw new Error('boom'); }; });
  await P.fill('#mim-input', 'คำถามที่ไม่มีในคลังเลย');
  await P.click('#mim-send');
  await sleep(300);
  ok(await P.evaluate(() => document.getElementById('mim-msgs').textContent.indexOf('ตอบไม่ได้ตอนนี้ (boom)') >= 0), 'nadia failure is reported to the user');

  // ปิดนาเดียร์ แล้วคำตอบที่จำไว้ต้องตอบแบบออฟไลน์ได้
  await P.click('#mim-nadia');
  await sleep(150);
  ok(await P.evaluate(() => document.getElementById('mim-nadia').textContent === 'นาเดียร์: ปิด'), 'nadia turns off');
  await P.fill('#mim-input', 'ทดสอบนาเดียร์');
  await P.click('#mim-send');
  await sleep(250);
  ok((await last()).indexOf('คำตอบจาก API ค่ะ') >= 0, 'offline mim answers from what nadia taught');

  // ช่องสอนแบบคำถาม/คำตอบ: ปุ่มคำถามเปิดช่อง ปุ่มคำตอบใส่ | ให้เอง แล้วส่งเป็นการสอน
  await P.click('#mim-qa');
  await sleep(100);
  ok(await P.evaluate(() => !document.getElementById('mim-teach').hidden), 'question button opens the teach row');
  ok(await P.evaluate(() => document.getElementById('mim-qa').textContent === 'คำตอบ'), 'button switches to the answer label');
  await P.fill('#mim-teach-input', 'ทดสอบช่องสอน');
  await P.click('#mim-qa');
  await sleep(100);
  ok(await P.evaluate(() => document.getElementById('mim-teach-input').value.indexOf(' | ') >= 0), 'answer button inserts the separator');
  ok(await P.evaluate(() => !!document.querySelector('#mim-teach-mirror .mim-tq') && !!document.querySelector('#mim-teach-mirror .mim-tsep')), 'mirror colors the question and the separator');
  await P.fill('#mim-teach-input', 'ทดสอบช่องสอน | ตอบจากช่องสอนค่ะ');
  await sleep(50);
  ok(await P.evaluate(() => !!document.querySelector('#mim-teach-mirror .mim-ta')), 'mirror colors the answer part');
  await P.click('#mim-send');
  await sleep(250);
  ok((await last()).indexOf('จำแล้ว') >= 0, 'sending the teach row teaches the pair, got: ' + (await last()).slice(0, 80));
  ok(await P.evaluate(() => document.getElementById('mim-teach').hidden), 'teach row closes after sending');
  await P.fill('#mim-input', 'ทดสอบช่องสอน');
  await P.click('#mim-send');
  await sleep(250);
  ok((await last()).indexOf('ตอบจากช่องสอนค่ะ') >= 0, 'taught pair is answered offline');
  // ผิด ช่วยแก้: เปิดช่องสอนพร้อมคำถามเดิม
  await P.locator('.mim-bub-fix').last().click();
  await sleep(100);
  ok(await P.evaluate(() => document.getElementById('mim-teach-input').value.indexOf('ทดสอบช่องสอน | ') === 0), 'fix button opens the teach row with the question');
  await P.click('#mim-qa');
  await sleep(50);

  // จอแคบ: ไม่มีการเลื่อนแนวนอนของหน้า
  await P.setViewportSize({ width: 360, height: 740 });
  await sleep(200);
  ok(await P.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'no horizontal page scroll at 360px');
  await P.keyboard.press('Escape');
  await sleep(120);

  // โหมดเดิมยังทำงาน: แถบโหมดยังมีปุ่ม Code และ Roleplay
  ok(await P.evaluate(() => !!document.getElementById('mode-code') && !!document.getElementById('mode-roleplay')), 'Code and Roleplay buttons still present');
  ok(await P.evaluate(() => !!document.getElementById('prompt-input')), 'main chat input still present');

  ok(h.errors.length === 0, 'no page errors: ' + JSON.stringify(h.errors.slice(0, 3)));
  await h.close();
  console.log('passed ' + pass + ', failed ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
