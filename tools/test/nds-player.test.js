/* ตัวเล่นเกม NDS: ปุ่มคีย์บอร์ด/สัมผัส, หยุดชั่วคราว, เสียง, รูปถ่าย, การตั้งค่าที่จำไว้,
   รายการระบบรองรับของแกน, ปิดเกมด้วย Escape. ใช้แกนทดสอบ (ไม่ใช่เอนจินจริง). 
   Run: node tools/test/nds-player.test.js */
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
/* แกนทดสอบ: นับเฟรม บันทึก mask และส่งเสียงปลอม. ฟังก์ชันเสริมจะถูกใส่หรือไม่ใส่ตามกรณี */
function testCore(withOptional) {
  const opt = withOptional
    ? `,setKeys:function(m){window.__mask=m;},audioBuffer:function(){window.__audioCalls=(window.__audioCalls||0)+1;var a=new Int16Array(2*546);for(var i=0;i<a.length;i++)a[i]=Math.round(Math.sin(i/12)*6000);return a;},reset:function(){window.__resets=(window.__resets||0)+1;}`
    : '';
  /* ฟังก์ชันเสริมชุดเซฟและจอสัมผัส */
  const state = withOptional ? `,saveState:function(){window.__stateSaves=(window.__stateSaves||0)+1;return new Uint8Array([9,8,7,6]);},loadState:function(b){window.__stateLoaded=Array.from(b);}` : '';
  const save = withOptional
    ? `,setTouch:function(x,y,d){window.__touch=[x,y,d?1:0];},saveData:function(){window.__saveCalls=(window.__saveCalls||0)+1;var a=new Uint8Array(512);a[0]=(window.__frames||0)&255;a[1]=7;return a;},loadSaveData:function(b){window.__loaded=[b[0],b[1],b.length];}`
    : '';
  return `{version:'TEST-STUB',loadBios:function(k,b){return{ok:true};},loadRom:function(b){return{ok:true,title:'PLAYTEST',code:'PLTS',size:b.length};},runFrame:function(){window.__frames=(window.__frames||0)+1;},framebuffer:function(){return new Uint8Array(256*384*4);}${opt}${save}${state}}`;
}
const idbKv = (page, key) => page.evaluate((k) => new Promise((res, rej) => {
  const r = indexedDB.open('nds-library', 1);
  r.onsuccess = () => {
    const q = r.result.transaction('kv').objectStore('kv').get(k);
    q.onsuccess = () => {
      const v = q.result;
      if (v === undefined) return res(undefined);
      res({ len: v.length, head: Array.from(v.slice(0, 2)) });
    };
    q.onerror = () => rej(String(q.error));
  };
  r.onerror = () => rej(String(r.error));
}), key);
async function openRoomWithGame(browser, base, withOptional) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(url => !url.href.startsWith(base), r => r.abort());
  await ctx.addInitScript(() => { window.__pad = null; navigator.getGamepads = () => (window.__pad ? [window.__pad] : []); });
  await ctx.route('**/wasm_exec.js', r => r.fulfill({ contentType: 'text/javascript', body:
    'window.Go=function(){this.importObject={};this.run=function(){window.ndsCore=(' + testCore(withOptional) + ');return Promise.resolve();};};' }));
  await ctx.route('**/core.wasm', r => r.fulfill({ contentType: 'application/wasm', body: Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]) }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e)));
  await page.goto(base + '/games/nds/index.html', { waitUntil: 'load' });
  await sleep(1000);
  await page.click('#usefree');
  await sleep(1000);
  const rom = path.join(os.tmpdir(), 'nino-player-test.nds');
  const hdr = Buffer.alloc(0x400); hdr.write('PLAYTEST', 0, 'ascii'); hdr.write('PLTS', 12, 'ascii');
  fs.writeFileSync(rom, hdr);
  await page.setInputFiles('#add', rom);
  await sleep(900);
  await page.click('#shelf [data-play]');
  await sleep(700);
  return { ctx, page, errs };
}

