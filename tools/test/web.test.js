/* Pure-function tests for the web layer (no browser needed). Run: node tools/test/web.test.js */
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
function eq(a, b, n) { const s = JSON.stringify(a) === JSON.stringify(b); if (!s) console.log('    expected', JSON.stringify(b), 'got', JSON.stringify(a)); ok(s, n); }

function load(file, extra) {
  const win = { addEventListener() {}, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} } };
  const ctx = Object.assign({ console: { error() {}, warn() {}, log() {} }, localStorage: win.localStorage, navigator: { onLine: true }, location: { href: 'x' }, self: {}, setTimeout, clearTimeout }, extra || {});
  ctx.window = ctx; ctx.addEventListener = () => {}; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  return ctx;
}

console.log('== terminal helpers');
const term = load('js/term.js').ninoTerm;
eq(term._ansi('\x1b[31mred\x1b[0m plain'), '<span style="color:#ff7b72">red</span> plain', 'SGR red -> span');
eq(term._ansi('<b>x</b> & "y"'), '&lt;b&gt;x&lt;/b&gt; &amp; "y"', 'HTML is escaped');
eq(term._ansi('\x1b[1;32mok\x1b[0m'), '<span style="color:#8FD3B0;font-weight:700">ok</span>', 'bold + green');
eq(term._ansi('a\x1b[2Kb\x1b[?25lc\x1b]0;title\x07d'), 'abcd', 'cursor/OSC sequences are dropped');
eq(term._ansi('\x1b[38;5;196mhi\x1b[0m'), 'hi', '256-colour params are skipped without garbage');
eq(term._ansi('\x1b[31mx'), '<span style="color:#ff7b72">x</span>', 'open span is closed');
eq(term._strip('\x1b[31mred\x1b[0m'), 'red', 'stripAnsi');
eq(term._words('ls -la "my dir" \'a b\' x'), ['ls', '-la', 'my dir', 'a b', 'x'], 'word splitting honours quotes');
eq(term._words('echo ""'), ['echo', ''], 'empty quoted arg kept');
ok(/nino build/.test(term._help) && /nino back/.test(term._help), 'help text lists build/back');

console.log('== godview diff');
const gv = load('js/godview.js').ninoGodview;
function img(w, h, f) { const a = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x, y), p = (y * w + x) * 4; a[p] = c[0]; a[p + 1] = c[1]; a[p + 2] = c[2]; a[p + 3] = 255; } return a; }
const W = 80, Hh = 140, base = img(W, Hh, () => [10, 10, 10]);
let d = gv._diff(base, base, W, Hh);
eq(d.changedPct, 0, 'identical images: 0% changed'); ok(d.bbox === null, 'identical: no bbox');
const half = img(W, Hh, (x, y) => (y < Hh / 2 ? [250, 250, 250] : [10, 10, 10]));
d = gv._diff(base, half, W, Hh);
ok(Math.abs(d.changedPct - 50) < 1, 'top half changed = ~50% (' + d.changedPct.toFixed(1) + ')');
ok(d.bbox && d.bbox.y === 0 && d.bbox.h > 0.45 && d.bbox.h < 0.55, 'bbox covers the top half');
const rg = gv.regions(d);
ok(rg.length >= 2 && /บน/.test(rg[0].name) && !/ล่าง/.test(rg[0].name), 'regions say the TOP changed: ' + JSON.stringify(rg.slice(0, 2)));
const tiny = img(W, Hh, (x, y) => (x < 2 && y < 2 ? [250, 250, 250] : [10, 10, 10]));
d = gv._diff(base, tiny, W, Hh);
ok(d.changedPct > 0 && d.changedPct < 0.2, 'tiny change is tiny (' + d.changedPct.toFixed(3) + '%)');
const slight = img(W, Hh, () => [20, 20, 20]);
eq(gv._diff(base, slight, W, Hh).changedPct, 0, 'tiny colour noise under threshold is ignored');

console.log('== godview dom diff + wording');
const A = { elements: 100, labels: ['Chat', 'Files'], issues: [{ type: 'tiny-tap', sel: 'button#a', detail: '10x10px' }], version: '2.9.0', bundle: 'builtin' };
const B = { elements: 110, labels: ['Chat', 'Build'], issues: [{ type: 'tiny-tap', sel: 'button#a', detail: '10x10px' }, { type: 'overflow-x', sel: 'div.x', detail: '900>390' }], version: '2.9.1', bundle: 'web-1' };
const dd = gv._domDiff(A, B);
eq(dd.added, ['Build'], 'added labels'); eq(dd.removed, ['Files'], 'removed labels');
eq(dd.newIssues.map(i => i.type), ['overflow-x'], 'only the NEW issue is reported (the old one is not)');
eq(dd.fixedIssues, [], 'nothing fixed'); eq(dd.elementsDelta, 10, 'element delta');
eq(dd.versionChanged, '2.9.0 → 2.9.1', 'version change'); eq(dd.bundleChanged, 'builtin → web-1', 'bundle change');
let txt = gv._describeCompare({ id: 'a', label: 'ก่อน' }, { id: 'b', label: 'หลัง' }, { changedPct: 12.34, heat: new Array(112).fill(0), gw: 8, gh: 14 }, dd);
ok(/12\.3%/.test(txt) && /ปัญหาใหม่ \(1\)/.test(txt) && /ควรตรวจก่อนใช้ต่อ/.test(txt), 'verdict flags new issue');
txt = gv._describeCompare({ id: 'a' }, { id: 'b' }, { changedPct: 0.05, heat: new Array(112).fill(0), gw: 8, gh: 14 }, gv._domDiff(A, A));
ok(/แทบไม่ต่าง/.test(txt) && /ไม่พบปัญหาใหม่/.test(txt), 'clean verdict when nothing changed');
txt = gv._describeCompare({ id: 'a' }, { id: 'b' }, null, gv._domDiff(A, A));
ok(/ไม่มีภาพหน้าจอ/.test(txt), 'works without screenshots');
ok(/ปัญหาที่พบ \(1\)/.test(gv._describeSnap({ id: 's1', label: 'x', t: 0, dom: { viewport: { w: 390, h: 800 }, elements: 5, labels: [], issues: [{ type: 'tiny-tap', sel: 'b', detail: '' }] } })), 'describeSnap lists issues');

