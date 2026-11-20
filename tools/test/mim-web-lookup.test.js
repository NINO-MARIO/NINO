// มิ้มค้นเว็บหาคำตอบ (เบราว์เซอร์): ปุ่มขึ้นเฉพาะตอนเปิดค้นเว็บ ผลเข้าถาดรอยืนยัน ไม่เข้าความรู้เอง
// ผู้ยืนยันแล้วมิ้มจึงตอบได้ และตอนปิดค้นเว็บปุ่มต้องหายไป
// ผลค้นเว็บเป็นตัวปลอม (ไม่มีเครือข่าย)
// รัน: node tools/test/mim-web-lookup.test.js
const H = require('./harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }

const Q = 'ทดลองดาวจำลองคืออะไร';
const A = 'ทดลองดาวจำลอง คือ ดาวสมมติที่ใช้ทดสอบระบบผู้สมัคร';

(async () => {
  console.log('== มิ้มค้นเว็บหาคำตอบ: ถาดรอยืนยัน, ยืนยันแล้วจึงตอบได้, ปิดค้นเว็บแล้วไม่มีปุ่ม');
  const h = await H.start();
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(1500);
  // ผลค้นปลอม: ค้นได้เฉพาะตอนเปิดสวิตช์ (ตรงกับ ninoWeb.on ของจริง)
  await P.evaluate((a) => {
    window.__webOn = true;
    window.__webCalls = 0;
    window.ninoWeb = {
      on: () => window.__webOn,
      search: async (q) => {
        window.__webCalls++;
        const r = [{ src: 'Wikipedia', title: 'ทดลองดาวจำลอง', url: 'https://th.wikipedia.org/wiki/x', text: a + '. ดาวพุธ เป็นดาวเคราะห์ดวงแรก.' }];
        r.errs = [];
        return r;
      }
    };
  }, A);

  await P.click('#mode-mim');
  await sleep(300);
  await P.click('#mim-enable');
  await sleep(200);
  // ปิดช่องสอน: กดปุ่มคำถามซ้ำจนซ่อน (ครั้งแรกใส่ | ให้ ครั้งที่สองปิด)
  const closeTeachPanel = async () => {
    for (let i = 0; i < 3; i++) {
      if (await P.evaluate(() => document.getElementById('mim-teach').hidden)) break;
      await P.click('#mim-qa');
      await sleep(100);
    }
    await P.evaluate(() => { document.getElementById('mim-teach-input').value = ''; });
  };
  const ask = async (q) => {
    await P.fill('#mim-input', q);
    await P.click('#mim-send');
    await sleep(900);
    return P.evaluate(() => {
      const b = [...document.querySelectorAll('#mim-msgs .mim-bub-nino')];
      const last = b[b.length - 1];
      return last ? { text: last.querySelector('.mim-bub-text').textContent, hasWeb: !!last.querySelector('.mim-bub-web') } : null;
    });
  };

  // 1) ตอบไม่ได้ ต้องมีปุ่มค้นเว็บ
  let r = await ask(Q);
  ok(r && r.hasWeb, 'fallback bubble offers web lookup when web is on');

  // 2) กดค้น: ผลเข้าถาดรอยืนยัน ยังไม่เข้าความรู้
  await P.click('#mim-msgs .mim-bub-web >> nth=-1');
  await sleep(700);
  ok(await P.evaluate(() => window.__webCalls === 1), 'web search was called once');
  ok(await P.evaluate(() => { const t = document.getElementById('mim-tray'); return t && !t.hidden && t.querySelector('.mim-tray-q') && t.querySelector('.mim-tray-q').textContent === 'ทดลองดาวจำลองคืออะไร'; }), 'candidate shows in the tray');
  ok(await P.evaluate(() => { const t = document.getElementById('mim-tray'); return /ยังไม่ได้จำ/.test(t.textContent) && /Wikipedia|th\.wikipedia/.test(t.textContent); }), 'tray says not learned yet and shows the source');
  ok(await P.evaluate(() => { const raw = localStorage.getItem('nino_local_ai_mind_v1'); return raw && JSON.parse(raw).candidates.length === 1; }), 'candidate is persisted in the mind store');

  // 3) ยืนยันแล้วมิ้มตอบได้
  // ยังไม่เปิดช่องสอนเอง: ผู้ใช้กดปุ่มคำถามเพื่อเปิดรายการรอยืนยัน
  ok(await P.evaluate(() => document.getElementById('mim-teach').hidden === true), 'teach panel stays closed after lookup');
  await P.click('#mim-qa');
  await sleep(200);
  await P.click('#mim-tray .mim-tray-row >> nth=0 >> text=ยืนยัน จำไว้');
  await sleep(500);
  ok(await P.evaluate(() => { const t = document.getElementById('mim-tray'); return t.hidden || t.querySelectorAll('.mim-tray-row').length === 0; }), 'confirmed candidate leaves the tray');
  await closeTeachPanel();
  ok(await P.evaluate(() => document.getElementById('mim-teach').hidden === true), 'teach panel closed again before asking');
  r = await ask(Q);
  ok(r && r.text.indexOf('ดาวสมมติ') >= 0, 'after confirmation Mim answers from the taught knowledge, got ' + (r && r.text));

  // 4) ปิดสวิตช์ค้นเว็บ: ปุ่มต้องหาย และไม่มีการค้น
  await P.evaluate(() => { window.__webOn = false; });
  const calls = await P.evaluate(() => window.__webCalls);
  r = await ask('ทดลองฝนตกทำไงอีกที');
  ok(r && !r.hasWeb, 'no web button when web search is off');
  ok(await P.evaluate(() => window.__webCalls) === calls, 'no web call when web search is off');

  console.log('  ผ่าน ' + pass + ' ไม่ผ่าน ' + fail);
  await h.close();
  if (fail) { console.log('mim-web-lookup: FAILED'); process.exit(1); }
  console.log('mim-web-lookup: all ' + pass + ' passed');
})().catch(async (e) => { console.error(e); process.exit(1); });
