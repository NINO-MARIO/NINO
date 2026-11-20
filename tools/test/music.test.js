/* Music player: link parsing, and the watch button that shows the same player as a video. Run: node tools/test/music.test.js */
const H = require('./harness.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('  FAIL: ' + name); } }
(async () => {
  const h = await H.start();
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(2000);
  console.log('== link parsing');
  const parsed = await P.evaluate(() => ({
    short: window.ninoMusic.ytId('https://youtu.be/dQw4w9WgXcQ?si=abcdef&t=42'),
    long: window.ninoMusic.ytId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RD123'),
    shorts: window.ninoMusic.ytId('https://youtube.com/shorts/dQw4w9WgXcQ'),
    bare: window.ninoMusic.ytId('dQw4w9WgXcQ'),
    junk: window.ninoMusic.ytId('https://example.com/watch?v=dQw4w9WgXcQ'),
    list: window.ninoMusic.parse('https://youtu.be/dQw4w9WgXcQ\nhttps://youtu.be/dQw4w9WgXcQ https://youtu.be/aaaaaaaaaaa').length
  }));
  ok(parsed.short === 'dQw4w9WgXcQ', 'youtu.be with ?si= and &t= keeps the 11-char id');
  ok(parsed.long === 'dQw4w9WgXcQ', 'watch?v= with &list= keeps the id');
  ok(parsed.shorts === 'dQw4w9WgXcQ', 'shorts link works');
  ok(parsed.bare === 'dQw4w9WgXcQ', 'bare id works');
  ok(parsed.junk === '', 'other domains are refused');
  ok(parsed.list === 2, 'duplicates are dropped when pasting a list');

  console.log('== watch button');
  await P.evaluate(() => { localStorage.setItem('nino.music.q', JSON.stringify(['dQw4w9WgXcQ'])); });
  await P.reload({ waitUntil: 'load' });
  await sleep(1800);
  const r = await P.evaluate(async () => {
    window.ninoMusic.play(0);
    await new Promise(r => setTimeout(r, 300));
    const f = document.getElementById('nino-yt');
    const before = f && f.style.width;
    document.querySelector('#music-btn').click();
    await new Promise(r => setTimeout(r, 200));
    const btn = document.querySelector('#music-panel [data-act="watch"]');
    btn && btn.click();
    await new Promise(r => setTimeout(r, 200));
    const shown = document.getElementById('nino-yt');
    return {
      hasButton: !!btn,
      before, after: shown && shown.style.width,
      visible: !!shown && shown.style.opacity !== '.01',
      pressed: btn && btn.getAttribute('aria-pressed'),
      titleCut: getComputedStyle(document.getElementById('mp-sub')).overflowWrap
    };
  });
  ok(r.hasButton, 'panel has a watch button');
  ok(r.visible && /px/.test(r.after || ''), 'watch mode makes the player visible at a set size');
  ok(r.pressed === 'true', 'the watch button reports pressed');
  ok(r.titleCut === 'anywhere', 'long link text wraps instead of being cut');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await h.close && h.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR', e && e.message || e); process.exit(1); });