console.log('== OTA update detection');
const ota = load('js/ota.js').ninoOta;
ok(ota._isNewer({ run: 51 }, { run: 50 }), 'higher run is newer');
ok(!ota._isNewer({ run: 50 }, { run: 50 }), 'same run is not newer');
ok(!ota._isNewer({ run: 49 }, { run: 50 }), 'lower run is not newer (no silent downgrade)');
ok(!ota._isNewer(null, { run: 1 }), 'no pointer -> nothing to install');
ok(ota._isNewer({ run: 5, commit: 'a' }, { run: 0, commit: 'b' }), 'unknown running run + different commit -> offer');
ok(!ota._isNewer({ run: 5, commit: 'a' }, { run: 0, commit: 'a' }), 'same commit -> nothing to do');

console.log('== diagnostic report');
const obs = load('js/obs.js', { NINO_VERSION: '2.9.0' }).ninoObs;
const rep = obs._format({ at: '2026-11-06T00:00:00Z', app: { version: '2.9.0', build: 1, bundle: 'web-1', native: 'yes' }, page: { url: 'u', vw: 390, vh: 800, online: true, uptime: 5 },
  errors: [{ t: 0, tag: 'window', msg: 'boom\nstack' }], metrics: { uptimeSec: 9, activeBundle: 'web-1', counters: { b: 2, a: 1 } }, nativeLog: [{ l: 'E', tag: 'ota', msg: 'bad' }], crash: 'kind: x\nfoo' });
ok(/bundle web-1/.test(rep) && /page errors \(1\)/.test(rep) && /counters: a=1 b=2/.test(rep) && /E\/ota: bad/.test(rep) && /last native crash/.test(rep), 'report has all sections');
ok(!/stack/.test(rep.split('page errors')[1].split('native metrics')[0].split('\n')[1] || ''), 'only first line of each error');
ok(/none/.test(obs._format({ page: {}, app: {} })), 'empty report says none');

