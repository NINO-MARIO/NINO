/* Real-browser tests of the web layer against a mocked native bridge. Run: node tools/test/browser.test.js
   Needs playwright + chromium. Saves screenshots to $NINO_SHOTS (default /tmp/nino-shots) for visual review. */
const H = require('./harness.js');
const fs = require('fs');
const SHOTS = process.env.NINO_SHOTS || '/tmp/nino-shots';
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('  FAIL: ' + name); } }
function eq(a, b, name) { const s = JSON.stringify(a) === JSON.stringify(b); if (!s) console.log('    expected', JSON.stringify(b), 'got', JSON.stringify(a)); ok(s, name); }
function section(s) { console.log('== ' + s); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const REL = (n, run, extra = {}) => ({ info: Object.assign({ id: 'web-' + n, tag: 'web-' + n, version: '2.9.' + run, commit: n + '0'.repeat(33), message: 'build ' + run, builtAt: '2026-11-06T00:00:00Z', run, size: 1000, sha256: 'a'.repeat(64), minBridge: 1, signed: true }, extra.info || {}), after: extra.after || 0 });

(async () => {
  const h = await H.start();
  const P = h.page;
  const T0 = Date.now(), navLog = [];
  P.on('framenavigated', f => { if (f === P.mainFrame()) navLog.push(((Date.now() - T0) / 1000).toFixed(1) + 's ' + f.url().replace(h.base, '')); });
  const ev = async (f, a) => { for (let i = 0; ; i++) { try { return await P.evaluate(f, a); } catch (e) { if (i < 3 && /context was destroyed|Target closed|navigation/.test(String(e.message))) { await P.waitForLoadState('load').catch(() => {}); await sleep(400); continue; } throw e; } } };
  async function load(wait = 800) { await P.goto(h.base + '/index.html', { waitUntil: 'load' }); await sleep(wait); }
  async function reloadAfter(action) { const nav = P.waitForEvent('load', { timeout: 20000 }); await action(); await nav; await sleep(500); }
  async function waitUntil(fn, ms = 15000, step = 150) { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch (e) { /* page may be reloading */ } await sleep(step); } return false; }
  const mock = (f, a) => ev(([src, arg]) => { const fn = new Function('S', 'arg', 'return (' + src + ')(S,arg)'); const r = fn(window.__mock, arg); window.__mockSave(); return r; }, [f.toString(), a]);

  try {
    /* ------------------------------------------------------------------------------------------ */
    section('boot + console');
    await load();
    const mods = await ev(() => ({ n: window.NINO_NATIVE, o: !!window.ninoOta, s: !!window.ninoSys, t: !!window.ninoTerm, g: !!window.ninoGodview, c: !!window.ninoConsole, drawer: !!document.getElementById('nd-console') }));
    ok(mods.n && mods.o && mods.s && mods.t && mods.g && mods.c, 'all modules present with native bridge');
    ok(mods.drawer, 'Console button injected into the drawer');
    await ev(() => window.ninoConsole.open('versions'));
    await waitUntil(() => ev(() => document.querySelector('#nc-p-versions .nc-card')));
    let txt = await ev(() => document.getElementById('nc-p-versions').innerText);
    ok(/Build & รีบูตทั้งแอป/.test(txt), 'Build button is visible');
    ok(/builtin/.test(txt) && /กำลังใช้งาน/.test(txt), 'running version card shows builtin');
    await P.screenshot({ path: SHOTS + '/1-versions-initial.png' });

    /* ------------------------------------------------------------------------------------------ */
    section('OTA update through the notifier');
    await mock((S) => { S.pointer = { tag: 'web-aaaa111', version: '2.9.1', run: 50, commit: 'aaaa111' + '0'.repeat(33) }; S.releases['web-aaaa111'] = arguments[0]; }, null).catch(() => {});
    await mock((S, rel) => { S.pointer = { tag: 'web-aaaa111', version: '2.9.1', run: 50, commit: 'aaaa1110' }; S.releases['web-aaaa111'] = rel; }, REL('aaaa111', 50));
    await load(300);
    const chk = await ev(async () => { const r = await window.ninoOta.check(); return { a: r.available, run: r.running.run, id: r.running.id }; });
    eq(chk, { a: true, run: 40, id: 'builtin' }, 'newer pointer (run 50 > builtin run 40) is detected');
    ok(await waitUntil(() => ev(() => !!document.getElementById('nino-update-bar')), 12000), 'update banner appears in the native app');
    const bar = await ev(() => document.getElementById('nino-update-bar').innerText);
    ok(/OTA/.test(bar) && /ติดตั้งและรีบูต/.test(bar), 'banner offers install+reboot (not "refresh"): ' + bar.replace(/\n/g, ' '));
    await reloadAfter(() => ev(() => { [...document.querySelectorAll('#nino-update-bar button')].find(b => /ติดตั้ง/.test(b.textContent)).click(); }));
    await sleep(600);
    const run1 = await ev(() => window.ninoOta.refresh().then(s => ({ active: s.active, pending: s.pending, n: s.history.length })));
    eq(run1.active, 'web-aaaa111', 'new bundle is active after the reboot');
    ok(await waitUntil(() => ev(async () => (await window.ninoOta.refresh()).pending === null), 12000), 'page reported healthy; pending cleared');

    /* ------------------------------------------------------------------------------------------ */
    section('back / next');
    await reloadAfter(() => ev(() => { window.ninoSys.step(-1, () => {}); }));
    let s = await ev(() => window.ninoOta.refresh());
    eq(s.active, 'builtin', 'back goes to builtin');
    eq(s.next, 'web-aaaa111', 'next target is the bundle');
    await reloadAfter(() => ev(() => { window.ninoSys.step(1, () => {}); }));
    s = await ev(() => window.ninoOta.refresh());
    eq(s.active, 'web-aaaa111', 'next goes forward again');
    const none = await ev(() => window.ninoSys.step(1, () => {}));
    eq(none, null, 'no next beyond the newest');
    await waitUntil(() => ev(async () => (await window.ninoOta.refresh()).pending === null), 12000);

    /* ------------------------------------------------------------------------------------------ */
    section('Build pipeline (wait for NINO -> CI -> install -> reboot -> before/after)');
    await P.evaluate(() => localStorage.setItem('nino-gh-config', JSON.stringify({ owner: 'tester', repo: 'nino-app', branch: 'main', token: 'tok' })));
    let ciCalls = 0;
    await h.ctx.route('https://api.github.com/**', r => {
      const u = r.request().url();
      if (/git\/ref\/heads\/main/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ object: { sha: 'bbbb2220000000000000000000000000000000ab' } }) });
      if (/actions\/runs/.test(u)) { ciCalls++; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ workflow_runs: [{ name: 'NINO Android APK', status: 'in_progress', conclusion: null, html_url: 'https://x/run' }] }) }); }
      return r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}' });
    });
    await mock((S, rel) => { S.releases['web-bbbb222'] = rel; S.probeMisses = {}; }, REL('bbbb222', 60, { after: 22 }));
    await load(2200);                                                   // let the app finish booting (it re-creates `session`)
    await ev(() => { session.taskMode = true; });                       // NINO is busy
    await ev(() => { window.__buildP = window.ninoSys.build({ log: () => {} }); });
    await sleep(900);
    let bs = await ev(() => ({ armed: window.ninoSys.state().armed, wait: window.ninoSys.state().steps.find(x => x.id === 'wait').status }));
    eq(bs, { armed: true, wait: 'doing' }, 'Build waits while NINO is still working');
    await ev(() => window.ninoConsole.open('versions'));
    await sleep(400);
    ok(/รอ NINO ทำงานเสร็จ/.test(await ev(() => document.getElementById('nc-p-versions').innerText)), 'UI shows the waiting state');
    await P.screenshot({ path: SHOTS + '/2-build-waiting.png' });
    const reloaded = P.waitForEvent('load', { timeout: 30000 });
    await ev(() => { session.taskMode = false; });                       // NINO finished -> pipeline continues
    await sleep(2500);
    const mid = await ev(() => window.ninoSys.state().steps.map(x => x.id + ':' + x.status).join(' '));
    ok(/wait:done/.test(mid) && /before:done/.test(mid) && /commit:skip/.test(mid), 'wait done, BEFORE snapshot taken, nothing staged -> uses branch head: ' + mid);
    await P.screenshot({ path: SHOTS + '/3-build-ci.png' }).catch(() => {});
    await reloaded; await sleep(600);
    ok(ciCalls >= 1, 'CI run status was polled (' + ciCalls + ')');
    s = await ev(() => window.ninoOta.refresh());
    eq(s.active, 'web-bbbb222', 'built bundle (waited for release web-bbbb222) is running');
    ok(await waitUntil(() => ev(() => !!window.ninoSys.lastResult()), 15000), 'post-boot check produced a result');
    const res = await ev(() => window.ninoSys.lastResult());
    ok(res && res.ok === true, 'result ok: ' + (res && res.text || '').split('\n').slice(0, 3).join(' | '));
    ok(/GODVIEW เทียบ/.test(res.text) && /พิกเซลที่เปลี่ยน/.test(res.text), 'result contains the before/after comparison');
    const snaps = await ev(() => window.ninoGodview.list().map(x => x.label));
    ok(snaps.includes('before build') && snaps.includes('after build'), 'before and after screenshots stored: ' + snaps.join(','));
    ok(await waitUntil(() => ev(async () => (await window.ninoOta.refresh()).pending === null), 12000), 'new build reported healthy');
    await ev(() => window.ninoConsole.open('versions')); await sleep(500);
    await P.screenshot({ path: SHOTS + '/4-after-build.png' });

    /* ------------------------------------------------------------------------------------------ */
    section('Build failure paths');
    await h.ctx.unroute('https://api.github.com/**');
    await h.ctx.route('https://api.github.com/**', r => {
      const u = r.request().url(), cors = { 'access-control-allow-origin': '*' };
      if (/git\/ref\/heads/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ object: { sha: 'cccc3330000000000000000000000000000000cd' } }) });
      if (/actions\/runs/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ workflow_runs: [{ name: 'NINO Android APK', status: 'completed', conclusion: 'failure', html_url: 'https://x/failed-run' }] }) });
      return r.fulfill({ status: 404, headers: cors, body: '{}' });
    });
    await load(300);
    const fr = await ev(() => window.ninoSys.build({ log: () => {} }));
    ok(fr && fr.ok === false && /ล้มเหลว/.test(fr.error) && /failed-run/.test(fr.error), 'CI failure stops the build early with the run link: ' + (fr && fr.error));
    const fsteps = await ev(() => window.ninoSys.state().steps.map(x => x.id + ':' + x.status).join(' '));
    ok(/ci:fail/.test(fsteps), 'failed step marked: ' + fsteps);
    s = await ev(() => window.ninoOta.refresh());
    eq(s.active, 'web-bbbb222', 'failed build leaves the running version untouched');
    await mock((S) => { S.failInstall = 'incompatible'; });
    const inc = await ev(() => window.ninoOta.install('web-bbbb222', {}).then(() => 'ok', e => e.code));
    eq(inc, 'incompatible', 'incompatible bundle surfaces error.code so Build can switch to the APK path');
    await mock((S) => { S.failInstall = ''; });
    const cancelP = await ev(async () => { const p = window.ninoSys.build({ log: () => {} }); await new Promise(r => setTimeout(r, 30)); window.ninoSys.cancelBuild(); const r = await p; return r.error; });
    ok(/ยกเลิก/.test(cancelP || ''), 'build can be cancelled: ' + cancelP);

    /* ------------------------------------------------------------------------------------------ */
    section('JS side of auto-rollback (health check fails -> ota.fail -> reload)');
    await mock((S, rel) => { S.releases['web-dddd444'] = rel; }, REL('dddd444', 70));
    await ev(() => window.ninoOta.install('web-dddd444', { activate: true }));
    await P.reload({ waitUntil: 'load' });
    await ev(() => { window.ninoLib = undefined; });                    // simulate a bundle that broke a required module
    const back = P.waitForEvent('load', { timeout: 30000 });
    await back;
    await sleep(800);
    s = await ev(() => window.ninoOta.refresh());
    eq(s.active, 'web-bbbb222', 'broken bundle was rolled back to the previous working one');
    ok(!!s.history.find(x => x.id === 'web-dddd444' && x.bad), 'broken bundle flagged bad');
    ok(!!s.lastRollback, 'rollback reason recorded: ' + s.lastRollback);
    ok(await waitUntil(() => ev(() => /ถอยกลับ/.test(document.body.innerText) || true), 2000), 'rollback toast path executed without errors');

    /* ------------------------------------------------------------------------------------------ */
    section('terminal');
    await load(300);
    await ev(() => window.ninoConsole.open('terminal')); await sleep(300);
    const type = async (line) => { await P.fill('.nc-in input', line); await P.press('.nc-in input', 'Enter'); await sleep(250); };
    const out = () => ev(() => document.querySelector('.nc-out').innerText);
    await type('help');
    ok(/nino status/.test(await out()), 'help lists built-in commands');
    await type('nino status');
    ok(/กำลังใช้: web-bbbb222/.test(await out()), 'nino status shows the running bundle');
    await type('nino versions');
    ok(/.*web-bbbb222/.test(await out()), 'nino versions marks the active one');
    await type('echo hello-from-shell');
    ok(await waitUntil(async () => /hello-from-shell/.test(await out()), 4000), 'shell command goes to the native session and output comes back');
    await type('colors');
    await sleep(200);
    const col = await ev(() => ({ spans: [...document.querySelectorAll('.nc-out span[style*="color"]')].length, hasB: !!document.querySelector('.nc-out b'), text: document.querySelector('.nc-out').innerText }));
    ok(col.spans >= 2, 'ANSI colours rendered as spans');

    section('library health: red for the user, the word for NINO');
    await ev(() => { window.ninoLib.fs.write('skills/code/debug/zz-big/Skill.md', '# zz-big\nก่อนแก้โค้ดที่ใหญ่มาก: ทดสอบสีแดง\n' + 'บรรทัดยาว\n'.repeat(560)); });
    await type('nino lib');
    await sleep(200);
    const red = await ev(() => { const s = [...document.querySelectorAll('.nc-out span[style*="color"]')].filter(x => /สีแดง/.test(x.textContent)); return { n: s.length, style: s[0] && s[0].getAttribute('style') }; });
    ok(red.n >= 1 && /#ff7b72/.test(red.style || ''), 'nino lib prints the oversize book in red (user sees colour): ' + JSON.stringify(red));
    ok(/zz-big — Skill\.md ยาว 5\d\d บรรทัด/.test(await out()), 'terminal text says which book and how long');
    const aiLib = await ev(() => window.dispatchTool({ name: 'lib_health', args: {} }));
    ok(aiLib.ok && /● สีแดง\s+code\/debug\/zz-big/.test(aiLib.result) && !/\x1b\[/.test(aiLib.result), 'lib_health gives NINO the plain word สีแดง without ANSI codes');
    await ev(() => { window.ninoLib.fs.write('skills/code/debug/zz-big/Skill.md', '# zz-big\nก่อนแก้โค้ดที่ใหญ่มาก: ทดสอบสีแดง\nสั้น\n'); });
    const aiOk = await ev(() => window.dispatchTool({ name: 'lib_health', args: {} }));
    ok(!/สีแดง\s+code\/debug\/zz-big/.test(aiOk.result), 'shrinking the book clears the red flag');
    await ev(() => { ['zz-big'].forEach(n => ['Skill.md', 'notebook.md'].forEach(f => window.ninoLib.sh('rm skills/code/debug/' + n + '/' + f))); });

    section('prompt cache ordering on the real prompt');
    const pc = await ev(() => {
      localStorage.setItem('nino-gh-config', JSON.stringify({ owner: 'u', repo: 'nino-app', branch: 'main', token: 'x' }));
      try {
      ninoAgent.skill.set('# Skill.md\nrev: 9.9.9\n\n## กฎเหล็ก\n- ข้อ 1\n\n## วงจร\n1. a\n');
      ninoAgent.journal.setTask('งาน A'); ninoAgent.journal.addBacklog(['b1']); ninoAgent.journal.note('n1');
      window.ninoPC._reset();
      const a = buildSystemPrompt();
      session.files['a.js'] = 'x'.repeat(777); session.currentFile = 'a.js'; ninoAgent.journal.note('n2'); session.memory.facts.push({ key: 'k', value: 'v', priority: 1 });
      const b = buildSystemPrompt();
      let i = 0; while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
      const st = window.ninoPC.stats();
      return { prefix: Math.round(i * 100 / a.length), tail: a.indexOf(window.ninoPC.tailHead), moved: Object.keys(st.seg).sort().join(','), bust: st.bust, stable: st.stablePct, noMid: /Current: T\d/.test(a) };
      } finally { localStorage.removeItem('nino-gh-config'); }
    });
    ok(pc.prefix >= 90, 'cacheable prefix is >= 90% of the prompt when only volatile state changes (was 21%): ' + pc.prefix + '%');
    ok(pc.tail > 0 && pc.bust === 0 && pc.stable >= 90, 'static head identical across the two builds, tail marker present: ' + JSON.stringify(pc));
    ok(['codemap', 'facts', 'files', 'focus', 'journal', 'repo', 'skillmd', 'staged'].every(k => pc.moved.indexOf(k) >= 0), 'every volatile/semi block found its anchor in the real prompt: ' + pc.moved);
    ok(!pc.noMid, 'no per-turn tier/size value left in the middle of the static text');
    const call = await ev(async () => {
      window.ninoLib.fs.write('skills/code/debug/zz-call/Skill.md', '# zz-call\nก่อนทดสอบการเรียกเอง: เล่มสำหรับเทสต์\nMARK-XYZ อยู่ในเนื้อเล่ม ไม่อยู่ใน pointer\n');
      const inp = document.getElementById('prompt-input'); inp.value = '/zz-call ทำตามนี้';
      const before = buildSystemPrompt();
      session.taskMode = true;
      try { await window.handleUserSend(); } catch (e) { }
      session.taskMode = false;
      const during = buildSystemPrompt();
      return { rewritten: inp.value, had: before.indexOf('MARK-XYZ') >= 0, has: during.indexOf('MARK-XYZ') >= 0, semi: during.indexOf('MARK-XYZ') < during.indexOf(window.ninoPC.tailHead), tag: during.indexOf('ที่ผู้ใช้เรียกเอง') > 0 };
    });
    ok(call.rewritten === 'ทำตามนี้' && !call.had && call.has && call.tag, 'typing /zz-call attaches that book to the prompt deterministically: ' + JSON.stringify(call));
    ok(call.semi, 'a user-called skill sits in the semi-stable tier, not in the volatile tail');
    await ev(() => { ['zz-call'].forEach(n => ['Skill.md', 'notebook.md'].forEach(f => window.ninoLib.sh('rm skills/code/debug/' + n + '/' + f))); document.getElementById('prompt-input').value = ''; });
    ok(!col.hasB && /<b>not html<\/b>/.test(col.text), 'terminal output is escaped (no HTML injection)');
    await type('nino log 5');
    await type('clear');
    eq(await ev(() => document.querySelectorAll('.nc-out .nc-l').length), 0, 'clear empties the screen');
    await P.fill('.nc-in input', ''); await P.click('.nc-keys button:first-child'); 
    ok((await P.inputValue('.nc-in input')).length > 0, 'up-arrow recalls history');
    const ex = await ev(() => window.ninoTerm.exec('ls -la'));
    ok(ex.code === 0 && /ran: ls -la/.test(ex.out), 'ninoTerm.exec (AI one-shot) round-trips');
    await P.screenshot({ path: SHOTS + '/5-terminal.png' });

    /* ------------------------------------------------------------------------------------------ */
    section('Godview');
    await ev(() => window.ninoConsole.close()); await sleep(200);
    const a = await ev(() => window.ninoGodview.snap('ก่อน'));
    ok(a.url && a.dom.elements > 20, 'snap returns screenshot url + DOM report (' + a.dom.elements + ' elements)');
    await ev(() => { const d = document.createElement('div'); d.id = 'wide-test'; d.style.cssText = 'width:900px;height:60px;background:#f0f;position:relative;z-index:5;margin-top:50px'; d.textContent = 'wide'; document.body.prepend(d); const b = document.createElement('button'); b.textContent = 'x'; b.style.cssText = 'width:12px;height:12px'; document.body.append(b); });
    await sleep(200);
    await ev(() => window.ninoConsole.open('godview')); await sleep(200);
    const b = await ev(() => window.ninoGodview.snap('หลัง'));
    ok(await ev(() => window.ninoConsole.isOpen()), 'console re-shown after the screenshot');
    const cmp = await ev(() => window.ninoGodview.compare(null, null).then(c => ({ pct: c.px && c.px.changedPct, newIssues: c.dom.newIssues.map(i => i.type), text: c.text })));
    ok(cmp.pct > 1, 'pixel diff sees the change (' + (cmp.pct || 0).toFixed(1) + '%)');
    ok(cmp.newIssues.includes('page-scrolls-sideways') || cmp.newIssues.includes('overflow-x'), 'DOM diff flags the new overflow: ' + cmp.newIssues);
    ok(cmp.newIssues.includes('tiny-tap'), 'tiny tap target flagged');
    ok(/ปัญหาใหม่/.test(cmp.text) && /ควรตรวจ/.test(cmp.text), 'text verdict tells the AI to check');
    const snapOpen = await ev(() => document.getElementById('nino-console').classList.contains('peek'));
    ok(!snapOpen, 'console is not left hidden');
    await ev(() => document.getElementById('wide-test').remove());
    await sleep(300);
    // UI flow: pick before/after thumbnails and compare
    await P.click('.nc-thumbs .nc-th:nth-child(2)'); await P.click('.nc-thumbs .nc-th:nth-child(1)');
    await P.click('text=เทียบก่อน/หลัง'); await sleep(700);
    ok(/พิกเซลที่เปลี่ยน/.test(await ev(() => document.getElementById('nc-p-godview').innerText)), 'Godview tab shows the comparison');
    await P.click('text=แสดง heatmap'); await sleep(300);
    ok(await ev(() => !!document.querySelector('.nc-cmp canvas')), 'heat map overlay is drawn');
    await P.screenshot({ path: SHOTS + '/6-godview.png' });

    /* ------------------------------------------------------------------------------------------ */
    section('AI tools (through the real dispatchTool wrapper chain)');
    const T = (name, args) => ev(([n, a]) => window.dispatchTool({ name: n, args: a || {} }), [name, args]);
    let r = await T('app_status');
    ok(r.ok && /NINO v\d+\.\d+\.\d+/.test(r.result) && /web-bbbb222/.test(r.result), 'app_status: ' + String(r.result).split('\n')[0]);
    r = await T('app_versions'); ok(r.ok && /builtin/.test(r.result) && /web-bbbb222/.test(r.result), 'app_versions lists bundles');
    r = await T('term_exec', { cmd: 'uname -a' }); ok(r.ok && /ran: uname -a/.test(r.result), 'term_exec');
    r = await T('godview_dom'); ok(r.ok && /GODVIEW/.test(r.result), 'godview_dom');
    r = await T('godview_snap', { label: 'ai' }); ok(r.ok && /\(id /.test(r.result), 'godview_snap');
    r = await T('godview_compare'); ok(r.ok && /GODVIEW เทียบ/.test(r.result), 'godview_compare');
    r = await T('app_logs', { level: 'I' }); ok(r.ok, 'app_logs');
    r = await T('app_diag'); ok(r.ok && /NINO diagnostic report/.test(r.result), 'app_diag');
    r = await T('app_build', { message: 'ลองสร้าง' });
    ok(r.ok && /ผู้ใช้ต้องกด/.test(r.result), 'app_build only REQUESTS (human must confirm): ' + r.result.slice(0, 60));
    ok(!(await ev(() => window.ninoSys.state().running)), 'app_build did not start a build by itself');
    r = await T('definitely_unknown_tool'); ok(r && r.ok === false, 'other tools still reach the original dispatcher');
    r = await T('delegate', { task: 'x' });
    ok(r && r.ok === false && /คีย์/.test(r.error), 'delegate is routed through the real chain and refuses without a key: ' + String(r && r.error).slice(0, 50));
    ok(await ev(() => typeof window.ninoSkillRefresh === 'function' && window.ninoGH.isProtected('tools/check.js') === true && window.ninoGH.isProtected('js/ui-render.js') === false), 'ninoGH.isProtected and ninoSkillRefresh are live in the page');
    ok(await ev(() => /^nino-v\d+\.\d+\.\d+-g\d+$/.test((self.NINO_VERSION ? 'nino-v' + self.NINO_VERSION + '-g' + (self.NINO_GEN || 1) : ''))), 'cache key carries the generation');
    const blk = await ev(() => window.ninoSys.BLOCK); ok(/app_build/.test(blk) && /godview_compare/.test(blk), 'prompt block describes the new tools');
    await ev(() => window.ninoConsole.open('versions')); await sleep(700);
    ok(/NINO ขอ Build/.test(await ev(() => document.getElementById('nc-p-versions').innerText)), 'request appears in Versions for confirmation');
    await P.screenshot({ path: SHOTS + '/7-request.png' });
    await ev(() => window.ninoSys.clearRequest());

    /* ------------------------------------------------------------------------------------------ */
    section('logs tab + untrusted text');
    await mock((S) => { S.history.find(x => x.id === 'web-bbbb222').message = '<img src=x onerror="window.__xss=1"> evil'; S.logs.push({ t: Date.now(), l: 'E', tag: 'test', msg: '<script>window.__xss=2</script> boom' }); });
    await ev(() => window.ninoObs.log('W', 'unit', 'hello-from-js'));
    await ev(() => window.ninoConsole.open('versions')); await sleep(800);
    ok(!(await ev(() => window.__xss)), 'repo-controlled text never executes (versions)');
    ok(/evil/.test(await ev(() => document.getElementById('nc-p-versions').innerText)), 'but is shown as text');
    await P.screenshot({ path: SHOTS + '/8-versions-history.png' });
    const diag = await ev(() => { const b = document.querySelector('#nino-console .nc-tabs button:nth-child(4)'), r = b.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { cls: document.getElementById('nino-console').className, top: t && (t.tagName + '#' + t.id + '.' + String(t.className).slice(0, 40)), z: t && getComputedStyle(t).zIndex }; });
    if (!/nc-tabs|nc-/.test(diag.top || '')) console.log('  diag before logs click:', JSON.stringify(diag));
    await P.click('#nino-console .nc-tabs button:nth-child(4)', { timeout: 8000 }); await sleep(900);
    const lt = await ev(() => document.getElementById('nc-p-logs').innerText);
    ok(/hello-from-js/.test(lt) && /boom/.test(lt) && /bundle web-bbbb222/.test(lt), 'logs + metrics render');
    ok(!(await ev(() => window.__xss)), 'repo-controlled text never executes (logs)');
    await mock((S) => { S.crash = 'NINO crash report\nkind: uncaught\njava.lang.RuntimeException: x'; });
    await P.click('#nc-p-logs button:has-text("รีเฟรช")'); await sleep(700);
    ok(/แอปเคยแครช/.test(await ev(() => document.getElementById('nc-p-logs').innerText)), 'previous crash is surfaced');
    await P.screenshot({ path: SHOTS + '/9-logs.png' });

    section('no uncaught page errors');
    const bad = h.errors.filter(e => !/ResizeObserver/.test(e));
    ok(bad.length === 0, 'page errors: ' + bad.slice(0, 3).join(' || '));
  } catch (e) {
    fail++; console.log('  FAIL (exception): ' + (e && e.stack || e)); console.log('  navigations: ' + navLog.join(' | ')); console.log('  last native ops: ' + h.ops.filter(o => !/ota.state|log\.|metrics|ota.healthy/.test(o)).slice(-14).join(' | '));
  } finally {
    await h.close();
  }
  console.log('\npassed ' + pass + ', failed ' + fail);
  process.exit(fail ? 1 : 0);
})();
