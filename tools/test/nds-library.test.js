/* ห้อง NDS: คลังตลับ ส่งออก/นำเข้า. ตรวจ: ไฟล์ส่งออกมีตลับ+เซฟ+การตั้งค่า แต่ไม่มี BIOS,
   นำเข้าในโปรไฟล์ใหม่แล้วตลับขึ้นชั้น, ไฟล์ที่ไม่ใช่คลังถูกปฏิเสธ.
   Run: node tools/test/nds-library.test.js */
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

(async () => {
  const srv = server();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const newPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route(url => !url.href.startsWith(base), r => r.abort());
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message || e)));
    await page.goto(base + '/games/nds/index.html', { waitUntil: 'load' });
    await sleep(900);
    return { ctx, page, errs };
  };
  const exported = path.join(os.tmpdir(), 'nino-library-export.json');
  try {
    console.log('== 1. export a library with one cartridge');
    const a = await newPage();
    const rom = path.join(os.tmpdir(), 'nino-lib-test.nds');
    const hdr = Buffer.alloc(0x400); hdr.write('LIBTEST', 0, 'ascii'); hdr.write('LIBT', 12, 'ascii');
    fs.writeFileSync(rom, hdr);
    await a.page.setInputFiles('#add', rom);
    await sleep(900);
    const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#lib-export')]);
    await dl.saveAs(exported);
    const text = fs.readFileSync(exported, 'utf8');
    const obj = JSON.parse(text);
    ok(obj.format === 'nino-nds-library' && obj.roms.length === 1, 'export has the format tag and one cartridge');
    ok(obj.roms[0].meta.title === 'LIBTEST', `export keeps the cartridge title (${obj.roms[0].meta.title})`);
    ok(!/"bios/i.test(text) && !/biosfree/i.test(text), 'export contains no BIOS files');
    ok(a.errs.length === 0, 'no page errors while exporting');
    await a.ctx.close();

    console.log('== 2. import into a fresh profile: the cartridge is back on the shelf');
    const b = await newPage();
    ok((await b.page.$$eval('#shelf [data-play]', els => els.length)) === 0, 'the fresh shelf is empty');
    await b.page.setInputFiles('#lib-file', exported);
    await sleep(1200);
    const titles = await b.page.$$eval('#shelf [data-play]', els => els.map(e => e.textContent));
    ok(titles.some(t => /LIBTEST/.test(t)), `the imported cartridge is on the shelf (${titles.join('|')})`);
    await b.page.reload({ waitUntil: 'load' });
    await sleep(900);
    const again = await b.page.$$eval('#shelf [data-play]', els => els.map(e => e.textContent));
    ok(again.some(t => /LIBTEST/.test(t)), 'the imported cartridge survives a reload');
    ok(b.errs.length === 0, 'no page errors while importing');
    await b.ctx.close();

    console.log('== 3. a file that is not a library is refused');
    const c = await newPage();
    const bad = path.join(os.tmpdir(), 'nino-not-library.json');
    fs.writeFileSync(bad, JSON.stringify({ hello: 1 }));
    await c.page.setInputFiles('#lib-file', bad);
    await sleep(500);
    ok(/ไม่ใช่คลังตลับของ NINO/.test(await c.page.textContent('#toast')), 'a non-library file gets a clear message');
    ok((await c.page.$$eval('#shelf [data-play]', els => els.length)) === 0, 'nothing is added from a refused file');
    await c.ctx.close();
    console.log('== 4. inside the native app: no fake success for the export');
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.route(url => !url.href.startsWith(base), r => r.abort());
      await ctx.addInitScript(() => { window.ninoNative = { call() { return Promise.resolve({}); } }; });
      const page = await ctx.newPage();
      await page.goto(base + '/games/nds/index.html', { waitUntil: 'load' });
      await sleep(900);
      let downloads = 0;
      page.on('download', () => { downloads++; });
      await page.click('#lib-export');
      await sleep(800);
      ok(downloads === 0, 'no download is started inside the app');
      ok(/แอปรุ่นนี้ยังบันทึกไฟล์ไม่ได้/.test(await page.textContent('#toast')), 'an old app (bridge below 4) says saving is not available yet');
      await ctx.close();
    }
    console.log('== 5. app with bridge 4: the file goes through saveFile, and a cancel is not reported as saved');
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.route(url => !url.href.startsWith(base), r => r.abort());
      await ctx.addInitScript(() => {
        window.__calls = [];
        window.__reply = { saved: true };
        window.ninoNative = { bridge: 4, call(op, p) { window.__calls.push(op); window.__last = p; return Promise.resolve(window.__reply); } };
      });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(String(e.message || e)));
      let downloads = 0;
      page.on('download', () => { downloads++; });
      await page.goto(base + '/games/nds/index.html', { waitUntil: 'load' });
      await sleep(900);
      await page.click('#lib-export');
      await sleep(700);
      const calls = await page.evaluate(() => window.__calls);
      const last = await page.evaluate(() => ({ name: window.__last.name, mime: window.__last.mime, len: window.__last.data.length }));
      ok(calls.includes('saveFile'), 'the export asks the app to save the file');
      ok(last.name === 'NINO-nds-library.json' && last.mime === 'application/json' && last.len > 100, `the saved file carries the library (${JSON.stringify(last)})`);
      ok(downloads === 0, 'no browser download happens inside the app');
      ok(/บันทึกคลังตลับแล้ว/.test(await page.textContent('#toast')), 'a saved library is reported as saved');
      await page.evaluate(() => { window.__reply = { error: 'cancelled' }; });
      await page.click('#lib-export');
      await sleep(700);
      ok(/ยังไม่ได้บันทึก: cancelled/.test(await page.textContent('#toast')), 'a cancelled save is not reported as saved');
      ok(errs.length === 0, 'no page errors in the app path (' + errs.slice(0, 2).join(' | ') + ')');
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
