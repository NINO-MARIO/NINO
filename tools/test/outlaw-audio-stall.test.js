/* เพลงฉากของ Outlaw ไม่หายเมื่อเฟรมค้าง (เบราว์เซอร์จริง)
 * ตรวจ 1) ไฟล์เกมที่แก้ยังมีการแก้ 3 จุด และเกมโหลดไฟล์นี้ 2) เมื่อจำลองเฟรมค้าง 400ms ทุก 1.5 วินาที
 * จำนวนโน้ตที่เล่นต้องยังใกล้เคียงกับตอนปกติ (ไม่ต่ำกว่า 93%). ของเดิมได้ประมาณ 88%
 * รัน: node tools/test/outlaw-audio-stall.test.js */
const H = require('./harness.js');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '../..');
const BUNDLE = 'games/outlaw/assets/index-x-7a43tV-2p.mjs';
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }

async function measure(h, stall) {
  const P = h.page;
  await P.goto(h.base + '/games/outlaw/index.html', { waitUntil: 'load' });
  await sleep(7000);
  await P.mouse.click(200, 300);
  await sleep(1000);
  if (stall) await P.evaluate(() => { setInterval(() => { const t = performance.now(); while (performance.now() - t < 400) {} }, 1500); });
  const t0 = await P.evaluate(() => performance.now());
  await sleep(15000);
  return P.evaluate((t0) => window.__starts.filter(t => t >= t0).length, t0);
}

(async () => {
  console.log('== Outlaw: เพลงฉากไม่หายเมื่อเฟรมค้าง');
  const src = fs.readFileSync(path.join(ROOT, BUNDLE), 'utf8');
  ok(src.includes('const GL=.6,'), 'lookahead is 0.6s');
  ok(src.includes('c>=i-.3&&this.play(l,c,i)'), 'late notes (up to 0.3s) are played, not dropped');
  ok(src.includes('performance.now()+6e3,nx:0'), 'track waits up to 6s for instrument samples');
  const html = fs.readFileSync(path.join(ROOT, 'games/outlaw/index.html'), 'utf8');
  ok(html.includes('./assets/index-x-7a43tV-2p.mjs'), 'game page loads the patched bundle');
  ok(fs.existsSync(path.join(ROOT, BUNDLE)), 'patched bundle exists');

  const h = await H.start();
  const P = h.page;
  await P.route('**/*.mjs', async (route) => {
    const u = new URL(route.request().url());
    const f = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(f) });
  });
  await P.addInitScript(() => {
    window.__starts = [];
    const orig = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { window.__starts.push(performance.now()); return orig.apply(this, a); };
  });
  const base = await measure(h, false);
  const stalled = await measure(h, true);
  console.log('  โน้ตปกติ ' + base + ' · ตอนเฟรมค้าง ' + stalled + ' (' + Math.round(100 * stalled / Math.max(1, base)) + '%)');
  ok(base >= 40, 'the game plays normally (notes started: ' + base + ')');
  ok(stalled >= 0.93 * base, 'stalled frames do not drop notes: ' + stalled + ' vs ' + base);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await h.close();
  if (fail) { console.log('outlaw-audio-stall: FAILED'); process.exit(1); }
  console.log('outlaw-audio-stall: all ' + pass + ' passed');
})().catch(async (e) => { console.error(e); process.exit(1); });
