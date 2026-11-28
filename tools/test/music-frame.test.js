/* กรอบวิดีโอเพลง (เบราว์เซอร์จริง): ไม่โดนขอบจอกิน ทั้งจอแคบและกว้าง ปุ่มขยายจอ และเพลย์ลิสต์ใช้เครื่องเล่นรายการ
 * รัน: node tools/test/music-frame.test.js */
const H = require('./harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
const PL = 'PLIa05JMgYhhZwUEbl-hf9sFmewPYnOo5f';

(async () => {
  console.log('== กรอบวิดีโอ: ไม่โดนขอบจอ, ปุ่มขยาย, เพลย์ลิสต์');
  const h = await H.start();
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await P.evaluate(() => localStorage.setItem('nino.music.q', JSON.stringify(['aaaaaaaaaaa'])));
  await P.reload({ waitUntil: 'load' });
  await sleep(1800);

  const measure = () => P.evaluate(() => {
    const f = document.getElementById('nino-yt');
    if (!f) return null;
    const r = f.getBoundingClientRect();
    const br = document.getElementById('music-btn').getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, btnTop: br.top, btnBottom: br.bottom,
      scroll: document.documentElement.scrollWidth, ring: getComputedStyle(f).boxShadow };
  });

  for (const vw of [360, 390, 412]) {
    await P.setViewportSize({ width: vw, height: 780 });
    await sleep(200);
    await P.evaluate(() => { window.ninoMusic.play(0); });
    await sleep(250);
    await P.evaluate(() => { document.querySelector('#music-btn').click(); });
    await sleep(200);
    // ปุ่มดูวิดีโอค้างเปิดจากรอบก่อนได้: เปิดให้แน่ใจว่าเปิดอยู่ (ไม่กดสลับกลับ)
    await P.evaluate(() => { const b = document.querySelector('#music-panel [data-act="watch"]'); if (b.getAttribute('aria-pressed') !== 'true') b.click(); });
    await sleep(250);
    const m = await measure();
    ok(m && m.left >= 9.5, vw + 'px: frame does not touch the left edge, got left=' + (m && m.left));
    ok(m && m.right <= m.vw - 9.5, vw + 'px: frame does not touch the right edge, got right=' + (m && m.right) + ' vw=' + (m && m.vw));
    ok(m && m.scroll <= vw, vw + 'px: no horizontal page scroll, got ' + (m && m.scroll));
    ok(m && Math.abs(m.h - m.w * 9 / 16) < 2, vw + 'px: 16:9 kept');
    ok(m && /rgba\(242, 138, 178/.test(m.ring), vw + 'px: pink ring is applied');
    ok(m && !(m.top < m.btnBottom && m.bottom > m.btnTop), vw + 'px: frame does not cover the music button');

    await P.evaluate(() => { document.querySelector('#music-panel [data-act="expand"]').click(); });
    await sleep(250);
    const big = await measure();
    ok(big && big.w > m.w - 1, vw + 'px: expand makes the frame bigger');
    ok(big && big.left >= 9.5 && big.right <= big.vw - 9.5, vw + 'px: expanded frame stays inside the screen, got ' + (big && [big.left, big.right]));
    ok(big && big.top >= 9.5 && big.bottom <= big.vh - 9.5, vw + 'px: expanded frame stays inside vertically, got ' + (big && [big.top, big.bottom]));
    await P.evaluate(() => { document.querySelector('#music-panel [data-act="expand"]').click(); });
    await sleep(200);
    await P.evaluate(() => { window.ninoMusic.stop(); });
    await sleep(150);
  }

  console.log('== เพลย์ลิสต์: ใช้เครื่องเล่นรายการจริง');
  await P.setViewportSize({ width: 390, height: 844 });
  await P.evaluate((pl) => { localStorage.setItem('nino.music.q', JSON.stringify(['list:' + pl])); }, PL);
  await P.reload({ waitUntil: 'load' });
  await sleep(1800);
  const src = await P.evaluate((pl) => {
    window.ninoMusic.play(0);
    const f = document.getElementById('nino-yt');
    return { src: f && f.src, parsed: window.ninoMusic.parse('https://youtube.com/playlist?list=' + pl + '&si=aKRAhfx6SpXtGZS3') };
  }, PL);
  ok(src.src.indexOf('/embed/videoseries?list=' + PL) >= 0, 'playlist plays through the videoseries embed, got ' + src.src);
  ok(src.parsed.length === 1 && src.parsed[0] === 'list:' + PL, 'playlist link with si= parses as one playlist');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await h.close();
  if (fail) { console.log('music-frame: FAILED'); process.exit(1); }
  console.log('music-frame: all ' + pass + ' passed');
})().catch(async (e) => { console.error(e); process.exit(1); });
