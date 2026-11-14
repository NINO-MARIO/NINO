/* Offline test for the Outlaw Immortals game in NINO (web/PWA path). Run: node tools/test/outlaw-offline.test.js
   1. serve the repo, open the app ONCE online, so the service worker installs and precaches the game
      (the game is never opened here: first-time offline must work too)
   2. wait until every file in games/outlaw/offline-files.json is in the cache
   3. cut the network (outside hosts and this server), reload the app, open the game
   4. the game must never attempt a request to the publisher's server (gamedropdaily.com)
   5. the game must draw (a canvas inside the frame) and the launcher must not show its failure message
   Saves a screenshot to $NINO_SHOTS (default /tmp/nino-shots). Needs playwright + chromium. */
const http = require('http'), fs = require('fs'), path = require('path');
const { ROOT } = require('./harness.js');
const SHOTS = process.env.NINO_SHOTS || '/tmp/nino-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('  FAIL: ' + name); } }

function loadPlaywright() {
  const tries = ['playwright', '/opt/npm-tools/node_modules/playwright', path.join(process.env.HOME || '', '.npm-global/lib/node_modules/playwright')];
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error('playwright is not installed (npm i playwright && npx playwright install chromium)');
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8' };

(async () => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/build-info.json') { res.writeHead(404); return res.end(); }
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    // nothing leaves the machine: only this server answers
    await ctx.route(url => !url.href.startsWith(base), r => r.abort());
    // skip NINO's first-run chooser so the game is visible (same flag the browser harness sets)
    await ctx.addInitScript(() => { try { localStorage.setItem('nino.local.welcome', '1'); } catch (e) { /* ignore */ } });
    const page = await ctx.newPage();
    const pageErrors = [];
    // the game must never try to reach the publisher's servers (time, A/B, telemetry, account, activation)
    const publisherHits = [];
    page.on('request', r => { if (/gamedropdaily/i.test(r.url())) publisherHits.push(r.url()); });
    page.on('pageerror', e => pageErrors.push(String(e.message || e)));

    console.log('== online install: service worker precaches the game');
    await page.goto(base + '/index.html', { waitUntil: 'load' });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)).catch(() => null);
    await page.waitForLoadState('load').catch(() => null);
    const started = Date.now();
    let missing = -1, total = 0;
    while (Date.now() - started < 180000) {
      const r = await page.evaluate(async () => {
        const keys = await caches.keys();
        const name = keys.find(k => /^nino-v\d/.test(k));
        if (!name) return { missing: -1, total: 0 };
        const c = await caches.open(name);
        const list = await (await fetch('games/outlaw/offline-files.json', { cache: 'no-cache' })).json();
        let miss = 0;
        for (const p of list) if (!(await c.match('./' + p))) miss++;
        return { missing: miss, total: list.length };
      }).catch(() => null); // the app may reload itself once the worker takes control; poll again
      if (r) { missing = r.missing; total = r.total; }
      if (total > 0 && missing === 0) break;
      await sleep(1000);
    }
    ok(total > 1000 && missing === 0, `game fully precached (${total - Math.max(missing, 0)}/${total} files)`);

    console.log('== offline: reload the app, open the game');
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await sleep(1500);
    const opened = await page.evaluate(() => { window.ninoOutlaw.open(); return !!document.getElementById('outlaw-root'); }).catch(() => false);
    ok(opened, 'launcher opens');

    let drawn = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 60000 && !drawn) {
      for (const fr of page.frames()) {
        if (!/games\/outlaw\/index\.html/.test(fr.url())) continue;
        drawn = await fr.evaluate(() => !!document.querySelector('canvas')).catch(() => false);
        if (drawn) break;
      }
      if (!drawn) await sleep(500);
    }
    ok(drawn, 'game draws a canvas with the network cut');
    const msgText = await page.evaluate(() => (document.getElementById('ol-msg') || {}).textContent || '');
    const msgHidden = await page.evaluate(() => { const m = document.getElementById('ol-msg'); return !m || m.classList.contains('done'); });
    await sleep(500);
    ok(msgHidden, `launcher message hidden once the game draws (text: "${msgText}")`);
    await page.screenshot({ path: SHOTS + '/outlaw-offline.png' });
    const realErrors = pageErrors.filter(e => !/Failed to fetch|NetworkError|net::|Load failed/i.test(e));
    ok(realErrors.length === 0, 'no uncaught page errors: ' + realErrors.slice(0, 3).join(' | '));
    ok(publisherHits.length === 0, 'no request to the publisher server (gamedropdaily): ' + publisherHits.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\npassed ${pass}, failed ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL: ' + (e && e.stack || e)); process.exit(1); });
