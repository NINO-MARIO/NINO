// วัดเวลาเปิดแอป (เบราว์เซอร์จำลอง 390×844) ด้วยสูตรใน perf-formula.js
//   รัน:     node tools/perf-startup.js              (วัดแล้วเทียบกับ tools/perf-baseline.json ถ้ามี)
//            node tools/perf-startup.js --record     (บันทึกค่าพื้นฐานใหม่)
//            node tools/perf-startup.js --out <ไฟล์>  (ระบุไฟล์พื้นฐานเอง)
//   ตัวชี้วัด: loadMs (เวลาถึงเหตุการณ์ load) · reqs (จำนวนคำขอทรัพยากร) · jsBytes (ขนาด JS ที่ส่งจริง)
//   ค่ากลางของ N รอบ (ค่าเริ่มต้น 7) ออกโค้ด 1 เมื่อมีตัวชี้วัดใดเป็น regress
// หมายเหตุ: ตัวเลขใช้เทียบกันเองบนเครื่องเดียวกันเท่านั้น ไม่ใช่ความเร็วของผู้ใช้จริง
const fs = require('fs'), path = require('path');
const F = require('./perf-formula.js');
const H = require('./test/harness.js');

const args = process.argv.slice(2);
const RECORD = args.includes('--record');
const oi = args.indexOf('--out');
const OUT = oi >= 0 ? path.resolve(args[oi + 1]) : path.join(__dirname, 'perf-baseline.json');
const ni = args.indexOf('--runs');
const RUNS = ni >= 0 ? Math.max(3, Number(args[ni + 1]) || 7) : 7;
const TOL = 0.20;
const FLOOR = { loadMs: 300, reqs: 3, jsBytes: 20000 };

(async () => {
  const h = await H.start();
  const P = h.page;
  const samples = { loadMs: [], reqs: [], jsBytes: [] };
  try {
    for (let i = 0; i < RUNS; i++) {
      await P.goto(h.base + '/index.html', { waitUntil: 'load' });
      await P.waitForTimeout(300);
      const m = await P.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        const res = performance.getEntriesByType('resource');
        const js = res.filter(r => /\.js(\?|$)/.test(r.name));
        return {
          loadMs: Math.round(nav.loadEventEnd || 0),
          reqs: res.length + 1,
          jsBytes: js.reduce((a, r) => a + (r.encodedBodySize || r.transferSize || 0), 0)
        };
      });
      for (const k of Object.keys(samples)) samples[k].push(m[k]);
    }
  } finally { await h.close(); }

  const cur = {};
  for (const k of Object.keys(samples)) cur[k] = F.median(samples[k]);

  if (RECORD) {
    fs.writeFileSync(OUT, JSON.stringify({ runs: RUNS, median: cur, samples, tol: TOL, floor: FLOOR }, null, 2) + '\n');
    console.log('บันทึกค่าพื้นฐานแล้ว: ' + OUT);
    console.log(JSON.stringify(cur));
    return;
  }

  console.log('== เวลาเปิดแอป (' + RUNS + ' รอบ, ค่ากลาง)');
  console.log('  ปัจจุบัน: loadMs ' + cur.loadMs + ' · reqs ' + cur.reqs + ' · jsBytes ' + cur.jsBytes);
  if (!fs.existsSync(OUT)) { console.log('  ไม่มีค่าพื้นฐาน ไม่ตัดสิน (รัน --record ก่อน)'); return; }
  const base = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  let bad = 0;
  for (const k of Object.keys(cur)) {
    const v = F.verdict({ base: base.median[k], cur: cur[k], runs: samples[k], tol: TOL, floor: FLOOR[k], noiseMax: 0.5 });
    if (v.status === 'regress') bad++;
    const pct = Number.isFinite(v.ratio) ? (v.ratio * 100).toFixed(1) + '%' : '-';
    console.log('  ' + k + ': พื้นฐาน ' + base.median[k] + ' → ' + cur[k] + ' (' + pct + ') ' + v.status);
  }
  console.log(bad ? 'perf-startup: ช้าลงเกินเกณฑ์ ' + bad + ' ตัวชี้วัด' : 'perf-startup: ไม่มีตัวชี้วัดที่ช้าลงเกินเกณฑ์');
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