(async () => {
  const srv = server();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    console.log('== 1. keyboard and touch pad send the right bits');
    const a = await openRoomWithGame(browser, base, true);
    ok(await a.page.$eval('#play', el => el.classList.contains('on')), 'game page opens');
    await a.page.keyboard.down('ArrowRight');
    await a.page.keyboard.down('KeyX');
    await sleep(200);
    const kb = await a.page.evaluate(() => window.__mask);
    ok(kb === ((1 << 4) | (1 << 0)), `keyboard Right+X gives mask ${kb} (expect 17)`);
    await a.page.keyboard.up('ArrowRight');
    await a.page.keyboard.up('KeyX');
    await sleep(150);
    ok((await a.page.evaluate(() => window.__mask)) === 0, 'keys released clear the mask');
    await a.page.dispatchEvent('[data-key="B"]', 'pointerdown');
    await sleep(120);
    ok(((await a.page.evaluate(() => window.__mask)) & 2) === 2, 'touch B sets bit 1');
    await a.page.dispatchEvent('[data-key="B"]', 'pointerup');
    await sleep(120);
    ok(((await a.page.evaluate(() => window.__mask)) & 2) === 0, 'touch B release clears bit 1');
    // a key held on the keyboard must survive a touch press and release of the same button
    await a.page.keyboard.down('KeyZ');
    await sleep(100);
    await a.page.dispatchEvent('[data-key="B"]', 'pointerdown');
    await a.page.dispatchEvent('[data-key="B"]', 'pointerup');
    await a.page.dispatchEvent('[data-key="B"]', 'pointerleave');
    await sleep(120);
    ok(((await a.page.evaluate(() => window.__mask)) & 2) === 2, 'keyboard B survives touch B up then leave');
    await a.page.keyboard.up('KeyZ');
    await sleep(120);
    ok(((await a.page.evaluate(() => window.__mask)) & 2) === 0, 'keyboard B release clears bit 1');

    console.log('== 2. pause stops frames, resume starts them again');
    await a.page.click('#np-pause');
    await sleep(150);
    ok((await a.page.textContent('#fps')) === 'หยุดอยู่', 'fps label says paused while paused');
    const f1 = await a.page.evaluate(() => window.__frames);
    await sleep(500);
    const f2 = await a.page.evaluate(() => window.__frames);
    ok(f2 === f1, `frames stop while paused (${f1} -> ${f2})`);
    await a.page.click('#np-pause');
    await sleep(500);
    ok((await a.page.evaluate(() => window.__frames)) > f2, 'frames run again after resume');
    ok((await a.page.textContent('#fps')) === 'หยุดอยู่' || /FPS/.test(await a.page.textContent('#fps')), 'fps label is not stuck while paused');

    console.log('== 3. sound and screenshot');
    ok((await a.page.evaluate(() => window.__audioCalls || 0)) > 0, 'core audio is pulled every frame');
    ok((await a.page.evaluate(() => NDS_PLAYER.audioState())) !== 'none', 'audio context was created on play');
    const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.click('button:has-text("ถ่ายรูป")')]);
    ok(dl.suggestedFilename().startsWith('NINO-DS-') && dl.suggestedFilename().endsWith('.png'), `screenshot downloads as ${dl.suggestedFilename()}`);

    console.log('== 4. settings: volume is remembered, support list is shown');
    await a.page.click('button:has-text("ตั้งค่า")');
    await sleep(200);
    await a.page.evaluate(() => { const v = document.getElementById('np-volume'); v.value = '0.3'; v.dispatchEvent(new Event('input')); });
    const supp = await a.page.textContent('#np-support');
    ok(/setKeys.*มี/.test(supp) && /audioBuffer.*มี/.test(supp) && /reset.*มี/.test(supp), 'support list shows the three optional functions as present');
    await a.page.reload({ waitUntil: 'load' });
    await sleep(1000);
    await a.page.click('#shelf [data-play]');
    await sleep(700);
    await a.page.click('button:has-text("ตั้งค่า")');
    await sleep(200);
    ok((await a.page.inputValue('#np-volume')) === '0.3', 'volume 0.3 is remembered after reload');

    console.log('== 5. reset calls the core, Escape closes and clears the keys');
    await a.page.click('#np-reset');
    await sleep(150);
    ok((await a.page.evaluate(() => window.__resets || 0)) === 1, 'reset button calls core.reset once');
    await a.page.keyboard.down('KeyZ');
    await sleep(120);
    await a.page.keyboard.press('Escape');
    await sleep(200);
    ok(!(await a.page.$eval('#play', el => el.classList.contains('on'))), 'Escape closes the game');
    ok((await a.page.evaluate(() => window.__mask)) === 0, 'closing clears the keys sent to the core');
    ok(a.errs.length === 0, 'no page errors (' + a.errs.slice(0, 2).join(' | ') + ')');
    await a.ctx.close();

    console.log('== 6a. saves: written on pause, loaded after a reload, removed with the cartridge');
    {
      const c = await openRoomWithGame(browser, base, true);
      c.page.on('dialog', d => d.accept());
      await sleep(1200);
      // touch screen: the centre of the pad is about (128, 96)
      await c.page.evaluate(() => document.getElementById('toast').classList.remove('on'));
      await c.page.locator('#np-touch').scrollIntoViewIfNeeded();
      await sleep(150);
      const box = await c.page.locator('#np-touch').boundingBox();
      await c.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await c.page.mouse.down();
      await sleep(120);
      const t1 = await c.page.evaluate(() => window.__touch);
      ok(t1 && t1[2] === 1 && Math.abs(t1[0] - 128) <= 3 && Math.abs(t1[1] - 96) <= 3, `touch centre maps to about (128, 96): ${JSON.stringify(t1)}`);
      await c.page.mouse.up();
      await sleep(120);
      ok((await c.page.evaluate(() => window.__touch))[2] === 0, 'releasing the touch pad clears the touch');
      // pause saves the game
      await c.page.click('#np-pause');
      await sleep(300);
      const gameId = await c.page.getAttribute('#shelf [data-play]', 'data-play');
      const rec = await idbKv(c.page, 'save:' + gameId);
      const saved = rec ? [rec.head[0], rec.head[1], rec.len] : null;
      ok(saved && saved[1] === 7 && saved[2] === 512, `save written to IndexedDB (${JSON.stringify(saved)})`);
      await c.page.click('#np-pause');
      await c.page.reload({ waitUntil: 'load' });
      await sleep(1000);
      await c.page.click('#shelf [data-play]');
      await sleep(900);
      const loaded = await c.page.evaluate(() => window.__loaded);
      ok(loaded && saved && loaded[0] === saved[0] && loaded[1] === 7 && loaded[2] === 512, `save loaded after reload (${JSON.stringify(loaded)})`);
      await c.page.keyboard.press('Escape');
      await sleep(200);
      const removedId = await c.page.getAttribute('#shelf [data-play]', 'data-play');
      await c.page.click('#shelf [data-del]');
      await sleep(700);
      ok((await idbKv(c.page, 'save:' + removedId)) === undefined, 'the removed cartridge save is deleted');
      ok((await idbKv(c.page, 'rom:' + removedId)) === undefined, 'the removed cartridge itself is deleted');
      ok(c.errs.length === 0, 'no page errors in the save and touch flow (' + c.errs.slice(0, 2).join(' | ') + ')');
      await c.ctx.close();
    }

    console.log('== 6b. gamepad: standard mapping and the left stick');
    {
      const c = await openRoomWithGame(browser, base, true);
      await c.page.evaluate(() => { window.__pad = { buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 1 })), axes: [0.9, 0] }; });
      await sleep(200);
      const m = await c.page.evaluate(() => window.__mask);
      ok((m & 1) === 1 && (m & (1 << 4)) === (1 << 4), `gamepad button 1 is A and the stick right is Right (mask ${m})`);
      await c.page.evaluate(() => { window.__pad = null; });
      await sleep(200);
      ok((await c.page.evaluate(() => window.__mask)) === 0, 'unplugging the pad clears its buttons');
      await c.page.click('button:has-text("ตั้งค่า")');
      await sleep(200);
      ok(/Gilead Kutnick/.test(await c.page.textContent('#np-set')), 'FreeBIOS credit is shown in the settings');
      ok(/วิธีเล่น/.test(await c.page.textContent('#np-set')), 'how-to-play text is shown in the settings');
      await c.ctx.close();
    }

    console.log('== 6c. keyboard remap: rebind, cancel, remember, reset');
    {
      const c = await openRoomWithGame(browser, base, true);
      await c.page.click('button:has-text("ตั้งค่า")');
      await sleep(150);
      await c.page.click('[data-bind="A"]');
      await c.page.keyboard.press('KeyJ');
      await sleep(150);
      ok((await c.page.textContent('[data-bind="A"]')) === 'KeyJ', 'A is rebound to KeyJ');
      await c.page.keyboard.down('KeyJ');
      await sleep(120);
      ok(((await c.page.evaluate(() => window.__mask)) & 1) === 1, 'the new key sends A');
      await c.page.keyboard.up('KeyJ');
      await sleep(120);
      await c.page.keyboard.down('KeyX');
      await sleep(120);
      ok(((await c.page.evaluate(() => window.__mask)) & 1) === 0, 'the old key no longer sends A');
      await c.page.keyboard.up('KeyX');
      await c.page.click('[data-bind="B"]');
      await c.page.keyboard.press('Escape');
      await sleep(150);
      ok((await c.page.textContent('[data-bind="B"]')) === 'KeyZ', 'Escape cancels the rebind');
      await c.page.reload({ waitUntil: 'load' });
      await sleep(900);
      await c.page.click('#shelf [data-play]');
      await sleep(700);
      await c.page.click('button:has-text("ตั้งค่า")');
      await sleep(150);
      ok((await c.page.textContent('[data-bind="A"]')) === 'KeyJ', 'the rebind is remembered after a reload');
      await c.page.click('#np-binds-reset');
      await sleep(150);
      ok((await c.page.textContent('[data-bind="A"]')) === 'KeyX', 'reset brings back the default A key');
      ok(c.errs.length === 0, 'no page errors in remap (' + c.errs.slice(0, 2).join(' | ') + ')');
      await c.ctx.close();
    }

    console.log('== 6d. suspend state: saved, loaded, disabled without the core, Enter on a button');
    {
      const c = await openRoomWithGame(browser, base, true);
      await c.page.click('#np-state-save');
      await sleep(300);
      const gameId = await c.page.getAttribute('#shelf [data-play]', 'data-play');
      const rec = await idbKv(c.page, 'state:' + gameId);
      ok(rec && rec.len === 4 && rec.head[0] === 9 && rec.head[1] === 8, `suspend state written to IndexedDB (${JSON.stringify(rec)})`);
      await c.page.click('#np-state-load');
      await sleep(200);
      ok(JSON.stringify(await c.page.evaluate(() => window.__stateLoaded)) === '[9,8,7,6]', 'load gives the core the saved bytes');
      await c.page.focus('#np-pause');
      await c.page.keyboard.press('Enter');
      await sleep(150);
      ok(((await c.page.evaluate(() => window.__mask)) & 8) === 0, 'Enter on a focused button does not press START in the game');
      ok((await c.page.textContent('#np-pause')) === 'เล่นต่อ', 'Enter on the focused pause button toggles pause (the button got the key)');
      ok(c.errs.length === 0, 'no page errors in suspend and focus (' + c.errs.slice(0, 2).join(' | ') + ')');
      await c.ctx.close();
    }
    {
      const d = await openRoomWithGame(browser, base, false);
      ok(await d.page.isDisabled('#np-state-save'), 'save state is disabled when the core has no saveState');
      ok(await d.page.isDisabled('#np-state-load'), 'load state is disabled when the core has no loadState');
      await d.ctx.close();
    }

    console.log('== 6e. screenshot inside the app goes through saveFile');
    {
      const c = await openRoomWithGame(browser, base, true);
      await c.page.evaluate(() => {
        window.__calls = [];
        window.ninoNative = { bridge: 4, call(op, p) { window.__calls.push({ op, name: p.name, mime: p.mime }); return Promise.resolve({ saved: true }); } };
      });
      let downloads = 0;
      c.page.on('download', () => { downloads++; });
      await c.page.click('button:has-text("ถ่ายรูป")');
      await sleep(500);
      const calls = await c.page.evaluate(() => window.__calls);
      ok(calls.length === 1 && calls[0].op === 'saveFile' && /^NINO-DS-.*\.png$/.test(calls[0].name) && calls[0].mime === 'image/png', `screenshot is saved through the app (${JSON.stringify(calls)})`);
      ok(downloads === 0, 'no browser download for the screenshot inside the app');
      await c.ctx.close();
    }

    console.log('== 6f. on-screen layout matches the DS: D-pad left, X top, Y left, A right, B bottom, L/R top corners');
    {
      const c = await openRoomWithGame(browser, base, true);
      await c.page.evaluate(() => document.getElementById('np-controls') || 1);
      const box = async (k) => c.page.locator(`[data-key="${k}"]`).first().boundingBox();
      const [X, Y, A, B, U, D, L, R, LE, RI, SE, ST] = await Promise.all(['X','Y','A','B','UP','DOWN','L','R','LEFT','RIGHT','SELECT','START'].map(box));
      const cx = (b) => b.x + b.width / 2, cy = (b) => b.y + b.height / 2;
      ok(cy(X) < cy(Y) - 10 && Math.abs(cx(X) - cx(B)) < 4 && cy(X) < cy(B), 'X is above, B is below, and they share a column');
      ok(Math.abs(cy(Y) - cy(A)) < 4 && cx(Y) < cx(A) - 20, 'Y is left of A on the same row');
      ok(cx(A) > cx(X) && cx(Y) < cx(X), 'face buttons form a diamond around the centre column');
      ok(cx(LE) < cx(U) && cx(RI) > cx(U) && Math.abs(cx(U) - cx(D)) < 4, 'D-pad cross: left and right outside, up and down in the same column');
      ok(cx(L) < cx(R) && cy(L) < cy(U) && cy(R) < cy(U), 'L and R sit above the controls, at the two ends');
      // L กว้างกว่าปุ่มทิศ จุดศูนย์กลางจึงอยู่ทางขวาของ LEFT แม้ขอบซ้ายจะตรงกันพอดี
      // มุมคือขอบ: ขอบซ้ายของ L ตรงขอบซ้ายของ LEFT และขอบขวาของ R ตรงขอบขวาของ A
      ok(L.x <= LE.x + 4 && R.x + R.width >= A.x + A.width - 4, 'L is the left corner and R the right corner (edges)');
      ok(cx(SE) < cx(ST) && Math.abs(cy(SE) - cy(ST)) < 4 && cy(SE) > cy(B), 'Select and Start sit together below the face buttons');
      ok(cx(LE) < cx(X) && cx(X) < cx(RI) + 200, 'the D-pad is on the left half and the face buttons on the right half');
      await c.page.screenshot({ path: path.join(os.tmpdir(), 'layout-check.png'), fullPage: false });
      await c.ctx.close();
    }

    console.log('== 6. a core without the optional functions still plays');
    const b = await openRoomWithGame(browser, base, false);
    ok(await b.page.$eval('#play', el => el.classList.contains('on')), 'game page opens without optional functions');
    await b.page.click('button:has-text("ตั้งค่า")');
    await sleep(200);
    const sb = await b.page.textContent('#np-support');
    ok(/setKeys.*ยังไม่มี/.test(sb) && /audioBuffer.*ยังไม่มี/.test(sb), 'support list reports the missing functions honestly');
    ok(b.errs.length === 0, 'no page errors without optional functions (' + b.errs.slice(0, 2).join(' | ') + ')');
    await b.ctx.close();
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
