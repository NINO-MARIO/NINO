/* Persistent in-device copy of a website (js/site-dl.js). Run: node tools/test/site168-copy.test.js
   Fixture: a site with CORS, the same site under /nocors/ without CORS.
   1. download into IndexedDB; the old Cache Storage name is not used
   2. the clear-cache button (ninoHardRefresh) does not remove the copy
   3. cut the fixture off, reload the app: the copy opens in a sandboxed frame, JS/CSS/images work,
      the frame cannot read the app's localStorage, links between pages work offline
   4. backup to a JSON file, import it in a fresh profile, opens offline
   5. an old Cache Storage copy is moved to IndexedDB on start and the old cache is removed
   6. a site without CORS fails with a clear message
   Needs playwright + chromium (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers on this machine). */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('  FAIL: ' + name); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadPlaywright() {
  const tries = ['playwright', '/opt/npm-tools/node_modules/playwright', path.join(process.env.HOME || '', '.npm-global/lib/node_modules/playwright')];
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error('playwright is not installed (npm i playwright && npx playwright install chromium)');
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FIX = {
  '/index.html': '<!doctype html><html><head><meta charset="utf-8"><title>fixture</title><link rel="stylesheet" href="/style.css"></head>'
    + '<body><h1 id="h">ROOT</h1><img id="pic" src="/img/pic.png" alt=""><p id="out">waiting</p>'
    + '<a id="go" href="/sub/page.html">next</a><script src="/app.js" defer></script></body></html>',
  '/style.css': '#h{color:rgb(255,0,0)} #bg{background:url(/img/pic.png)}',
  '/app.js': "document.getElementById('out').textContent='JS-OK';",
  '/img/pic.png': PNG,
  '/sub/page.html': '<!doctype html><html><head><meta charset="utf-8"><title>p2</title></head><body><h1 id="h">PAGE2</h1><a id="back" href="/">home</a></body></html>',
};
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };

function fixtureServer() {
  return http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    const nocors = u.startsWith('/nocors/');
    if (nocors) u = u.slice('/nocors'.length) || '/';
    if (u === '/') u = '/index.html';
    const body = FIX[u];
    if (body === undefined) { res.writeHead(404); return res.end('nf'); }
    const h = { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' };
    if (!nocors) h['Access-Control-Allow-Origin'] = '*';
    res.writeHead(200, h);
    res.end(body);
  });
}

