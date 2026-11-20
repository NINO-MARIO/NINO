/* Research evidence gate + Google search paths (real browser, stubbed network). Run: node tools/test/research.test.js */
const H = require('./harness.js');
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('  FAIL: ' + name); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const h = await H.start();
  const P = h.page;
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(2500);
  console.log('== evidence gate');
  const g = await P.evaluate(() => {
    const R = window.ninoResearch;
    const srcs = [
      { src: 'Google', title: 'MDN', url: 'https://developer.mozilla.org/x', text: 'A debounced function delays invoking the callback until after the wait time has elapsed since the last call. Use clearTimeout to reset the timer.' },
      { src: 'Wikipedia', title: 'Debounce', url: 'https://en.wikipedia.org/wiki/Debounce', text: 'Debouncing prevents a signal from being processed more than once in a short period.' }
    ];
    const good = { name: 'debounce-js', desc: 'หน่วงการเรียกฟังก์ชันจนกว่าจะหยุดเรียก', steps: [
      { text: 'ตั้ง timer ใหม่ทุกครั้งที่ถูกเรียก', quote: 'delays invoking the callback until after the wait time has elapsed', src: 1 },
      { text: 'ล้าง timer เดิมก่อน', quote: 'Use clearTimeout to reset the timer.', src: 1 },
      { text: 'เรื่องที่แต่งขึ้นเอง ไม่มีในแหล่ง', quote: 'always use requestAnimationFrame for debouncing network calls', src: 1 }
    ], example: { code: 'const x = 1;\nfoo(bar, baz, qux);', src: 1 }, cautions: [{ text: 'ระวังสัญญาณถี่', quote: 'Debouncing prevents a signal from being processed more than once', src: 2 }], sources: ['https://developer.mozilla.org/x'] };
    const v = R.val(good, srcs, 'debounce');
    const bad = R.val({ name: 'made-up', desc: 'อะไรสักอย่างที่แต่งเอง', steps: [{ text: 'ก', quote: 'this sentence is not in any source at all', src: 1 }, { text: 'ข', quote: 'neither is this other invented sentence', src: 2 }], sources: ['https://developer.mozilla.org/x'] }, srcs, 'x');
    const old = R.val({ name: 'old-format', desc: 'รูปแบบเก่าที่เป็นสตริงล้วน', steps: ['ขั้นหนึ่ง', 'ขั้นสอง'], sources: ['https://developer.mozilla.org/x'] }, srcs, 'x');
    return { v, bad, old };
  });
  ok(!g.v.err && g.v.steps.length === 2, 'steps with a verbatim quote from a source are kept, the invented one is dropped');
  ok(g.v.stats.steps[0] === 2 && g.v.stats.steps[1] === 3, 'stats report 2 of 3 steps verified');
  ok(g.v.cau.length === 1 && g.v.cau[0].src === 2, 'a caution is verified against the second source');
  ok(g.v.ex === '', 'example code that is not in the sources is dropped');
  ok(g.bad.err && /หลักฐานไม่พอ/.test(g.bad.err), 'nothing is saved when no step has evidence');
  ok(g.old.err && /หลักฐานไม่พอ/.test(g.old.err), 'plain-string steps (no quote) cannot pass');
  console.log('== Google search order and errors');
  const s = await P.evaluate(async () => {
    localStorage.setItem('nino.web', '1');
    localStorage.setItem('nino.google', JSON.stringify({ key: 'K', cx: 'CX' }));
    window.getCfg = () => ({ provider: 'gemini', apiKey: 'AIza-test', model: 'gemini-test' });
    window.ninoFetch = async (u, o) => {
      u = String(u);
      const J = (x, st) => new Response(JSON.stringify(x), { status: st || 200, headers: { 'Content-Type': 'application/json' } });
      if (/generativelanguage/.test(u)) return J({ candidates: [{ content: { parts: [{ text: 'Debounce delays calls.' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.org/a', title: 'A' } }], groundingSupports: [{ segment: { text: 'Debounce delays calls until input stops.' }, groundingChunkIndices: [0] }] } }] });
      if (/googleapis\.com\/customsearch/.test(u)) return J({ items: [{ title: 'CSE hit', link: 'https://example.org/c', snippet: 'cse snippet' }] });
      if (/wikipedia/.test(u)) return J({ query: { search: [{ title: 'Debounce', snippet: 'wiki snippet' }] } });
      if (/duckduckgo/.test(u)) return J({ AbstractText: '', RelatedTopics: [] });
      return J({}, 404);
    };
    const r = await window.ninoWeb.search('debounce javascript', { deep: true });
    return { order: r.map(x => x.src), urls: r.filter(x => x.src === 'Google').map(x => x.url), google: r.google, ev: r.find(x => x.url === 'https://example.org/a').text };
  });
  ok(s.order[0] === 'Google' && s.google, 'Google results come first');
  ok(s.urls.indexOf('https://example.org/a') >= 0 && s.urls.indexOf('https://example.org/c') >= 0, 'both Gemini grounding and Programmable Search results are returned');
  ok(/until input stops/.test(s.ev), 'grounded text is attached to the source it supports');
  const e = await P.evaluate(async () => {
    window.getCfg = () => ({ provider: 'gemini', apiKey: 'AIza-test', model: 'gemini-test' });
    window.ninoFetch = async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    localStorage.setItem('nino.google', '{}');
    window.ninoGuard.reset();
    const r = await window.ninoWeb.search('anything', { deep: true });
    return r.errs;
  });
  ok(e.some(x => /Google/.test(x) && /API key not valid/.test(x)), 'a failing Google call is reported with the reason, not swallowed');
  console.log('== Google panel: igu=1 and Programmable Search modes');
  const p = await P.evaluate(() => { localStorage.setItem('nino.google', JSON.stringify({ cx: 'CX123', key: '' })); window.ninoWeb.panel('hello world', 'igu'); const f = document.querySelector('#nino-g-sheet iframe'); const d = window.ninoWeb.destination; return { src: f ? f.src : '', url: d('example.com/x'), http: d('https://a.b/c'), empty: d('', 'igu') }; });
  ok(p.src === 'https://www.google.com/search?igu=1&q=hello%20world', 'igu mode embeds Google search with the query');
  ok(p.url === 'https://example.com/x' && p.http === 'https://a.b/c' && p.empty === 'https://www.google.com/search?igu=1', 'address bar treats URLs and queries differently');
  const c = await P.evaluate(() => { document.querySelector('#gp-m-cse').click(); const f = document.querySelector('#nino-g-sheet iframe'); return { src: f.src, on: document.querySelector('#gp-m-cse').classList.contains('on'), saved: localStorage.getItem('nino.google.mode') }; });
  ok(c.src === 'https://cse.google.com/cse?cx=CX123&q=hello%20world' && c.on && c.saved === 'cse', 'Programmable Search mode embeds cse.google.com with the saved cx');
  const n = await P.evaluate(() => { localStorage.setItem('nino.google', '{}'); window.ninoWeb.panel('x', 'cse'); return { src: document.querySelector('#nino-g-sheet iframe').src, note: document.querySelector('#nino-g-sheet').textContent.indexOf('programmablesearchengine.google.com') >= 0 }; });
  ok(n.src === 'about:blank' && n.note, 'without a cx the mode explains how to create one instead of loading a broken frame');
  const ask = await P.evaluate(() => { document.querySelector('#gp-ask').click(); return document.getElementById('prompt-input').value; });
  ok(/ค้นเว็บแล้วสรุป/.test(ask), 'the ask button hands the query to NINO through the chat box');
  await h.close();
  console.log('\npassed ' + pass + ', failed ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(e); process.exit(1); });
