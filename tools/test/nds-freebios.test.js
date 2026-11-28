/* ห้อง NDS: ปุ่ม "ใช้ FreeBIOS" (BIOS ทดแทนฟรี BSD-2 มากับแอป).
   ตรวจ: ไฟล์และไลเซนส์ถูกเสิร์ฟ, ใส่แล้วยืนยัน SHA-256, คงค่าหลังรีโหลด,
   เปลี่ยนเป็นไฟล์อื่นแล้วป้าย FreeBIOS หายไป, ด่านก่อนเล่นผ่าน.
   Run: node tools/test/nds-freebios.test.js */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('  FAIL: ' + name); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function loadPlaywright() {
  for (const t of ['playwright', '/opt/npm-tools/node_modules/playwright', path.join(process.env.HOME || '', '.npm-global/lib/node_modules/playwright')]) {
    try { return require(t); } catch (e) { /* next */ }
  }
  throw new Error('playwright is not installed');
}
const MIMEA = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.bin': 'application/octet-stream', '.txt': 'text/plain', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain' };
function server() {
  return http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIMEA[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
}
const slots = page => page.$$eval('#bios .slot', els => els.map(e => e.textContent));

(async () => {
  const srv = server();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    // the bundled files and licence are served with the room
    for (const [f, size] of [['bios-free/drastic_bios_arm7.bin', 16384], ['bios-free/drastic_bios_arm9.bin', 4096], ['bios-free/LICENSE.txt', 0]]) {
      const r = await fetch(`${base}/games/nds/${f}`);
      const body = Buffer.from(await r.arrayBuffer());
      ok(r.status === 200 && (size === 0 ? body.length > 0 : body.length === size), `served ${f} (${body.length} bytes)`);
    }
    const lic = fs.readFileSync(path.join(ROOT, 'games/nds/bios-free/LICENSE.txt'), 'utf8');
    ok(/BSD|Redistribution/.test(lic) && /Gilead Kutnick/.test(lic), 'licence text names the author and the BSD terms');

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route(url => !url.href.startsWith(base), r => r.abort());
    // สถานะตั้งต้นของเทสต์นี้ = บิลด์ที่ไม่มีแกน (ตัวบิลด์จริงมีแกนแล้ว)
    await ctx.route('**/wasm_exec.js', r => r.abort());
    await ctx.route('**/core.wasm', r => r.abort());
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message || e)));
    await page.goto(base + '/games/nds/index.html', { waitUntil: 'load' });
    await sleep(1000);

    console.log('== 1. one click loads FreeBIOS');
    await page.click('#usefree');
    await sleep(1200);
    let s = await slots(page);
    ok(s.some(t => /ARM7 BIOS/.test(t) && /ใส่แล้ว/.test(t) && /FreeBIOS/.test(t)), 'ARM7 slot shows FreeBIOS and inserted');
    ok(s.some(t => /ARM9 BIOS/.test(t) && /ใส่แล้ว/.test(t) && /FreeBIOS/.test(t)), 'ARM9 slot shows FreeBIOS and inserted');
    ok(s.some(t => /Firmware/.test(t) && /ไม่ได้ใส่ \(ไม่บังคับ\)/.test(t)), 'Firmware stays optional');
    ok(/พร้อมแล้ว/.test(await page.textContent('#note')), 'cabinet is ready');

    console.log('== 2. FreeBIOS survives a reload');
    await page.reload({ waitUntil: 'load' });
    await sleep(1200);
    s = await slots(page);
    ok(s.some(t => /ARM7 BIOS/.test(t) && /FreeBIOS/.test(t)), 'ARM7 still labelled FreeBIOS after reload');

    console.log('== 3. a different file in the slot drops the FreeBIOS label');
    const mine = path.join(os.tmpdir(), 'nino-fb-arm7.bin');
    fs.writeFileSync(mine, Buffer.alloc(16384, 7));
    await page.setInputFiles('input[data-bios="bios7"]', mine);
    await sleep(800);
    s = await slots(page);
    ok(s.some(t => /ARM7 BIOS/.test(t) && /ใส่แล้ว/.test(t) && !/FreeBIOS/.test(t)), 'ARM7 label is no longer FreeBIOS');
    ok(s.some(t => /ARM9 BIOS/.test(t) && /FreeBIOS/.test(t)), 'ARM9 keeps its FreeBIOS label');

    console.log('== 4. play gate passes with both required files');
    const rom = path.join(os.tmpdir(), 'nino-fb.nds');
    const hdr = Buffer.alloc(0x400); hdr.write('FBTEST', 0, 'ascii'); hdr.write('FBTS', 12, 'ascii');
    fs.writeFileSync(rom, hdr);
    await page.setInputFiles('#add', rom);
    await sleep(800);
    await page.click('#shelf [data-play]');
    await sleep(400);
    ok(/แกนจำลอง/.test(await page.textContent('#toast')), 'gate passes and the core check is reached');
    ok(errs.length === 0, 'no page errors (' + errs.slice(0, 3).join(' | ') + ')');
    await ctx.close();
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
