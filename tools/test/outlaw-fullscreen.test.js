/* Fullscreen for the Outlaw Immortals overlay, web side. Run: node tools/test/outlaw-fullscreen.test.js
   1. an older APK (no "immersive" op): the overlay still works, the attempt is made once, nothing throws
   2. a newer APK (answers "immersive"): on open the bars are hidden, on close they come back, fullscreen never reloads the iframe
   3. the fullscreen toggle hides .ol-top, the exit button stays on top and is clickable, the stage fills the screen
   4. back() leaves fullscreen first, then closes the game; Esc does the same on the page and inside the game frame
   5. the game canvas refits the resized iframe (Phaser follows the iframe size)
   The native side is the shared test double (native-mock.js); this test only answers "immersive" for the newer APK.
   Needs playwright + chromium. Saves screenshots to $NINO_SHOTS (default /tmp/nino-shots). */
const http = require('http'), fs = require('fs'), path = require('path');
const { ROOT } = require('./harness.js');
const SHOTS = process.env.NINO_SHOTS || '/tmp/nino-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('  FAIL: ' + name); } }
function section(s) { console.log('== ' + s); }

function loadPlaywright() {
  const tries = ['playwright', '/opt/npm-tools/node_modules/playwright', path.join(process.env.HOME || '', '.npm-global/lib/node_modules/playwright')];
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error('playwright is not installed (npm i playwright && npx playwright install chromium)');
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

/* Wraps the mock's postMessage: "immersive" is answered only when this session simulates a newer APK. */
function wrapNative(newApk) {
  return `(function(){
  var NN = window.NinoNative; if (!NN) return;
  var orig = NN.postMessage.bind(NN);
  window.__imm = { sent: [], attempts: 0, native: ${newApk ? 'true' : 'false'} };
  NN.postMessage = function (s) {
    var m = JSON.parse(s);
    if (m.op === 'immersive') {
      window.__imm.attempts++;
      if (window.__imm.native) {
        window.__imm.sent.push(!!m.on);
        setTimeout(function () { NN.onmessage && NN.onmessage({ data: JSON.stringify({ id: m.id, done: true }) }); }, 0);
        return;
      }
    }
    return orig(s);
  };
})();`;
}

async function session(newApk) {
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
  const ctx = await browser.newContext({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 1 });
  await ctx.route(url => !url.href.startsWith(base), r => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('nino.local.welcome', '1'); } catch (e) { /* ignore */ } });
  await ctx.addInitScript({ path: path.join(ROOT, 'tools/test/native-mock.js') });
  await ctx.addInitScript({ content: wrapNative(newApk) });
  const page = await ctx.newPage();
  const errors = [], navs = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('framenavigated', f => navs.push(f.url().replace(base, '')));
  return {
    page, errors, navs, base,
    close: async () => { await browser.close(); server.close(); },
  };
}

/* The app reloads once when the service worker takes control; wait until it is stable and controlled. */
async function settle(P, base) {
  await P.goto(base + '/index.html', { waitUntil: 'load' });
  const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch (e) { /* navigating */ } await sleep(300); } return false; };
  await until(() => P.evaluate(() => !!document.getElementById('btn-outlaw')), 20000);
  await until(() => P.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)), 40000);
  await sleep(1500);
  await until(() => P.evaluate(() => !!document.getElementById('btn-outlaw')), 20000);
  await sleep(800);
}

const state = P => P.evaluate(() => {
  const r = document.getElementById('outlaw-root'), f = document.getElementById('ol-frame');
  const top = r && r.querySelector('.ol-top');
  return {
    on: !!r && r.classList.contains('on'),
    full: !!r && r.classList.contains('ol-full'),
    topDisplay: top ? getComputedStyle(top).display : 'none',
    src: f ? f.getAttribute('src') : null,
    pressed: (document.getElementById('ol-full') || { getAttribute: () => null }).getAttribute('aria-pressed'),
  };
});

async function waitFor(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (await fn()) return true; } catch (e) { /* retry */ } await sleep(150); }
  return false;
}

