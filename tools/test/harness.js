/* Browser test harness: serves the repo over http, injects the native bridge mock, exposes real screenshots as /snaps/. */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain', '.webmanifest': 'application/json' };

function loadPlaywright() {
  const tries = ['playwright', '/opt/npm-tools/node_modules/playwright', path.join(process.env.HOME || '', '.npm-global/lib/node_modules/playwright')];
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error('playwright is not installed (npm i playwright && npx playwright install chromium)');
}

async function start(opts = {}) {
  const shots = new Map();
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const m = /^\/snaps\/([\w-]+)\.jpg$/.exec(u);
    if (m) { const b = shots.get(m[1]); if (!b) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); return res.end(b); }
    if (u === '/build-info.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(opts.buildInfo || { commit: 'base0000', run: 40, version: '2.9.0' })); }
    let f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port, base = `http://127.0.0.1:${port}`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: false });
  await ctx.addInitScript(() => { window.NINO_CI_POLL = 150; window.NINO_AFTER_MS = 1500; try { localStorage.setItem('nino.local.welcome', '1'); } catch (e) { /* first-run chooser is a separate feature */ } });
  await ctx.addInitScript({ path: path.join(__dirname, 'native-mock.js') });
  // nothing leaves the machine: CDN scripts fail fast, GitHub API is answered by the test
  await ctx.route(url => !url.href.startsWith(base), r => r.abort());
  const page = await ctx.newPage();
  const errors = [], logs = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  const ops = [], T0 = Date.now();
  page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); else if (m.text().startsWith('[mock-op]')) ops.push(((Date.now() - T0) / 1000).toFixed(1) + 's ' + m.text().slice(10)); });
  let seq = 0;
  await page.exposeFunction('__shot', async () => {
    const buf = await page.screenshot({ type: 'png' });
    const id = 'shot' + (++seq); shots.set(id, buf);
    return { id, w: 390, h: 844, bytes: buf.length };
  });
  return { page, ctx, browser, server, base, errors, logs, shots, ops, close: async () => { await browser.close(); server.close(); } };
}
module.exports = { start, ROOT };