function appServer() {
  const MIMEA = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
  return http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/build-info.json') { res.writeHead(404); return res.end(); }
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIMEA[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
}

// the copy's frame is found by its name (set in js/site168.js)
function copyFrame(page) { return page.frame({ name: 's168-frame' }); }
async function probe(page, settled) {
  let last = null;
  for (let i = 0; i < 40; i++) {
    const f = copyFrame(page);
    if (f) {
      await f.waitForLoadState('load', { timeout: 3000 }).catch(() => null);
      const r = await f.evaluate(() => {
        const g = id => document.getElementById(id);
        if (!g('h')) return null;
        let storageAccess = 'blocked';
        try { parent.localStorage.getItem('x'); storageAccess = 'readable'; } catch (e) { /* expected: sandboxed */ }
        return {
          js: g('out') ? g('out').textContent : null,
          imgOk: g('pic') ? g('pic').naturalWidth > 0 : null,
          color: g('h') ? getComputedStyle(g('h')).color : null,
          h: g('h') ? g('h').textContent : null,
          storageAccess,
        };
      }).catch(() => null);
      if (r) last = r;
      // ค่าที่อ่านทันทีหลังหน้าโหลด ยังไม่รวมรูปที่เพิ่งโหลดเสร็จ จึงรอให้ตรงเงื่อนไขก่อน
      if (r && (!settled || settled(r))) return r;
    }
    await sleep(300);
  }
  return last;
}
async function clickIn(page, id) {
  const f = copyFrame(page);
  await f.evaluate(i => document.getElementById(i).click(), id);
  await sleep(900);
}
async function openApp(page, base) {
  for (let i = 0; i < 5; i++) {
    await page.goto(base + '/index.html', { waitUntil: 'load' }).catch(() => null);
    await sleep(1200);
    if (await page.evaluate(() => !!window.nino168dl).catch(() => false)) return true;
  }
  return false;
}

(async () => {
  const fx = fixtureServer(), app = appServer();
  await new Promise(r => fx.listen(0, '127.0.0.1', r));
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  const fxBase = `http://127.0.0.1:${fx.address().port}`;
  const appBase = `http://127.0.0.1:${app.address().port}`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const newCtx = async (siteBase) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c.addInitScript((b) => { window.NINO_SITE168_BASE = b; try { localStorage.setItem('nino.local.welcome', '1'); localStorage.setItem('nino.test.secret', 'k-1234'); } catch (e) { /* ignore */ } }, siteBase);
    await c.route(url => !url.href.startsWith(appBase) && !url.href.startsWith(fxBase), r => r.abort());
    return c;
  };
  try {
    // ---------- 1-4 ----------
    const ctx = await newCtx(fxBase + '/');
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message || e)));

    console.log('== 1. download into the device');
    ok(await openApp(page, appBase), 'app loaded');
    const meta = await page.evaluate(() => window.nino168dl.download(() => {})).catch(e => ({ error: String(e) }));
    ok(meta && meta.pages === 2, `two pages converted (got ${meta && (meta.pages ?? meta.error)})`);
    ok(meta && meta.files >= 5, `all files stored (got ${meta && meta.files})`);
    ok(meta && typeof meta.persisted === 'boolean', 'persistence status reported');
    const names = await page.evaluate(() => caches.keys());
    ok(names.indexOf('nino-site168') < 0, 'copy is not in Cache Storage any more');

    console.log('== 2. the clear-cache button keeps the copy');
    await page.evaluate(() => { window.ninoHardRefresh(); }).catch(() => null);
    await sleep(2500);
    ok(await openApp(page, appBase), 'app reloaded after clear-cache');
    const after = await page.evaluate(() => window.nino168dl.status());
    ok(after && after.pages === 2, `copy survives clear-cache (${after && after.pages})`);

    console.log('== 3. offline: copy opens sandboxed, works, links stay inside');
    await page.evaluate(() => window.nino168.open());
    const first = await probe(page);
    ok(first && first.js === 'JS-OK', `inlined JS ran (${first && first.js})`);
    ok(first && first.imgOk, 'inlined image loaded');
    ok(first && first.color === 'rgb(255, 0, 0)', `inlined CSS applied (${first && first.color})`);
    ok(first && first.storageAccess === 'blocked', 'copy cannot read the app localStorage (sandbox)');
    await ctx.route(url => url.href.startsWith(fxBase), r => r.abort());   // the internet is gone
    ok(await openApp(page, appBase), 'app reloaded offline');
    await page.evaluate(() => window.nino168.open());
    const offline = await probe(page);
    ok(offline && offline.js === 'JS-OK' && offline.imgOk, 'copy works offline after reload');
    await clickIn(page, 'go');
    const p2 = await probe(page);
    ok(p2 && p2.h === 'PAGE2', `link opens the second page offline (${p2 && p2.h})`);
    await clickIn(page, 'back');
    const p3 = await probe(page);
    ok(p3 && p3.h === 'ROOT', `back link returns to the first page (${p3 && p3.h})`);
    ok(errors.length === 0, 'no page errors (' + errors.slice(0, 3).join(' | ') + ')');

    console.log('== 4. backup file');
    const backup = await page.evaluate(async () => (await window.nino168dl.exportCopy()).text());
    ok(backup && backup.indexOf('"format":"nino-site168"') >= 0, 'backup file produced');
    await ctx.close();

    console.log('== 4b. import the backup in a fresh profile (internet gone)');
    const ctxB = await newCtx(fxBase + '/');
    await ctxB.route(url => url.href.startsWith(fxBase), r => r.abort());
    // การรีโหลดหลังได้ service worker ครั้งแรก (js/boot.js) จะทำลายหน้าที่เปิดสำเนาไว้ในการทดสอบนี้
    // ตั้งเวลาล่าสุดของการรีโหลดให้เป็นอนาคต เพื่อให้ตัวจัดการข้ามการรีโหลด (กันทดสอบ flake)
    await ctxB.addInitScript(() => { try { sessionStorage.setItem('nino-sw-reload-ts', String(Date.now() + 1e10)); } catch (e) { /* ไม่มี sessionStorage */ } });
    const pb = await ctxB.newPage();
    ok(await openApp(pb, appBase), 'fresh app loaded');
    const none = await pb.evaluate(() => window.nino168dl.status());
    ok(none === null, 'fresh profile has no copy');
    const imp = await pb.evaluate(async (txt) => {
      const f = new File([txt], 'backup.json', { type: 'application/json' });
      return window.nino168dl.importCopy(f);
    }, backup).catch(e => ({ error: String((e && e.message) || e) }));
    ok(imp && imp.pages === 2, `backup imported (${imp && (imp.pages ?? imp.error)})`);
    await pb.evaluate(() => window.nino168.open());
    const restored = await probe(pb, r => r.imgOk === true);
    ok(restored && restored.js === 'JS-OK' && restored.imgOk, 'imported copy opens offline');
    await ctxB.close();

    console.log('== 5. old Cache Storage copy is moved to IndexedDB');
    const ctxM = await newCtx(fxBase + '/');
    await ctxM.route(url => url.href.startsWith(fxBase), r => r.abort());
    const pm = await ctxM.newPage();
    ok(await openApp(pm, appBase), 'app loaded for migration');
    await pm.evaluate(async () => {
      const c = await caches.open('nino-site168');
      const u = k => new URL('__site168/' + k, document.baseURI).href;
      await c.put(u('meta.json'), new Response(JSON.stringify({ savedAt: 1, base: 'x', root: 'index.html', files: 1, pages: 1, skipped: 0 }), { headers: { 'Content-Type': 'application/json' } }));
      await c.put(u('page/index.html'), new Response('<!doctype html><html><body><h1 id=\"h\">OLD</h1><p id="out">OLD-COPY</p></body></html>', { headers: { 'Content-Type': 'text/html' } }));
      await c.put(u('raw/index.html'), new Response('<!doctype html><html><body>OLD</body></html>', { headers: { 'Content-Type': 'text/html' } }));
    });
    ok(await openApp(pm, appBase), 'app reloaded to run migration');
    const mig = await pm.evaluate(async () => ({ st: await window.nino168dl.status(), names: await caches.keys() }));
    ok(mig.st && mig.st.pages === 1, 'migrated copy is visible in IndexedDB');
    ok(mig.names.indexOf('nino-site168') < 0, 'old Cache Storage copy removed after migration');
    await pm.evaluate(() => window.nino168.open());
    const mp = await probe(pm);
    ok(mp && mp.js === 'OLD-COPY', `migrated page is served from the copy (${mp && mp.js})`);
    await ctxM.close();

    console.log('== 6. a site that does not allow reading across sites');
    const ctx2 = await newCtx(fxBase + '/nocors/');
    const p2x = await ctx2.newPage();
    await openApp(p2x, appBase);
    const err = await p2x.evaluate(() => window.nino168dl.download(() => {}).then(() => 'no-error', e => String((e && e.message) || e)));
    ok(err !== 'no-error' && err.indexOf('เข้าถึงเว็บ') >= 0, `download fails with the message (${err})`);
    await ctx2.close();
  } finally {
    await browser.close();
    fx.close(); app.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
