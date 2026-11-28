/* ปฏิบัติการเล่นทดสอบ (playtest): ทำตามผู้เล่นทีละขั้นบนเบราว์เซอร์จริง และแคปหน้าจอทุกขั้น.
   แกนที่ใช้เป็น "แกนทดสอบที่วาดภาพ": วาดปุ่มที่กดให้สว่าง วาดจุดสัมผัสบนจอล่าง และแถบเฟรม
   เพื่อให้เห็นว่าอินพุตไปถึงแกนจริง. นี่ไม่ใช่อีมูเลเตอร์ และไม่ได้ยืนยันว่าเกมบูตได้.
   ไฟล์ตลับทดสอบ: tools/test/fixtures/nino-test.nds (header ถูกต้อง, ARM ทำจอพื้นหลังเป็นสีแดง)
   Run: node tools/test/nds-playtest.test.js   (แคปหน้าจอไว้ที่ PLAYTEST_OUT หรือ /tmp/playtest) */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = process.env.PLAYTEST_OUT || path.join(os.tmpdir(), 'playtest');
const CART = path.join(__dirname, 'fixtures', 'nino-test.nds');
const FREE = (f) => path.join(ROOT, 'games', 'nds', 'bios-free', f);
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
/* แกนทดสอบที่วาดภาพ (ส่งเป็นข้อความ JS ใน Go stub) */
const PAINT_CORE = `(function(){
  var W=256,H=384,fb=new Uint8ClampedArray(W*H*4),mask=0,touch=[0,0,0],frames=0;
  var KEYS=[['L',0,8,9],['R',44,8,8],['UP',8,40,6],['DOWN',8,72,7],['LEFT',-8,56,5],['RIGHT',24,56,4],
            ['X',184,24,10],['Y',152,40,11],['A',200,56,0],['B',168,72,1],['SELECT',84,104,2],['START',124,104,3]];
  function px(x,y,r,g,b){if(x<0||y<0||x>=W||y>=H)return;var i=(y*W+x)*4;fb[i]=r;fb[i+1]=g;fb[i+2]=b;fb[i+3]=255;}
  function rect(x,y,w,h,r,g,b){for(var j=0;j<h;j++)for(var i=0;i<w;i++)px(x+i,y+j,r,g,b);}
  function render(){
    rect(0,0,W,H,20,16,28);
    KEYS.forEach(function(k){var on=(mask>>k[3])&1;
      if(on) rect(k[1]+40,k[2],22,22,255,120,190); else rect(k[1]+40,k[2],22,22,70,60,90);});
    if(touch[2]) rect(touch[0]-3,192+touch[1]-3,7,7,255,230,90);
    rect(0,380,(frames%256),4,120,220,160);
  }
  return {
    version:'PAINT-TEST (ไม่ใช่เอนจิน)',
    loadBios:function(k,b){return{ok:true};},
    loadRom:function(b){return{ok:true,title:'NINO TEST',code:'NTST',size:b.length};},
    runFrame:function(){frames++;},
    framebuffer:function(){render();return fb;},
    setKeys:function(m){mask=m;window.__mask=m;},
    setTouch:function(x,y,d){touch=[x,y,d?1:0];window.__touch=touch;},
    audioBuffer:function(){return new Int16Array(2*546);},
    reset:function(){frames=0;},
    saveData:function(){var a=new Uint8Array(256);a[0]=frames&255;return a;},
    loadSaveData:function(b){window.__loadedSave=b.length;},
    saveState:function(){return new Uint8Array([frames&255,1,2,3]);},
    loadState:function(b){window.__loadedState=b.length;}
  };
})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = server();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('  shot ' + name); };
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await ctx.route(url => !url.href.startsWith(base), r => r.abort());
    await ctx.route('**/wasm_exec.js', r => r.fulfill({ contentType: 'text/javascript', body:
      'window.Go=function(){this.importObject={};this.run=function(){window.ndsCore=' + PAINT_CORE + ';return Promise.resolve();};};' }));
    await ctx.route('**/core.wasm', r => r.fulfill({ contentType: 'application/wasm', body: Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]) }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message || e)));

    console.log('== 1. the player arrives: no cartridge, no BIOS');
    await page.goto(base + '/games/nds/index.html', { waitUntil: 'load' });
    await sleep(1000);
    await shot(page, 'playtest-01-empty-room');

    console.log('== 2. the player taps the free BIOS button, then adds the test cartridge');
    await page.click('#usefree');
    await sleep(1200);
    await page.setInputFiles('#add', CART);
    await sleep(1000);
    const shelf = await page.$$eval('#shelf [data-play]', els => els.map(e => e.textContent));
    ok(shelf.some(t => /NINO TEST/.test(t)), `the cartridge shows its real title from the header (${shelf.join(' | ')})`);
    await shot(page, 'playtest-02-cartridge-on-shelf');

    console.log('== 3. the player starts the game');
    await page.click('#shelf [data-play]');
    await sleep(900);
    ok(await page.$eval('#play', el => el.classList.contains('on')), 'the game screen opens');
    await shot(page, 'playtest-03-game-started');

    console.log('== 4. the player presses Right and A on the keyboard');
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('KeyX');
    await sleep(350);
    const m1 = await page.evaluate(() => window.__mask);
    await shot(page, 'playtest-04-pressing-right-and-a');
    ok(m1 === ((1 << 4) | (1 << 0)), `the core receives Right+A (mask ${m1})`);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('KeyX');
    await sleep(200);

    console.log('== 5. the player touches the bottom screen');
    await page.evaluate(() => document.getElementById('np-touch').scrollIntoView());
    const box = await page.locator('#np-touch').boundingBox();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
    await page.mouse.down();
    await sleep(300);
    const t1 = await page.evaluate(() => window.__touch);
    ok(t1 && t1[2] === 1, `the core receives the touch (${JSON.stringify(t1)})`);
    await shot(page, 'playtest-05-touching-bottom-screen');
    await page.mouse.up();
    await sleep(200);

    console.log('== 6. the player pauses, then resumes');
    await page.click('#np-pause');
    await sleep(200);
    ok((await page.textContent('#fps')) === 'หยุดอยู่', 'the frame label says paused');
    await shot(page, 'playtest-06-paused');
    await page.click('#np-pause');
    await sleep(300);

    console.log('== 7. the player saves a suspend state and loads it');
    await page.click('#np-state-save');
    await sleep(200);
    await page.click('#np-state-load');
    await sleep(200);
    ok((await page.evaluate(() => window.__loadedState)) === 4, 'the suspend state is loaded back into the core');
    await shot(page, 'playtest-07-suspend-saved-and-loaded');

    console.log('== 8. the player opens settings and sees what the core supports');
    await page.click('button:has-text("ตั้งค่า")');
    await sleep(250);
    const support = await page.textContent('#np-support');
    ok(/setTouch.*มี/.test(support) && /saveState.*มี/.test(support), 'support list reports the core features as present');
    await shot(page, 'playtest-08-settings-and-support');

    console.log('== 9. the player leaves the game');
    await page.keyboard.press('Escape');
    await sleep(300);
    ok(!(await page.$eval('#play', el => el.classList.contains('on'))), 'Escape closes the game');
    await shot(page, 'playtest-09-back-on-shelf');
    ok(errs.length === 0, 'no page errors during the whole playtest (' + errs.slice(0, 3).join(' | ') + ')');
    await ctx.close();
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\nplaytest: ${pass} passed, ${fail} failed. Screenshots: ${OUT}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
