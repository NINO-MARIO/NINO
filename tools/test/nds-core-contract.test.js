/* ห้อง NDS: สัญญาแกนจำลอง (games/nds/core-contract.js).
   - NDS_CORE.check: แกนครบ/ขาด, แกนทดสอบ/แกนจริง
   - หน้าห้อง: แกนขาดสัญญาไม่ถูกใช้, ข้อความโหมดทดสอบขึ้นเฉพาะแกนทดสอบ
   Run: node tools/test/nds-core-contract.test.js */
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
const FULL = `{version:'ENGINE-1.0',loadBios:function(k,b){return{ok:true};},loadRom:function(b){return{ok:true,title:'T',code:'C',size:b.length};},runFrame:function(){},framebuffer:function(){return new Uint8Array(256*384*4);}}`;
const TEST = FULL.replace("version:'ENGINE-1.0'", "version:'TEST-STUB'");
const MISSING_FB = FULL.replace(/,framebuffer:function\(\)\{return new Uint8Array\(256\*384\*4\);\}/, '');

async function roomWithCore(browser, base, coreExpr) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(url => !url.href.startsWith(base), r => r.abort());
  await ctx.route('**/wasm_exec.js', r => r.fulfill({ contentType: 'text/javascript', body:
    'window.Go=function(){this.importObject={};this.run=function(){window.ndsCore=(' + coreExpr + ');return Promise.resolve();};};' }));
  await ctx.route('**/core.wasm', r => r.fulfill({ contentType: 'application/wasm', body: Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]) }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e)));
  await page.goto(base + '/games/nds/index.html', { waitUntil: 'load' });
  await sleep(1100);
  return { ctx, page, errs };
}

(async () => {
  const srv = server();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    console.log('== 1. the contract check');
    {
      const { ctx, page, errs } = await roomWithCore(browser, base, FULL);
      const r = await page.evaluate(() => ({
        full: NDS_CORE.check({ version: 'x', loadBios() {}, loadRom() {}, runFrame() {}, framebuffer() {} }),
        none: NDS_CORE.check(null),
        test: NDS_CORE.check({ version: 'phase0a', loadBios() {}, loadRom() {}, runFrame() {}, framebuffer() {} }),
      }));
      ok(r.full.ok && r.full.missing.length === 0, 'a complete core passes the contract');
      ok(!r.full.isTest, 'a non-test version is not reported as a test core');
      ok(!r.none.ok, 'no core fails the contract');
      ok(r.test.isTest, 'version phase0a is reported as a test core');
      ok(errs.length === 0, 'contract script loads without errors');
      await ctx.close();
    }

    console.log('== 2. a real-looking core: ready, no test notice');
    {
      const { ctx, page } = await roomWithCore(browser, base, FULL);
      ok(/แกนจำลอง: พร้อม/.test(await page.textContent('#core')), 'core reported ready');
      ok(await page.$eval('#testnote', el => el.hidden), 'test notice is hidden for a non-test core');
      await ctx.close();
    }

    console.log('== 3. a test core: ready, test notice shown');
    {
      const { ctx, page } = await roomWithCore(browser, base, TEST);
      ok(/แกนจำลอง: พร้อม/.test(await page.textContent('#core')), 'test core reported ready');
      ok(!(await page.$eval('#testnote', el => el.hidden)), 'test notice is shown for a test core');
      await ctx.close();
    }

    console.log('== 4. a core that breaks the contract is not used');
    {
      const { ctx, page, errs } = await roomWithCore(browser, base, MISSING_FB);
      const coreText = await page.textContent('#core');
      ok(!/แกนจำลอง: พร้อม/.test(coreText), 'core with no framebuffer is not reported ready');
      ok(/framebuffer/.test(coreText), `status names the missing piece (${coreText.slice(0, 80)})`);
      ok(errs.length === 0, 'no page errors (' + errs.slice(0, 2).join(' | ') + ')');
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
