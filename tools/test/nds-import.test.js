/* ห้อง NDS: การนำเข้าไฟล์แบบใหม่ (ช่องเดียว หลายไฟล์ ลากวาง ซิป แฮชอ้างอิง)
   Run: node tools/test/nds-import.test.js
   ไฟล์ BIOS ในเทสต์เป็นศูนย์ทั้งหมด (ทดสอบด่านขนาดและแฮชเท่านั้น ไม่ใช่ BIOS จริง) */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), crypto = require('crypto');
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
function fakeNds(title, code) {
  const b = Buffer.alloc(0x400);
  b.write(title, 0, 'ascii'); b.write(code, 12, 'ascii');
  return b;
}
const tmp = name => path.join(os.tmpdir(), 'nino-imp-' + name);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

// a zip with deflated entries (method 8), the way real archives store them
function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = zlib.deflateRawSync(e.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(e.data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, data);
    centrals.push(ch, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

async function openRoom(page, base) {
  await page.goto(base + '/games/nds/index.html', { waitUntil: 'load' });
  await sleep(1000);
}
const slotTexts = page => page.$$eval('#bios .slot', els => els.map(e => e.textContent));
const shelfTitles = page => page.$$eval('#shelf [data-play]', els => els.map(e => e.textContent));
const toastText = page => page.textContent('#toast');

(async () => {
  const srv = server();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const bios7 = Buffer.alloc(16384), bios9 = Buffer.alloc(4096), fw = Buffer.alloc(262144);
    const romA = tmp('a.nds'), romB = tmp('b.nds');
    fs.writeFileSync(romA, fakeNds('MULTI', 'MLTI'));
    fs.writeFileSync(romB, fakeNds('SECOND', 'SCND'));
    const f7 = tmp('bios7.bin'), f9 = tmp('bios9.bin'), ff = tmp('fw.bin');
    fs.writeFileSync(f7, bios7); fs.writeFileSync(f9, bios9); fs.writeFileSync(ff, fw);
    const small = tmp('small.bin'); fs.writeFileSync(small, Buffer.alloc(100));

    // ---------- 1. one pick: many files at once ----------
    console.log('== 1. one pick puts the cartridge and all three BIOS files in');
    const c1 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c1.route(url => !url.href.startsWith(base), r => r.abort());
    const p1 = await c1.newPage();
    const errs = [];
    p1.on('pageerror', e => errs.push(String(e.message || e)));
    await openRoom(p1, base);
    await p1.setInputFiles('#add', [romA, f7, f9, ff]);
    await sleep(1400);
    const titles1 = await shelfTitles(p1);
    ok(titles1.some(t => /MULTI/.test(t)), `cartridge from the same pick is on the shelf (${titles1.join('|')})`);
    const s1 = await slotTexts(p1);
    ok(s1.length === 3 && s1.every(t => /ใส่แล้ว/.test(t)), 'all three BIOS slots filled from the same pick');

    // ---------- 2. drag and drop anywhere on the page ----------
    console.log('== 2. drag and drop onto the page');
    await p1.evaluate(async (b64) => {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([u], 'DROPPED.nds'));
      document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, fakeNds('DROPPED', 'DRP1').toString('base64'));
    await sleep(900);
    const titles2 = await shelfTitles(p1);
    ok(titles2.some(t => /DROPPED/.test(t)), 'dropped cartridge appears on the shelf');
    ok(errs.length === 0, 'no page errors (' + errs.slice(0, 3).join(' | ') + ')');
    await c1.close();

    // ---------- 3. zip with deflate, wrong size, unknown file ----------
    console.log('== 3. zip archive, wrong-size file, unknown file');
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c3.route(url => !url.href.startsWith(base), r => r.abort());
    const p3 = await c3.newPage();
    await openRoom(p3, base);
    const zipPath = tmp('pack.zip');
    fs.writeFileSync(zipPath, makeZip([
      { name: 'games/ZIPCART.nds', data: fakeNds('ZIPCART', 'ZIPC') },
      { name: 'readme.txt', data: Buffer.from('ignored') },
      { name: 'bios7.bin', data: bios7 },
    ]));
    await p3.setInputFiles('#add', zipPath);
    await sleep(1400);
    const titles3 = await shelfTitles(p3);
    ok(titles3.some(t => /ZIPCART/.test(t)), `cartridge inside the zip is on the shelf (${titles3.join('|')})`);
    const s3 = await slotTexts(p3);
    ok(s3.some(t => /ARM7 BIOS/.test(t) && /ใส่แล้ว/.test(t)), 'BIOS inside the zip goes to its slot');
    await p3.setInputFiles('#add', small);
    await sleep(400);
    ok(/ไม่ใช่ .nds/.test(await toastText(p3)), 'a 100-byte file is refused with a clear message');
    await c3.close();

    // ---------- 4. SHA-256 reference: accept on match, refuse on mismatch ----------
    console.log('== 4. SHA-256 reference list (routed bios-hashes.json)');
    const c4 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c4.route(url => !url.href.startsWith(base), r => r.abort());
    await c4.route('**/bios-hashes.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({
      bios7: [sha(bios7)], bios9: ['0'.repeat(64)], firmware: [] }) }));
    const p4 = await c4.newPage();
    await openRoom(p4, base);
    await p4.setInputFiles('input[data-bios="bios7"]', f7);
    await sleep(600);
    ok(/ยืนยันแฮชแล้ว/.test(await toastText(p4)), 'matching hash is accepted and confirmed');
    const s4a = await slotTexts(p4);
    ok(s4a.some(t => /ARM7 BIOS/.test(t) && /ยืนยันแฮชแล้ว/.test(t)), 'ARM7 slot shows the hash is confirmed');
    await p4.setInputFiles('input[data-bios="bios9"]', f9);
    await sleep(600);
    ok(/ไม่ตรงกับแฮชที่รู้จัก/.test(await toastText(p4)), 'mismatching hash is refused');
    const s4b = await slotTexts(p4);
    ok(s4b.some(t => /ARM9 BIOS/.test(t) && /ยังไม่ใส่/.test(t)), 'refused file is not stored in the ARM9 slot');
    await c4.close();
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