(async () => {
  /* ---------------------------------------------------------------- older APK */
  section('older APK: no "immersive" op');
  const old = await session(false);
  try {
    const P = old.page;
    await settle(P, old.base);
    ok(await P.evaluate(() => typeof window.ninoOutlaw === 'object'), 'ninoOutlaw is exposed');
    ok(await P.evaluate(() => typeof window.ninoOutlaw.back === 'function'), 'ninoOutlaw.back is exposed');
    await P.evaluate(() => window.ninoOutlaw.open());
    await sleep(400);
    let s = await state(P);
    ok(s.on && !s.full, 'open shows the overlay, not fullscreen');
    ok(await P.evaluate(() => window.__imm.attempts) === 1, 'older APK: "immersive" tried once');
    ok(old.errors.length === 0, 'no page errors on open: ' + old.errors.slice(0, 2).join(' | '));

    await P.click('#ol-full');
    s = await state(P);
    ok(s.full && s.topDisplay === 'none', 'fullscreen button hides .ol-top');
    ok(s.src === 'games/outlaw/index.html', 'fullscreen keeps the iframe src (no reload, no about:blank)');
    ok(s.pressed === 'true', 'fullscreen button reports aria-pressed');
    await P.screenshot({ path: SHOTS + '/outlaw-fullscreen-old-apk.png' });

    await P.click('#ol-exit');
    s = await state(P);
    ok(!s.full && s.on, 'exit button leaves fullscreen and keeps the game open');

    await P.click('#ol-full');
    ok(await P.evaluate(() => window.ninoOutlaw.back()) === true, 'back() in fullscreen returns true');
    s = await state(P);
    ok(!s.full && s.on, 'back() in fullscreen only leaves fullscreen');
    ok(await P.evaluate(() => window.ninoOutlaw.back()) === true, 'back() in the game returns true');
    s = await state(P);
    ok(!s.on, 'back() in the game closes it');
    ok(await P.evaluate(() => window.ninoOutlaw.back()) === false, 'back() with no game open returns false');

    await P.evaluate(() => window.ninoOutlaw.open());
    await sleep(300);
    ok(await P.evaluate(() => window.__imm.attempts) === 1, 'older APK: "immersive" is not re-sent after it was refused');

    await P.keyboard.press('Escape');
    s = await state(P);
    ok(!s.on, 'Escape on the page closes the game');
    await P.evaluate(() => window.ninoOutlaw.open());
    await sleep(300);
    await P.click('#ol-full');
    await P.keyboard.press('Escape');
    s = await state(P);
    ok(s.on && !s.full, 'Escape in fullscreen only leaves fullscreen');
    await P.keyboard.press('Escape');
    s = await state(P);
    ok(!s.on, 'second Escape closes the game');

    await P.evaluate(() => window.ninoOutlaw.open());
    const framed = await waitFor(() => P.evaluate(() => { const f = document.getElementById('ol-frame'); return !!f && f.getAttribute('src') === 'games/outlaw/index.html' && !!f.contentWindow && f.contentWindow.document.readyState !== 'loading'; }), 20000);
    ok(framed, 'game frame loaded');
    await sleep(800);
    const fr = P.frames().find(f => /games\/outlaw\/index\.html/.test(f.url()));
    if (fr) { await fr.locator('body').click({ position: { x: 4, y: 4 } }).catch(() => {}); }
    await P.keyboard.press('Escape');
    s = await state(P);
    ok(!s.on, 'Escape with focus inside the game closes the game (keys are caught in the frame)');
    ok(old.errors.length === 0, 'no page errors in the older-APK session: ' + old.errors.slice(0, 2).join(' | '));
  } finally {
    await old.close();
  }

  /* ---------------------------------------------------------------- newer APK */
  section('newer APK: "immersive" op answered');
  const nw = await session(true);
  try {
    const P = nw.page;
    await settle(P, nw.base);
    await P.evaluate(() => window.ninoOutlaw.open());
    await sleep(400);
    let imm = await P.evaluate(() => window.__imm);
    ok(imm.sent.length === 1 && imm.sent[0] === true, 'open sends immersive on (' + JSON.stringify(imm.sent) + ')');

    const framed = await waitFor(() => P.evaluate(() => { const f = document.getElementById('ol-frame'); return !!f && f.getAttribute('src') === 'games/outlaw/index.html' && !!f.contentWindow && f.contentWindow.document.readyState !== 'loading'; }), 20000);
    ok(framed, 'game frame loaded (newer APK)');
    const drawn = await waitFor(async () => { const h = await gameCanvas(P); return h.h > 0; }, 120000);
    ok(drawn, 'game draws a canvas before the resize check');
    const navsBefore = nw.navs.length;
    const beforeCanvas = await gameCanvas(P);
    const beforeFrame = await P.evaluate(() => { const b = document.getElementById('ol-frame').getBoundingClientRect(); return { w: b.width, h: b.height }; });

    await P.click('#ol-full');
    await sleep(900);
    imm = await P.evaluate(() => window.__imm);
    ok(imm.sent.length === 1, 'fullscreen does not send immersive again (' + JSON.stringify(imm.sent) + ')');
    ok(nw.navs.length === navsBefore, 'fullscreen does not navigate the frame (navs ' + navsBefore + ' -> ' + nw.navs.length + ')');
    const s = await state(P);
    ok(s.src === 'games/outlaw/index.html' && s.full, 'fullscreen state keeps the game src');

    const geo = await P.evaluate(() => {
      const root = document.getElementById('outlaw-root').getBoundingClientRect();
      const stage = document.querySelector('#outlaw-root .ol-stage').getBoundingClientRect();
      const frame = document.getElementById('ol-frame').getBoundingClientRect();
      const exit = document.getElementById('ol-exit').getBoundingClientRect();
      const hit = document.elementFromPoint(exit.x + exit.width / 2, exit.y + exit.height / 2);
      return {
        rootH: root.height, stageTop: stage.top, stageH: stage.height, frameH: frame.height, frameW: frame.width,
        exit: { x: exit.x, y: exit.y, w: exit.width, h: exit.height }, exitOnTop: !!(hit && hit.closest && hit.closest('#ol-exit')),
      };
    });
    ok(Math.abs(geo.stageH - geo.rootH) < 1 && geo.stageTop === 0, 'stage fills the screen in fullscreen (' + JSON.stringify({ rootH: geo.rootH, stageH: geo.stageH }) + ')');
    ok(geo.exitOnTop, 'exit button is on top at its centre (clickable)');
    ok(geo.exit.x >= 0 && geo.exit.y >= 0 && geo.exit.w > 0 && geo.exit.h > 0, 'exit button is inside the screen');
    ok(geo.exit.x < 60 && geo.exit.y < 60, 'exit button sits in the top-left corner (x=' + geo.exit.x + ', y=' + geo.exit.y + ')');

    // the canvas must refit the new frame size: same aspect as before, limited by the frame
    // Phaser either fills the frame (RESIZE) or keeps the aspect and fits one side (FIT); both mean it followed the new size.
    const afterCanvas = await gameCanvas(P);
    const aspect = beforeCanvas.w / beforeCanvas.h;
    const fitsFrame = Math.abs(afterCanvas.w - geo.frameW) <= 3 && Math.abs(afterCanvas.h - geo.frameH) <= 3;
    const fitsAspect = Math.abs(afterCanvas.h - Math.min(geo.frameW / aspect, geo.frameH)) <= 3;
    const info = 'canvas ' + afterCanvas.w.toFixed(0) + 'x' + afterCanvas.h.toFixed(0) + ', frame ' + geo.frameW.toFixed(0) + 'x' + geo.frameH.toFixed(0) + ' (was ' + beforeCanvas.w.toFixed(0) + 'x' + beforeCanvas.h.toFixed(0) + ' in frame ' + beforeFrame.w.toFixed(0) + 'x' + beforeFrame.h.toFixed(0) + ')';
    ok(afterCanvas.h > 0 && (fitsFrame || fitsAspect), 'game canvas refits the fullscreen frame: ' + info);
    await P.screenshot({ path: SHOTS + '/outlaw-fullscreen-new-apk.png' });

    await P.click('#ol-exit');
    await sleep(500);
    const back = await state(P);
    ok(!back.full && back.on, 'exit leaves fullscreen');

    await P.keyboard.press('Escape');
    ok(!(await state(P)).on, 'Escape closes the game');
    imm = await P.evaluate(() => window.__imm);
    ok(JSON.stringify(imm.sent) === '[true,false]', 'close sends immersive off (' + JSON.stringify(imm.sent) + ')');
    ok(errors2(nw) === 0, 'no page errors in the newer-APK session: ' + nw.errors.slice(0, 2).join(' | '));
  } finally {
    await nw.close();
  }

  console.log(`\npassed ${pass}, failed ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL: ' + (e && e.stack || e)); process.exit(1); });

function errors2(s) { return s.errors.filter(e => !/Failed to fetch|NetworkError|net::|Load failed/i.test(e)).length; }

async function gameCanvas(P) {
  for (const fr of P.frames()) {
    if (!/games\/outlaw\/index\.html/.test(fr.url())) continue;
    const r = await fr.evaluate(() => { const c = document.querySelector('canvas'); if (!c) return null; const b = c.getBoundingClientRect(); return { w: b.width, h: b.height }; }).catch(() => null);
    if (r) return r;
  }
  return { w: 0, h: 0 };
}
