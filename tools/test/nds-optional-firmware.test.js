/* ห้อง NDS: Firmware ไม่บังคับ. ใส่แค่ ARM7 กับ ARM9 แล้วด่านก่อนเล่นต้องผ่าน (ไม่ขึ้นข้อความขอ BIOS).
   Run: node tools/test/nds-optional-firmware.test.js  (ไฟล์ BIOS เป็นศูนย์ทั้งหมด ทดสอบด่านขนาดเท่านั้น) */
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
const MIMEA = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.md': 'text/plain' };
function server() {
  return http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIMEA[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
}
function fakeNds() { const b = Buffer.alloc(0x400); b.write('OPTFW', 0, 'ascii'); b.write('OPTF', 12, 'ascii'); return b; }

(async () => {
  const srv = server();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route(url => !url.href.startsWith(base), r => r.abort());
    // สถานะตั้งต้นของเทสต์นี้ = บิลด์ที่ไม่มีแกน (ตัวบิลด์จริงมีแกนแล้ว)
    await ctx.route('**/wasm_exec.js', r => r.abort());
    await ctx.route('**/core.wasm', r => r.abort());
    const page = await ctx.newPage();
    await page.goto(base + '/games/nds/index.html', { waitUntil: 'load' });
    await sleep(1000);

    const rom = path.join(os.tmpdir(), 'nino-optfw.nds');
    fs.writeFileSync(rom, fakeNds());
    await page.setInputFiles('#add', rom);
    await sleep(800);

    // ARM7 and ARM9 only, zero-filled test files of the right size
    for (const [k, size] of [['bios7', 16384], ['bios9', 4096]]) {
      const f = path.join(os.tmpdir(), `nino-optfw-${k}.bin`);
      fs.writeFileSync(f, Buffer.alloc(size));
      await page.setInputFiles(`input[data-bios="${k}"]`, f);
      await sleep(500);
    }

    const slots = await page.$$eval('#bios .slot', els => els.map(e => e.textContent));
    ok(slots.some(t => /ARM7 BIOS/.test(t) && /ใส่แล้ว/.test(t)), 'ARM7 slot is inserted');
    ok(slots.some(t => /ARM9 BIOS/.test(t) && /ใส่แล้ว/.test(t)), 'ARM9 slot is inserted');
    ok(slots.some(t => /Firmware/.test(t) && /ไม่ได้ใส่ \(ไม่บังคับ\)/.test(t)), 'Firmware slot says it is optional');
    ok(/พร้อมแล้ว/.test(await page.textContent('#note')), 'note says the cabinet is ready without firmware');

    await page.click('#shelf [data-play]');
    await sleep(400);
    const toast = await page.textContent('#toast');
    ok(!/BIOS/.test(toast) || /แกนจำลอง/.test(toast), `gate passes without firmware (toast: ${toast})`);
    ok(/แกนจำลอง/.test(toast), 'gate reached the core check (core not ready in this build)');
    await ctx.close();
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
