/* ห้อง NDS: ตรวจขั้นตอนที่ผู้เล่นทำได้จริงจนถึงหน้าเกม
   Run: node tools/test/nds-flow.test.js
   - ไม่มี BIOS/firmware จริงในเทสต์: ใช้ไฟล์ทดสอบที่มีขนาดถูกต้องแต่เนื้อเป็นศูนย์ เพื่อผ่านด่านขนาดเท่านั้น
   - ไม่มีเอนจินจริง: ใช้ "แกนปลอม" (window.ndsCore) เพื่อตรวจว่าปุ่มเปิดหน้าเกมทำงาน ไม่ได้ตรวจว่าเกมเล่นได้จริง
   Needs playwright + chromium (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers on this machine). */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('  FAIL: ' + name); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadPlaywright() {
  const tries = ['playwright', '/opt/npm-tools/node_modules/playwright', path.join(process.env.HOME || '', '.npm-global/lib/node_modules/playwright')];
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error('playwright is not installed');
}

const MIMEA = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.md': 'text/plain' };
function server() {
  return http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIMEA[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
}

// a minimal .nds header: title at 0..11, game code at 12..15
function fakeNds(title, code) {
  const b = Buffer.alloc(0x400);
  b.write(title, 0, 'ascii'); b.write(code, 12, 'ascii');
  return b;
}

(async () => {
  const srv = server();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route(url => !url.href.startsWith(base), r => r.abort());
    // สถานะตั้งต้นของเทสต์นี้ = บิลด์ที่ไม่มีแกน (ไม่มี wasm_exec.js และ core.wasm)
    // ตัวบิลด์จริงมีแกนแล้ว เทสต์ส่วนนี้จึงตัดไฟล์แกนออกเองเพื่อคงเงื่อนไขเดิม
    await ctx.route('**/wasm_exec.js', r => r.abort());
    await ctx.route('**/core.wasm', r => r.abort());
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message || e)));

    console.log('== 1. the room opens and says the core is not ready (no wasm in this build)');
    await page.goto(base + '/games/nds/index.html', { waitUntil: 'load' });
    await sleep(1200);
    const core0 = await page.textContent('#core');
    ok(/ยังไม่พร้อม/.test(core0) || /ไม่พบ/.test(core0), `core status shown (${core0})`);
    const biosRows = await page.$$eval('#bios .slot', els => els.map(e => e.textContent));
    ok(biosRows.length === 3, 'three BIOS slots shown');
    ok(biosRows.some(t => /ARM7 BIOS/.test(t) && /ยังไม่ใส่/.test(t)), 'ARM7 BIOS slot says not inserted');

    console.log('== 2. insert a cartridge, it appears on the shelf');
    const bad = path.join(require('os').tmpdir(), 'nino-nds-not-a-rom.txt');
    fs.writeFileSync(bad, 'hello');
    await page.setInputFiles('#add', bad);
    await sleep(400);
    ok(await page.evaluate(() => document.getElementById('toast').textContent).then(t => /ไม่ใช่ .nds/.test(t)), 'non-.nds file is refused');
    const rom = path.join(require('os').tmpdir(), 'nino-test-cart.nds');
    fs.writeFileSync(rom, fakeNds('TESTCART', 'ABCD'));
    await page.setInputFiles('#add', rom);
    await sleep(900);
    const shelf = await page.$$eval('#shelf [data-play]', els => els.map(e => e.textContent));
    ok(shelf.some(t => /TESTCART/.test(t)), `cartridge is on the shelf (${shelf.join(' | ')})`);

    console.log('== 3. click the cartridge: BIOS gate first');
    await page.click('#shelf [data-play]');
    await sleep(400);
    let toast = await page.textContent('#toast');
    ok(/BIOS/.test(toast), `asks for the three BIOS files (${toast})`);
    ok(!(await page.$eval('#play', el => el.classList.contains('on'))), 'game page stays closed without BIOS');

    console.log('== 4. BIOS files of the right size are accepted (test files, not real BIOS)');
    const sizes = { bios7: 16384, bios9: 4096, firmware: 262144 };
    for (const k of Object.keys(sizes)) {
      const f = path.join(require('os').tmpdir(), `nino-test-${k}.bin`);
      fs.writeFileSync(f, Buffer.alloc(sizes[k]));
      await page.setInputFiles(`input[data-bios="${k}"]`, f);
      await sleep(500);
    }
    const slots = await page.$$eval('#bios .slot', els => els.map(e => e.textContent));
    ok(slots.every(t => /ใส่แล้ว/.test(t)), 'all three slots say inserted');

    console.log('== 5. click again: the core is still not ready, so the game page does not open');
    await page.click('#shelf [data-play]');
    await sleep(400);
    toast = await page.textContent('#toast');
    ok(/แกนจำลองยังไม่พร้อม/.test(toast), `core-not-ready message (${toast})`);
    ok(!(await page.$eval('#play', el => el.classList.contains('on'))), 'game page still closed');
    await ctx.close();

    console.log('== 6. with a TEST core stub, the click opens the game page and Escape closes it');
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx2.route(url => !url.href.startsWith(base), r => r.abort());
    // stand-in for wasm_exec.js and core.wasm: it only proves the page wiring, it is not an emulator
    await ctx2.route('**/wasm_exec.js', r => r.fulfill({ contentType: 'text/javascript', body:
      "window.Go=function(){this.importObject={};this.run=function(){window.ndsCore={version:'TEST-STUB',loadRom:function(b){return{ok:true};},loadBios:function(k,b){return{ok:true};},runFrame:function(){},framebuffer:function(){return new Uint8Array(256*384*4);}};return Promise.resolve();};};" }));
    await ctx2.route('**/core.wasm', r => r.fulfill({ contentType: 'application/wasm', body: Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]) }));
    const p2 = await ctx2.newPage();
    const errors2 = [];
    p2.on('pageerror', e => errors2.push(String(e.message || e)));
    await p2.goto(base + '/games/nds/index.html', { waitUntil: 'load' });
    await sleep(1000);
    // data from step 2-4 lives in the first context, so insert again in this one
    await p2.setInputFiles('#add', rom);
    await sleep(900);
    for (const k of Object.keys(sizes)) {
      const f = path.join(require('os').tmpdir(), `nino-test-${k}.bin`);
      await p2.setInputFiles(`input[data-bios="${k}"]`, f);
      await sleep(500);
    }
    ok((await p2.textContent('#core')).indexOf('TEST-STUB') >= 0, 'test stub core reported ready');
    await p2.click('#shelf [data-play]');
    await sleep(700);
    const playOpen = await p2.$eval('#play', el => el.classList.contains('on'));
    ok(playOpen, 'clicking the cartridge opens the game page');
    const title = await p2.textContent('#play-title');
    ok(/TESTCART/.test(title), `game page shows the cartridge title (${title})`);
    ok(await p2.isVisible('#screen'), 'game screen is visible');
    await p2.keyboard.press('Escape');
    await sleep(300);
    ok(!(await p2.$eval('#play', el => el.classList.contains('on'))), 'Escape closes the game page');
    ok(errors.length === 0 && errors2.length === 0, 'no page errors (' + [...errors, ...errors2].slice(0, 3).join(' | ') + ')');
    await ctx2.close();
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