console.log('== system tools');
const sys = load('js/nino-sys.js', { toast() {} });
const S = sys.ninoSys;
['app_status', 'app_versions', 'app_build', 'app_rollback', 'app_logs', 'app_diag', 'term_exec', 'godview_snap', 'godview_compare', 'godview_dom', 'godview_list'].forEach(n => ok(S.TOOLS.test(n), 'tool registered: ' + n));
['gh_commit', 'sh', 'app_build_now', 'xapp_status'].forEach(n => ok(!S.TOOLS.test(n), 'not hijacked: ' + n));
ok(S.BLOCK.length < 1700, 'prompt block stays small (' + S.BLOCK.length + ' chars)');
const c2 = load('js/nino-sys.js', { toast() {} });
let calls = [];
c2.dispatchTool = async (c) => { calls.push(c.name); return { ok: true, result: 'orig' }; };
c2.buildSystemPrompt = () => 'BASE';
c2.ninoSys._hook();
(async () => {
  const r1 = await c2.dispatchTool({ name: 'gh_status', args: {} });
  eq(r1.result, 'orig', 'foreign tools reach the original dispatcher');
  const r2 = await c2.dispatchTool({ name: 'app_status', args: {} });
  ok(r2.ok && /NINO v/.test(r2.result) && calls.length === 1, 'own tools are handled without the original');
  ok(/^BASE/.test(c2.buildSystemPrompt()) && /app_build/.test(c2.buildSystemPrompt()), 'prompt gets the block appended');
  c2.ninoSys._hook();
  eq((c2.buildSystemPrompt().match(/ระบบแอปจริง/g) || []).length, 1, 'hook is idempotent (block appended once)');
  const r3 = await c2.dispatchTool({ name: 'app_versions' });
  ok(r3.ok === false && /APK/.test(r3.error), 'native-only tools explain themselves in the browser');
  // ---- loop guard: อ่านรีโปซ้ำต้องไม่เด้งข้อความ "ตรวจพบว่าวนซ้ำ" ง่าย ๆ ----
  console.log('== loop guard');
  function lg(handler) {
    const c = load('js/loop-guard.js', { session: { files: {}, currentFile: 'app.js' }, orchestratorState: {}, orchestratorRun() {}, dispatchTool: handler });
    c.orchestratorRun(); // เริ่มรอบใหม่ = เปิดตัวกัน
    return c;
  }
  const tree = lg(async () => ({ ok: true, result: '[repo] app.js' }));
  let last;
  let r4;
  for (let i = 1; i <= 5; i++) { last = await tree.dispatchTool({ name: 'gh_tree', args: {} }); if (i === 4) r4 = last; }
  ok(!last.pause && !/ตรวจพบว่าวนซ้ำ/.test(JSON.stringify(last)), 'gh_tree 5 ครั้งไม่หยุดและไม่มีข้อความเดิม');
  ok(r4.loop_warning && !/ตรวจพบว่าวนซ้ำ/.test(r4.loop_warning), 'AI ได้คำใบ้เบา ๆ ในผลลัพธ์แทน');
  const t3 = lg(async () => ({ ok: true, result: 'x' }));
  let r6; for (let i = 1; i <= 6; i++) r6 = await t3.dispatchTool({ name: 'gh_tree', args: {} });
  ok(r6.pause === true && !/ตรวจพบว่าวนซ้ำ|ฟังก์ชันที่มีจริง/.test(r6.result), 'ซ้ำ 6 ครั้งเท่านั้นถึงหยุด (ข้อความสั้น ไม่มี list_functions)');
  t3.ninoLoopGuard.cfg.hardStop = false; t3.ninoLoopGuard.reset();
  let r9; for (let i = 1; i <= 9; i++) r9 = await t3.dispatchTool({ name: 'gh_tree', args: {} });
  ok(!r9.pause, 'hardStop=false ปิดการหยุดจริงได้');
  const exp = lg(async () => ({ ok: true, result: 'x' }));
  let re; for (let i = 1; i <= 40; i++) re = await exp.dispatchTool({ name: 'gh_outline', args: { path: 'f' + i + '.js' } });
  ok(!re.pause && !re.loop_warning, 'อ่านไฟล์ต่างกัน 40 ครั้ง = สำรวจปกติ ไม่ใช่วน');
  const ed = lg(async () => ({ ok: true, result: 'edited' }));
  let rw; for (let i = 1; i <= 40; i++) { await ed.dispatchTool({ name: 'gh_read', args: { path: 'a', startLine: i } }); rw = await ed.dispatchTool({ name: 'gh_edit', args: { path: 'a', ops: [i] } }); }
  ok(!rw.pause && !rw.loop_warning, 'gh_edit สำเร็จนับเป็นความคืบหน้า ไม่ถูกมองว่าว่างงาน');
  const bad = lg(async () => ({ ok: false, error: 'ไม่พบไฟล์' }));
  let rb; for (let i = 1; i <= 8; i++) rb = await bad.dispatchTool({ name: 'gh_read', args: { path: 'p' + i } });
  ok(rb.pause === true, 'ล้มเหลวติดกัน 8 ครั้งยังมีเบรกสุดท้าย');
  // ---- delegate: ฝากงานเล็กให้โมเดลถูก (skills/code/delegate/qwen-agent) ----
  console.log('== delegate');
  function dg(cfg, files, reply) {
    const calls = [];
    const c = load('js/delegate.js', {
      session: { files: files || {} }, getCfg: () => cfg, AbortController,
      compatProfile: x => x.provider === 'tokenme' ? { label: 'TokenMe', base: 'https://tm.example/v1', key: x.tokenmeApiKey, models: ['tm-model'] } : { label: '9arm', base: 'https://gw.example/v1', key: x.ninearmApiKey, models: ['qwen-x'] },
      dispatchTool: async () => ({ ok: true, result: 'passthrough' }), buildSystemPrompt: () => 'BASE',
      fetch: async (url, opt) => { calls.push({ url, opt, body: JSON.parse(opt.body) }); return reply || { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '<think>hmm</think>ผลลัพธ์' }, finish_reason: 'stop' }], usage: { completion_tokens: 7 } }) }; }
    });
    c.calls = calls; return c;
  }
  const nokey = dg({});
  let d = await nokey.dispatchTool({ name: 'delegate', args: { task: 'x' } });
  ok(d.ok === false && /คีย์/.test(d.error) && !nokey.calls.length, 'ไม่มีคีย์ → บอกให้ทำเอง ไม่ยิงเครือข่าย');
  ok(nokey.buildSystemPrompt() === 'BASE', 'ไม่มีคีย์ → ไม่โฆษณาเครื่องมือในพรอมต์');
  const a9 = dg({ ninearmApiKey: 'k9', tokenmeApiKey: 'kt' }, { 'api.js': 'const A=1;' });
  d = await a9.dispatchTool({ name: 'delegate', args: { task: 'จัดไฟล์', files: ['api.js'] } });
  ok(d.ok && /ผลลัพธ์/.test(d.result) && !/hmm/.test(d.result), 'ตัดบล็อก <think> ออกจากผล');
  ok(/ตรวจผลเอง/.test(d.result), 'ผลทุกครั้งมีคำเตือนให้ตรวจเอง');
  const q = a9.calls[0];
  ok(q.url === 'https://gw.example/v1/chat/completions' && q.opt.headers.Authorization === 'Bearer k9' && q.body.model === 'qwen-x', 'ใช้ 9arm ก่อน TokenMe ด้วยคีย์และโมเดลของ 9arm');
  ok(/const A=1;/.test(q.body.messages[1].content) && /FILE: api\.js/.test(q.body.messages[1].content), 'แนบเนื้อไฟล์จากแท็บ Files เข้า prompt');
  ok(a9.buildSystemPrompt().indexOf('delegate {task') > 0, 'มีคีย์ → พรอมต์มีเครื่องมือ delegate');
  ok((await a9.dispatchTool({ name: 'other' })).result === 'passthrough', 'เครื่องมืออื่นผ่านต่อไปตามเดิม');
  await a9.dispatchTool({ name: 'delegate', args: { task: 'y', provider: 'tokenme' } });
  ok(a9.calls[1].url.indexOf('tm.example') > 0 && a9.calls[1].body.model === 'tm-model', 'ระบุ provider:tokenme ได้');
  const th = dg({ ninearmApiKey: 'k' });
  d = await th.dispatchTool({ name: 'delegate', args: { task: 'ก'.repeat(150000) } });
  ok(d.ok === false && /ใหญ่เกิน/.test(d.error) && !th.calls.length, 'ภาษาไทย 150k ตัวอักษรเกินเพดานบริบท (นับหนักกว่าอังกฤษ)');
  d = await th.dispatchTool({ name: 'delegate', args: { task: 'a'.repeat(150000) } });
  ok(d.ok === true, 'อังกฤษ 150k ตัวอักษรยังพอดี (~37k โทเคน)');
  d = await th.dispatchTool({ name: 'delegate', args: { task: 'ใช้คีย์ ' + 'gh' + 'p_' + 'a'.repeat(36) } });
  ok(d.ok === false && /token|คีย์/.test(d.error), 'พบรูปแบบ token ในงาน → ไม่ส่งออกนอกเครื่อง');
  d = await th.dispatchTool({ name: 'delegate', args: { task: 'x', files: ['none.js'] } });
  ok(d.ok === false && /ไม่พบไฟล์/.test(d.error), 'ไฟล์ที่ไม่มีในแท็บ Files → บอกชัด');
  d = await th.dispatchTool({ name: 'delegate', args: { task: 'x', files: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] } });
  ok(d.ok === false && /ไม่เกิน 8/.test(d.error), 'แนบเกิน 8 ไฟล์ถูกปฏิเสธ');
  const e401 = dg({ ninearmApiKey: 'k' }, {}, { ok: false, status: 401, json: async () => ({ error: { message: 'bad key' } }) });
  d = await e401.dispatchTool({ name: 'delegate', args: { task: 'x' } });
  ok(d.ok === false && /คีย์ไม่ผ่าน/.test(d.error), '401 → บอกว่าคีย์ไม่ผ่าน');
  const e429 = dg({ ninearmApiKey: 'k' }, {}, { ok: false, status: 429, json: async () => ({}) });
  d = await e429.dispatchTool({ name: 'delegate', args: { task: 'x' } });
  ok(d.ok === false && /โควต้า/.test(d.error), '429 → บอกว่าติดโควต้า');

  // ---- Skill.md ในเครื่องต้องรับฉบับใหม่จากรีโป (rev) โดยไม่ทับของที่ใหม่กว่า ----
  console.log('== skill refresh');
  {
    const src = fs.readFileSync(path.join(ROOT, 'js/modes-session.js'), 'utf8');
    const code = src.slice(src.indexOf('window.ninoSkillRefresh = async function'));
    const st = {}, ls = { getItem: k => (st[k] === undefined ? null : st[k]), setItem: (k, v) => { st[k] = String(v); } };
    let skill = 'old', toasts = 0, remote = '# Skill.md\nrev: 2.11.0 x\nbody';
    const c = { localStorage: ls, toast() { toasts++; }, NINO_VERSION: '2.11.0', NINO_BUILD: 1, ninoAgent: { skill: { get: () => skill, set: t => { skill = t; } } }, ninoGH: { configured: () => true, readText: async () => remote } };
    c.window = c; c.self = c; vm.createContext(c); vm.runInContext(code, c);
    ok(await c.ninoSkillRefresh() === true && skill === remote && st['nino-skill-bak'] === 'old' && toasts === 1, 'ฉบับในเครื่องไม่มี rev → ดึงจากรีโป สำรองของเดิมไว้');
    ok(await c.ninoSkillRefresh() === false, 'เลขเวอร์ชัน/build เดิมแล้ว ไม่ยิง GitHub ซ้ำ');
    st['nino-skill-chk'] = ''; skill = '# x\nrev: 2.12.0';
    ok(await c.ninoSkillRefresh() === false && skill === '# x\nrev: 2.12.0', 'ในเครื่องใหม่กว่า → ไม่ทับ');
  }

  // ---- สุขภาพหอสมุด: แดง/เหลือง/เขียว + pointer + ประตูตัดสินใจ ----
  console.log('== library health');
  const LH = load('js/lib-health.js').ninoLibHealth;
  const fx = m => ({ keys: () => Object.keys(m), read: k => (m[k] === undefined ? null : m[k]) });
  const bk = (n, l2, body, sh) => ({ ['skills/c/' + (sh || 's') + '/' + n + '/Skill.md']: '# ' + n + '\n' + l2 + '\n' + (body || ''), ['skills/c/' + (sh || 's') + '/' + n + '/notebook.md']: '# สมุด\n' });
  const GOOD = 'ก่อนแก้ไฟล์ที่ยาวเกิน 300 บรรทัด: แบ่งเป็นช่วงแล้วแก้ทีละช่วง';
  const iss = (m, o) => LH.audit(fx(m), o).issues;
  const has = (m, lvl, re, o) => iss(m, o).some(i => i.level === lvl && re.test(i.msg));
  ok(iss(bk('ok', GOOD)).length === 0, 'เล่มปกติ = สีเขียว ไม่มีข้อติ');
  ok(has(bk('big', GOOD, 'x\n'.repeat(500)), 'red', /ยาว 5\d\d บรรทัด/), 'Skill.md เกิน 500 บรรทัด = สีแดง');
  ok(!has(bk('edge', GOOD, 'x\n'.repeat(497)), 'red', /ยาว/), 'ไม่เกิน 500 บรรทัด ไม่แดง');
  ok(has(bk('mid', GOOD, 'x\n'.repeat(250)), 'yellow', /ยาว 2\d\d บรรทัด/), 'เกิน 200 บรรทัด = สีเหลือง');
  { const m = bk('nonb', GOOD); delete m['skills/c/s/nonb/notebook.md']; ok(has(m, 'red', /ไม่มีสมุดจด/), 'ไม่มี notebook.md = สีแดง'); }
  ok(has(bk('e', ''), 'red', /ว่าง/), 'pointer ว่าง = สีแดง');
  for (const [d, re, why] of [
    ['ปัญหาเดิม: AI สร้างไฟล์ซ้ำไม่รู้จบและผู้ใช้มองไม่เห็นไฟล์', /คำนามกว้าง/, 'ขึ้นต้นด้วยคำนามกว้าง'],
    ['วิธีทำงานกับไฟล์ต่างๆ ให้ถูกต้องและรวดเร็วขึ้นมาก', /คลุมเครือ/, 'คำคลุมเครือ'],
    ['ทำให้ไฟล์ดีขึ้นนิดหน่อยในบางกรณีที่ผู้ใช้อยากได้ผลลัพธ์ที่ถูกต้องและรวดเร็ว ก่อนส่ง', /ท้ายประโยค/, 'ตัวกระตุ้นอยู่ท้ายประโยค'],
    ['เมื่อ' + 'ก'.repeat(150), /ยาว 1\d\d ตัวอักษร/, 'ยาวเกินสารบัญ'],
    ['แก้ไฟล์ (ที่มา 9arm)', /ป้ายที่มา/, 'มีป้ายที่มา']
  ]) ok(has(bk('w', d), 'yellow', re), 'pointer อ่อน → สีเหลือง: ' + why);
  ok(has(bk('d1', GOOD, 'ดู skill_read ghost-book ต่อ'), 'red', /ชี้ไปเล่มที่ไม่มี: ghost-book/), 'สกิลชี้ไปเล่มที่ไม่มี = สีแดง');
  ok(!has(bk('d2', GOOD, 'skill_read {name}'), 'red', /ชี้ไปเล่ม/), 'ตัวแทน {name} ไม่นับ');
  ok(has(bk('d3', GOOD, 'รัน skills/c/s/d3/scripts/x.js'), 'red', /ชี้ไฟล์ที่ไม่มีจริง/), 'path ที่ไม่มีจริง = สีแดง');
  const two = Object.assign({}, bk('aa', GOOD), bk('bb', 'เมื่อผล error ขึ้นเลข 500: เปิดเล่มนี้เพื่อดูข้อความ'));
  ok(has(two, 'yellow', /ไม่มีประตูตัดสินใจ/), 'ชั้นที่มี 2 เล่มแต่ไม่มีประตู = สีเหลือง');
  const gated = Object.assign({ 'skills/_gates.md': '# x\nแก้ไฟล์ | ผล error ขึ้นเลข 500 ในแอป → bb ; แก้หลายจุดในไฟล์เดียว → aa\n' }, two);
  ok(iss(gated).length === 0, 'มีประตูครอบทุกเล่มในชั้น → เขียว');
  ok(has(Object.assign({ 'skills/_gates.md': 'เรื่อง | แก้ไฟล์ใหญ่หลายจุด → aa ; ผล error ขึ้นเลข 500 → nope\n' }, two), 'red', /ชี้เล่มที่ไม่มี: nope/), 'ประตูชี้เล่มที่ไม่มี = สีแดง');
  ok(has(Object.assign({ 'skills/_gates.md': 'เรื่อง | แก้ → aa ; ผล error ขึ้นเลข 500 → bb\n' }, two), 'yellow', /ไม่มีเงื่อนไขที่ชัด/), 'ทางเลือกในประตูไม่มีเงื่อนไขชัด = สีเหลือง');
  ok(has(bk('r', GOOD), 'red', /เกิน 6000/, { root: 'ก'.repeat(6001) }), 'Skill.md ราก > 6000 ตัวอักษร = สีแดง');
  ok(has(bk('r', GOOD), 'yellow', /คลุมเครือ "ตรงเรื่อง"/, { root: '1. เมื่อเริ่ม: มีสกิลตรงเรื่อง → skill_read ก่อนลงมือ' }), 'pointer ใน Skill.md ราก ที่คลุมเครือ = สีเหลือง');
  const rr = LH.audit(fx(bk('big2', GOOD, 'x\n'.repeat(600))));
  const ap = LH.format(rr, { ansi: true }), pl = LH.format(rr, { ansi: false });
  ok(/\x1b\[31m● สีแดง\x1b\[0m/.test(ap), 'โหมดเทอร์มินัล: ผู้ใช้เห็นสีแดง (ANSI 31)');
  ok(/● สีแดง/.test(pl) && !/\x1b/.test(pl), 'โหมดเครื่องมือ: NINO เห็นคำว่า สีแดง ไม่มีรหัสสี');
  { const real = fs.readdirSync(path.join(ROOT, 'skills')); ok(real.length > 0, 'มี skills/ ในรีโปให้ตรวจ'); }

  // ---- ผู้ใช้เรียกสกิลเอง /ชื่อเล่ม ----
  console.log('== user-invoked skill');
  {
    const seen = [], inp = { value: '' }, toasts = [];
    const chr = { mode: 'code' };
    const store = { 'skills/code/debug/debug-mantra/Skill.md': '# debug-mantra\nเมื่อบั๊กทำซ้ำไม่ได้: ท่อง mantra\nCONTENT-MARK\n' };
    const c = load('js/lib-health.js', {
      document: { getElementById: () => inp }, toast: m => toasts.push(m),
      currentCharacter: chr, dispatchTool: async () => ({ ok: true, result: 'passthrough' }),
      ninoLib: { fs: { keys: () => Object.keys(store), read: k => store[k] } },
      handleUserSend: function () { seen.push(inp.value); return Promise.resolve(); }, buildSystemPrompt: () => 'BASE'
    });
    inp.value = '/debug-mantra ช่วยหาบั๊กนี้'; await c.handleUserSend();
    ok(seen[0] === 'ช่วยหาบั๊กนี้' && toasts.length === 1, 'ตัด /ชื่อเล่ม ออกก่อนส่ง และแจ้งผู้ใช้');
    ok(/## SKILL ที่ผู้ใช้เรียกเอง \(\/debug-mantra\)[\s\S]*CONTENT-MARK/.test(c.buildSystemPrompt()), 'เนื้อเล่มถูกแนบเข้าพรอมต์ของงานนี้');
    inp.value = 'ข้อความธรรมดา'; await c.handleUserSend();
    ok(c.buildSystemPrompt().indexOf('CONTENT-MARK') < 0, 'ข้อความถัดไปที่ไม่ใช่ /เล่ม ล้างการแนบ');
    inp.value = '/usr/bin/env ทำอะไร'; await c.handleUserSend();
    ok(seen[2] === '/usr/bin/env ทำอะไร', 'ขึ้นต้นด้วย / แต่ไม่ใช่ชื่อเล่ม → ปล่อยข้อความตามเดิม');
    inp.value = '/debug-mantra'; await c.handleUserSend();
    ok(seen[3] === '(ใช้สกิล debug-mantra)', 'พิมพ์แค่ /ชื่อเล่ม ก็ส่งได้');
    chr.mode = 'roleplay'; inp.value = '/debug-mantra คุยเล่น'; await c.handleUserSend();
    ok(seen[4] === '/debug-mantra คุยเล่น' && c.buildSystemPrompt().indexOf('CONTENT-MARK') < 0, 'โหมดโรลเพลย์ไม่ตีความ /เล่ม');
    const hs = await c.dispatchTool({ name: 'lib_health', args: {} }).catch(e => ({ ok: false, error: String(e) }));
    ok(hs && hs.ok === true && /หอสมุดสกิล/.test(hs.result), 'lib_health ลงทะเบียนในสายเครื่องมือและตอบเป็นข้อความ');
  }

  // ---- แคชพรีฟิกซ์: ส่วนนิ่งบน ส่วนเปลี่ยนทุกรอบท้าย ----
  console.log('== prompt cache');
  {
    const mk = v => 'HEAD static\n## TIER\nT0 act direct.\n\n## X\nstatic X\n\nFACTS:\n' + v.f + '\nEVENTS:\n(none)\nSUMMARIES:\n(none)\nRAG RECALL:\n(none)\nFILES:\nindex.html (' + v.n + ' chars)\n[CURRENT: ' + v.n + ' / TARGET: 0]\nGH rules static\nREPO: ' + v.r + '\nSTAGED: ' + v.s + '\n\n## SKILL.md (ตัวเองเขียน — แนบติดตัว)\n' + v.sk + '\n\n## JOURNAL (สมุดจดงานค้าง — อัปเดต 0 นาทีก่อน)\nงาน: ' + v.j + '\nเสร็จแล้ว: -\nค้าง: -\nโน้ต: -\n\n## TOOLS เพิ่มเติม (static)\nskill index static\nFILES ตอนนี้ (' + v.n + '): ' + v.fl + ' — ห้ามสร้าง\n## แผนที่โค้ด (x)\n- a.js (1 บรรทัด): ' + v.m + '\nทางลัด: edit_batch · undo\n\nstatic tail line';
    const A = { f: 'k=v', n: 10, r: 'ยังไม่โหลด', s: '(none)', sk: '# Skill.md\nrev: 1.0.0\n\n## กฎ\n- a', j: 'งาน A', fl: 'index.html', m: '-' };
    const B = { f: 'k=v2 | x=y', n: 99999, r: '3 โฟลเดอร์', s: 'a.js', sk: A.sk, j: 'งาน B', fl: 'index.html, a.js', m: 'fn1' };
    let PROMPT = '', cfg = { provider: 'gemini', model: 'm1' };
    const toasts = [];
    const pc = load('js/prompt-cache.js', { dispatchTool: async () => ({ ok: true, result: 'passthrough' }), buildSystemPrompt: () => PROMPT, getCfg: () => cfg, toast: m => toasts.push(m), document: { addEventListener() { } } });
    const P = pc.ninoPC;
    const ra = P.arrange(mk(A)), rb = P.arrange(mk(B));
    ok(ra.head === rb.head, 'ค่าที่เปลี่ยนทุกรอบเปลี่ยนไป แต่ส่วนนิ่ง (head) เหมือนเดิมทุกตัวอักษร');
    ok(['facts', 'repo', 'staged', 'journal', 'files', 'codemap', 'skillmd'].every(k => ra.moved[k] === 1), 'จับบล็อกครบ 7 แบบ: ' + Object.keys(ra.moved));
    ok(ra.text.indexOf('static tail line') < ra.text.indexOf(P.tailHead) && ra.text.indexOf('REPO:') > ra.text.indexOf(P.tailHead), 'ข้อความนิ่งอยู่ก่อนหัว CURRENT STATE และ REPO อยู่หลัง');
    ok(ra.text.indexOf('## SKILL.md') < ra.text.indexOf(P.tailHead) && ra.text.indexOf('## SKILL.md') > ra.text.indexOf('static tail line'), 'Skill.md อยู่ชั้นกึ่งนิ่ง (หลังส่วนนิ่ง ก่อนส่วนเปลี่ยนทุกรอบ)');
    ok(P.arrange(ra.text).text === ra.text, 'จัดซ้ำซ้อนสองรอบได้ผลเดิม (ไม่ซ้ำหัว)');
    ok(P.arrange('ไม่มีบล็อกที่รู้จักเลย').text === 'ไม่มีบล็อกที่รู้จักเลย', 'พรอมต์ที่ไม่มีบล็อกให้จับ → คืนตามเดิม ไม่พัง');
    P._reset();
    PROMPT = mk(A); pc.buildSystemPrompt(); PROMPT = mk(B); pc.buildSystemPrompt();
    ok(P.stats().bust === 0 && P.stats().calls === 2, 'เปลี่ยนเฉพาะส่วนเปลี่ยนทุกรอบ → ไม่นับว่าล้างแคช');
    PROMPT = mk(B).replace('static X', 'static Y'); cfg = { provider: 'gemini', model: 'm2' }; pc.buildSystemPrompt();
    const st = P.stats();
    ok(st.bust === 1 && /สลับโมเดล gemini\/m1 → gemini\/m2/.test(st.lastBust.why) && /เปลี่ยนที่ "## X"/.test(st.lastBust.why), 'ส่วนนิ่งเปลี่ยน → นับ 1 ครั้ง พร้อมเหตุผล (สลับโมเดล + หัวข้อที่เปลี่ยน)');
    ok(toasts.some(m => /แคชพรีฟิกซ์ถูกล้าง/.test(m)), 'เตือนผู้ใช้ด้วย toast เมื่อส่วนนิ่งถูกล้าง');
    P._reset();
    PROMPT = mk(A);
    pc.buildSystemPrompt(); P.usage({ promptTokenCount: 100, cachedContentTokenCount: 10, candidatesTokenCount: 5 }); P.usage({ promptTokenCount: 1000, cachedContentTokenCount: 800, candidatesTokenCount: 50 });
    pc.buildSystemPrompt(); P.usage({ prompt_tokens: 500, prompt_tokens_details: { cached_tokens: 400 }, completion_tokens: 10 });
    pc.buildSystemPrompt(); P.usage({ prompt_tokens: 300, prompt_cache_hit_tokens: 250, completion_tokens: 7 });
    pc.buildSystemPrompt(); P.usage({ prompt_tokens: 40, completion_tokens: 1 });
    const us = P.stats().usage;
    ok(us.n === 4 && us.prompt === 1840 && us.cached === 1450 && us.out === 68 && us.silent === 1, 'รวมโทเคนของผู้ให้บริการ 3 รูปแบบ (Gemini/OpenAI/DeepSeek) นับแค่ค่าสุดท้ายของสตรีมต่อครั้ง: ' + JSON.stringify(us));
    ok(/ผู้ให้บริการรายงาน 4 ครั้ง/.test(P.report()) && /79%/.test(P.report()), 'cache_report สรุปเปอร์เซ็นต์แคชจากที่ผู้ให้บริการรายงาน');
    { const cr = await pc.dispatchTool({ name: 'cache_report' }); ok(cr.ok === true && cr.result !== 'passthrough', 'cache_report ลงทะเบียนในสายเครื่องมือ'); }
    P._reset();
    ok(/ไม่มีการเรียกโมเดล/.test(P.report()), 'ยังไม่มีการเรียก → บอกตรงๆ ไม่แต่งตัวเลข');
  }

  // ---- ด่านอนุมัติ: ไฟล์ป้องกันมีที่เดียว ----
  console.log('== protected files');
  const gh = load('github-agent.js').ninoGH;
  for (const f of ['tools/check.js', 'tools/test/web.test.js', 'js/delegate.js', 'skill-lib.js', 'github-agent.js', '.github/workflows/android.yml']) ok(gh.isProtected(f) === true, 'ป้องกัน: ' + f);
  for (const f of ['js/ui-render.js', 'Skill.md', 'tools/file-roles.json', 'skills/code/debug/debug-mantra/Skill.md']) ok(gh.isProtected(f) === false, 'ไม่ป้องกัน: ' + f);
  ok(gh.isProtected('./tools/check.js') === true, 'ตัด ./ นำหน้าก่อนเทียบ');

  // ---- NOW.md: สร้างจากโค้ด ไม่เก่า ----
  console.log('== NOW.md');
  const mn = require(path.join(ROOT, 'tools', 'make-now.js'));
  eq(mn.roleFor({ 'a.js': 'x', 'tools/': 'T', 'tools/ci/': 'CI' }, 'tools/ci/s.sh'), 'CI', 'บทบาทของแฟ้มย่อยที่ลึกกว่าชนะ');
  eq(mn.roleFor({ 'a.js': 'x' }, 'b.js'), null, 'ไฟล์ไม่มีบทบาท = null');
  const nowTxt = mn.build(ROOT);
  ok(nowTxt === mn.build(ROOT), 'สร้างซ้ำได้ผลเดิมทุกไบต์');
  ok(!/ยังไม่มีบทบาท/.test(nowTxt), 'ทุกไฟล์มีบทบาท');
  ok(/gh_commit/.test(nowTxt) && /delegate/.test(nowTxt) && /skill_pull|skill_sync/.test(nowTxt), 'รายการเครื่องมืออ่านจากโค้ดจริง');
  ok(/debug-mantra/.test(nowTxt) && /management-talk/.test(nowTxt), 'สารบัญสกิลอยู่ใน NOW.md');
  ok(fs.readFileSync(path.join(ROOT, 'NOW.md'), 'utf8') === nowTxt, 'NOW.md ในรีโปตรงกับโค้ด (ถ้าไม่ตรงรัน node tools/make-now.js)');

  // ---- ด่านตรวจต้องล้มจริงเมื่อมีคนถอดกลไกความปลอดภัย (mutation) ----
  console.log('== gate mutations');
  {
    const cp = require('child_process'), os = require('os');
    function trial(mut, extra) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nino-gate-'));
      for (const e of fs.readdirSync(ROOT)) { if (/^(\.git|node_modules)$/.test(e)) continue; fs.cpSync(path.join(ROOT, e), path.join(dir, e), { recursive: true }); }
      const edit = (f, fn) => { const p = path.join(dir, f); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
      if (mut) mut(edit, dir);
      const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'check.js'), '--root', dir].concat(extra || ['--strict']), { encoding: 'utf8' });
      fs.rmSync(dir, { recursive: true, force: true });
      return { code: r.status, out: r.stdout };
    }
    const base = trial(null);
    ok(base.code === 0, 'ต้นฉบับผ่านด่านแบบ --strict' + (base.code ? '\n' + base.out.slice(-600) : ''));
    let r = trial(edit => edit('github-agent.js', s => s.replace('tools\\/check\\.js|', '')));
    ok(r.code === 1 && /หลุดจาก PROT/.test(r.out), 'ถอด tools/check.js ออกจากไฟล์ป้องกัน → ด่านล้ม');
    r = trial(edit => edit('github-agent.js', s => s.replace("askUser('NINO ขอ commit", "noop('NINO ขอ commit")));
    ok(r.code === 1 && /ด่านอนุมัติ/.test(r.out), 'ถอดกล่องถามผู้ใช้ตอน commit → ด่านล้ม');
    r = trial((edit, dir) => fs.writeFileSync(path.join(dir, 'js', 'zzz-new.js'), 'var zzz=1;'));
    ok(r.code === 1 && /ไม่มีบทบาท/.test(r.out), 'เพิ่มไฟล์ใหม่โดยไม่ลงบทบาท → ด่านล้ม');
    r = trial(edit => edit('Skill.md', s => s + '\nส่ง approved:true ได้'));
    ok(r.code === 1 && /approved:true/.test(r.out), 'Skill.md กลับไปใช้คำอนุมัติเก่า → ด่านล้ม');
    r = trial(edit => edit('Skill.md', s => s + '\n' + 'ก'.repeat(3000)));
    ok(r.code === 1 && /ถูกตัด/.test(r.out), 'Skill.md ยาวเกินที่แนบพรอมต์ได้ → ด่านล้ม');
    r = trial(edit => edit('Skill.md', s => s.replace(/^rev:.*$/m, 'x')));
    ok(r.code === 1 && /rev/.test(r.out), 'Skill.md ไม่มีเลข rev → ด่านล้ม');
    r = trial(edit => edit('self-upgrade.js', s => s.replace("repo: 'NINO'", "repo: 'other'")));
    ok(r.code === 1 && /repo เริ่มต้นไม่ตรง/.test(r.out), 'repo เริ่มต้นสองไฟล์ไม่ตรงกัน → ด่านล้ม');
    r = trial(edit => edit('skills/code/debug/debug-loop/Skill.md', s => s + '\nsh run skills/self-upgrade/scripts/check_syntax.js'));
    ok(r.code === 1 && /อ้างไฟล์ที่ไม่มีจริง/.test(r.out), 'สกิลอ้าง path ที่ไม่มี → ด่านล้ม');
    r = trial(edit => edit('NOW.md', s => s + 'แก้มือ\n'));
    ok(r.code === 1 && /NOW\.md ไม่ตรงกับโค้ด/.test(r.out), 'แก้ NOW.md ด้วยมือ → ด่านแบบ --strict ล้ม');
    r = trial(edit => edit('NOW.md', s => s + 'แก้มือ\n'), []);
    ok(r.code === 0 && /เก่ากว่าโค้ด/.test(r.out), 'แบบปกติ (CI) NOW.md เก่าแค่เตือน ไม่ทำให้ pipeline ล้ม');
    r = trial((edit, dir) => fs.rmSync(path.join(dir, 'skills', 'code', 'debug', 'debug-mantra', 'notebook.md')));
    ok(r.code === 1 && /notebook\.md/.test(r.out), 'เล่มสกิลไม่มีสมุดจดคู่ → ด่านล้ม');
  }

  console.log('\npassed ' + pass + ', failed ' + fail);
  process.exit(fail ? 1 : 0);
})();
