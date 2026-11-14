#!/usr/bin/env node
/* Fast static gate (runs in CI before anything is built, ~1s). Run: node tools/check.js [--root DIR] [--strict]
   - every .js parses
   - index.html: scripts exist, no duplicates, obs.js first, new modules after native-bridge
   - JS <-> Kotlin contract: every native op (and every parameter name) used by the web layer is handled by NativeBridge.kt
   - bridge API: version.js NINO_BRIDGE_API <= NativeBridge.BRIDGE_API
   - Kotlin files have balanced (), [], {} (strings, templates, comments understood) - we cannot compile Kotlin on every machine
   - JSON files parse; workflow copies in android/ci and .github/workflows are identical
   - one source of truth: every file has a role (tools/file-roles.json); NOW.md and the manifests match the code (warning, or failure with --strict)
   - skill library structure (book = Skill.md + notebook.md, referenced paths exist, index fits the prompt)
   - human-in-the-loop gates: protected files, commit approval, one approval word, default repo, Skill.md size/rev */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ri = process.argv.indexOf('--root');
const ROOT = path.resolve(ri > 0 ? process.argv[ri + 1] : path.join(__dirname, '..'));
let bad = 0, checks = 0;
function fail(m) { bad++; console.log('  ✗ ' + m); }
function ok() { checks++; }
function rd(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/^(\.git|node_modules|build|\.gradle)$/.test(e.name)) walk(rel, out); } else out.push(rel);
  }
  return out;
}
const files = walk('.');
const section = s => console.log('== ' + s);

section('JavaScript syntax');
for (const f of files.filter(f => f.endsWith('.js') && !f.startsWith('android'))) {
  try { const src = rd(f); new vm.Script(/(^|\/)scripts\//.test(f) ? '(function(){' + src + '\n})' : src, { filename: f }); ok(); } catch (e) { fail(f + ': ' + e.message); }
}

section('index.html scripts');
if (files.includes('index.html')) {
  const html = rd('index.html');
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"([^>]*)>/g)].map(m => ({ src: m[1], defer: /defer/.test(m[0]) }));
  const seen = new Set();
  for (const s of srcs) {
    if (/^https?:/.test(s.src)) continue;
    const p = s.src.replace(/^\.\//, '').split('?')[0];
    if (!files.includes(p)) fail('index.html references missing file ' + p); else ok();
    if (seen.has(p)) fail('index.html loads ' + p + ' twice'); seen.add(p);
  }
  const local = srcs.filter(s => !/^https?:/.test(s.src)).map(s => s.src.replace(/^\.\//, ''));
  const idx = n => local.indexOf(n);
  if (idx('js/obs.js') < 0) fail('js/obs.js is not loaded'); else if (idx('js/obs.js') > idx('version.js') + 1 || srcs.find(s => s.src.endsWith('js/obs.js')).defer) fail('js/obs.js must load early and not deferred (it captures boot errors)'); else ok();
  const nb = idx('js/native-bridge.js');
  for (const m of ['js/ota.js', 'js/term.js', 'js/godview.js', 'js/nino-sys.js', 'js/console-ui.js']) {
    if (idx(m) < 0) fail(m + ' is not loaded'); else if (idx(m) < nb) fail(m + ' must load after js/native-bridge.js'); else ok();
  }
  if (idx('js/console-ui.js') < idx('js/nino-sys.js')) fail('console-ui.js must load after nino-sys.js'); else ok();
}

section('JS <-> Kotlin native bridge contract');
const KT = 'android/app/src/main/java/app/nino/NativeBridge.kt';
if (files.includes(KT)) {
  const kt = rd(KT);
  const kops = new Set([...kt.matchAll(/^\s*"([a-z]+(?:\.[a-z]+)?)"\s*->/gm)].map(m => m[1]));
  const kkeys = new Set([...kt.matchAll(/\bm\.(?:opt\w+|get\w+)\("([A-Za-z]+)"/g)].map(m => m[1]));
  const used = [];
  for (const f of files.filter(f => /^js\/.*\.js$/.test(f) || f === 'version.js')) {
    const src = rd(f);
    for (const m of src.matchAll(/\.call\(\s*'([a-z]+(?:\.[a-z]+)?)'\s*(?:,\s*(?:params\(\s*)?(\{[^}]*\}))?/g)) used.push({ f, op: m[1], obj: m[2] || '' });
  }
  for (const u of used) {
    if (!kops.has(u.op)) fail(u.f + ' calls native op "' + u.op + '" but NativeBridge.kt has no handler'); else ok();
    for (const k of [...u.obj.matchAll(/([A-Za-z_]\w*)\s*:/g)].map(x => x[1])) {
      if (k === 'id' || k === 'op') fail(u.f + ': param "' + k + '" for "' + u.op + '" collides with the protocol fields');
      else if (!kkeys.has(k)) fail(u.f + ': op "' + u.op + '" sends param "' + k + '" that NativeBridge.kt never reads'); else ok();
    }
  }
  const unused = [...kops].filter(o => !used.some(u => u.op === o) && !/^(vault\.|http|cancel|app\.restart)/.test(o));
  if (unused.length) console.log('  (info) native ops not used by the web layer: ' + unused.join(', '));
  const bn = /const val BRIDGE_API = (\d+)/.exec(kt), vj = /NINO_BRIDGE_API\s*=\s*(\d+)/.exec(rd('version.js'));
  if (!bn || !vj) fail('cannot read BRIDGE_API (NativeBridge.kt) or NINO_BRIDGE_API (version.js)');
  else if (Number(vj[1]) > Number(bn[1])) fail('web layer needs bridge API ' + vj[1] + ' but Kotlin provides ' + bn[1] + ' - bump BRIDGE_API in the same commit');
  else ok();
  const nbj = rd('js/native-bridge.js');
  const jb = /bridge:(\d+)/.exec(nbj);
  if (!jb || bn && jb[1] !== bn[1]) fail('js/native-bridge.js advertises bridge ' + (jb && jb[1]) + ' but Kotlin BRIDGE_API is ' + (bn && bn[1])); else ok();
} else console.log('  (skipped: no android sources in this tree)');

section('Kotlin structure');
function balance(src, name) {
  const br = [], modes = [{ t: 'code', tpl: false, start: 0 }], PAIR = { '(': ')', '[': ']', '{': '}' };
  let i = 0, line = 1;
  const err = m => { fail(name + ':' + line + ' ' + m); return false; };
  while (i < src.length) {
    const c = src[i], top = modes[modes.length - 1];
    if (c === '\n') line++;
    if (top.t === 'str' || top.t === 'raw') {
      if (top.t === 'str' && c === '\\') { i += 2; continue; }
      if (top.t === 'str' && c === '"') { modes.pop(); i++; continue; }
      if (top.t === 'raw' && src.startsWith('"""', i)) { modes.pop(); i += 3; continue; }
      if (c === '$' && src[i + 1] === '{') { modes.push({ t: 'code', tpl: true, start: br.length }); i += 2; continue; }
      i++; continue;
    }
    if (src.startsWith('//', i)) { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (src.startsWith('/*', i)) { let d = 1; i += 2; while (i < src.length && d) { if (src.startsWith('/*', i)) { d++; i += 2; } else if (src.startsWith('*/', i)) { d--; i += 2; } else { if (src[i] === '\n') line++; i++; } } continue; }
    if (src.startsWith('"""', i)) { modes.push({ t: 'raw' }); i += 3; continue; }
    if (c === '"') { modes.push({ t: 'str' }); i++; continue; }
    if (c === "'") { const m = /^'(?:\\.|[^'\\])'/.exec(src.slice(i, i + 8)); if (m) { i += m[0].length; continue; } }
    if (PAIR[c]) { br.push({ c: PAIR[c], line }); i++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (c === '}' && top.tpl && br.length === top.start) { modes.pop(); i++; continue; }
      const e = br.pop();
      if (!e) return err('unexpected ' + c);
      if (e.c !== c) return err('expected ' + e.c + ' (opened at line ' + e.line + ') but found ' + c);
    }
    i++;
  }
  if (br.length) return err('unclosed ' + br[br.length - 1].c + ' opened at line ' + br[br.length - 1].line);
  if (modes.length !== 1) return err('unterminated string');
  return true;
}
for (const f of files.filter(f => f.endsWith('.kt') || f.endsWith('.kts'))) { if (balance(rd(f), f)) ok(); }
for (const f of files.filter(f => /^android\/app\/src\/main\/java\/app\/nino\/.*\.kt$/.test(f))) {
  const src = rd(f), pkg = /^package ([\w.]+)/m.exec(src);
  if (!pkg || pkg[1] !== 'app.nino') fail(f + ': wrong package'); else ok();
  for (const m of src.matchAll(/^import app\.nino\.core\.(\w+)/gm)) {
    if (!files.includes('android/app/src/main/java/app/nino/core/' + m[1] + '.java')) fail(f + ' imports missing core class ' + m[1]); else ok();
  }
}
for (const f of files.filter(f => /\/core\/.*\.java$/.test(f))) {
  const src = rd(f);
  if (!/^package app\.nino\.core;/m.test(src)) fail(f + ': wrong package'); else ok();
  if (/import android\./.test(src)) fail(f + ': core must not import android.*'); else ok();
}

section('data files + workflows');
for (const f of files.filter(f => f.endsWith('.json') && !f.startsWith('android/') && !/node_modules/.test(f))) {
  try { JSON.parse(rd(f)); ok(); } catch (e) { fail(f + ': ' + e.message); }
}
if (files.includes('version.js')) {
  const v = /NINO_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/.exec(rd('version.js'));
  if (!v) fail('version.js: NINO_VERSION is not x.y.z'); else ok();
}
for (const f of files.filter(f => /^android\/ci\/.*\.yml$/.test(f))) {
  const twin = '.github/workflows/' + path.basename(f);
  if (!files.includes(twin)) { fail(twin + ' is missing (copy of ' + f + ')'); continue; }
  if (rd(f) !== rd(twin)) fail(f + ' and ' + twin + ' differ - keep them identical'); else ok();
}

const STRICT = process.argv.includes('--strict');
function warn(m) { console.log('  ! ' + m); }
let MN = null;
try { MN = require('./make-now.js'); } catch (e) { MN = null; }
function exists(f) { return files.includes(f); }
function head(a, n) { return a.slice(0, n).join(', ') + (a.length > n ? ' …(+' + (a.length - n) + ')' : ''); }

section('one source of truth (file roles, NOW.md, manifests)');
if (MN && exists('tools/file-roles.json')) {
  const roles = JSON.parse(rd('tools/file-roles.json'));
  const noRole = files.filter(f => MN.roleFor(roles, f) === null);
  if (noRole.length) fail('ไฟล์ไม่มีบทบาทใน tools/file-roles.json (เพิ่มบรรทัดละ 1 ไฟล์): ' + head(noRole, 8)); else ok();
  const stale = Object.keys(roles).filter(k => (k.endsWith('/') ? !files.some(f => f.startsWith(k)) : !exists(k)));
  if (stale.length) warn('file-roles.json ชี้ไฟล์ที่ไม่มีแล้ว (ลบบรรทัดได้): ' + head(stale, 8)); else ok();
  const now = MN.build(ROOT), cur = exists('NOW.md') ? rd('NOW.md') : null;
  if (/ยังไม่มีบทบาท/.test(now)) fail('NOW.md จะมีแถว "ยังไม่มีบทบาท" — เติม tools/file-roles.json');
  const T = MN.tools(ROOT);
  if (T.gh.length < 15 || T.lib.length < 5 || T.fast.length < 5 || T.delegate.length !== 1 || T.diag.length !== 2) fail('ตัวสร้าง NOW.md อ่านรายการเครื่องมือจากโค้ดไม่ได้ (' + [T.gh.length, T.lib.length, T.fast.length, T.delegate.length, T.diag.length].join('/') + ') — โครงโค้ดเปลี่ยนไป แก้ tools/make-now.js'); else ok();
  if (cur === now) ok();
  else if (STRICT) fail('NOW.md ไม่ตรงกับโค้ด — รัน: node tools/make-now.js');
  else warn('NOW.md เก่ากว่าโค้ด (CI ไม่ล้ม) — รัน: node tools/make-now.js แล้วส่งใหม่');
  const exts = /\.(js|css|html|json|md)$/, skip = /^(skills|icons|ai|tools|android|\.github)/;
  const home = files.filter(f => exts.test(f) && !skip.test(f) && !['home.json', 'data-trash.json', 'make-manifests.py', 'offline-files.json'].includes(path.basename(f))).sort();
  const sk = files.filter(f => f.startsWith('skills/') && path.basename(f) !== 'manifest.json').sort();
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const drift = [];
  if (exists('home.json') && !eq(JSON.parse(rd('home.json')), home)) drift.push('home.json');
  if (exists('skills/manifest.json') && !eq(JSON.parse(rd('skills/manifest.json')), sk)) drift.push('skills/manifest.json');
  if (exists('games/outlaw/offline-files.json')) {
    const gl = files.filter(f => f.startsWith('games/outlaw/') && path.basename(f) !== 'offline-files.json').sort();
    if (!eq(JSON.parse(rd('games/outlaw/offline-files.json')), gl)) drift.push('games/outlaw/offline-files.json');
  } else drift.push('games/outlaw/offline-files.json');
  if (exists('ai/manifest.json')) {
    const am = JSON.parse(rd('ai/manifest.json')), crypto = require('crypto');
    const badAi = (am.files || []).filter(e => { try { const b = fs.readFileSync(path.join(ROOT, e.path)); return e.sha !== crypto.createHash('sha256').update(b).digest('hex').slice(0, 16) || e.bytes !== b.length; } catch (x) { return true; } });
    if (badAi.length || !eq((am.files || []).map(e => e.path), home)) drift.push('ai/manifest.json');
  }
  if (drift.length) { if (STRICT) fail('แมนิเฟสต์ไม่ตรงกับไฟล์จริง: ' + drift.join(', ') + ' — รัน: python3 tools/make-manifests.py'); else warn('แมนิเฟสต์เก่ากว่าไฟล์ (CI ไม่ล้ม): ' + drift.join(', ') + ' — รัน: python3 tools/make-manifests.py'); } else ok();
}

section('skill library structure');
{
  const books = files.filter(f => /^skills\/[^/]+\/[^/]+\/[^/]+\/Skill\.md$/.test(f));
  for (const b of books) {
    const d = path.posix.dirname(b), name = path.posix.basename(d), parts = d.split('/'), l = rd(b).split('\n');
    if (!exists(d + '/notebook.md')) fail(d + ': ไม่มี notebook.md คู่เล่ม');
    else if (l[0].trim() !== '# ' + name) fail(b + ': บรรทัดที่ 1 ต้องเป็น "# ' + name + '"');
    else if (!(l[1] || '').trim()) fail(b + ': บรรทัดที่ 2 (คำอธิบายสารบัญ) ว่าง');
    else ok();
    for (const t of ['skills/' + parts[1] + '/_title.md', 'skills/' + parts[1] + '/' + parts[2] + '/_title.md']) {
      if (!exists(t)) fail(t + ' ไม่มี (ชื่อไทยของหมวด/ชั้น)'); else ok();
    }
    const refs = [...rd(b).matchAll(/skills\/[a-z0-9_\-\/]+\.(?:js|md|json)/g)].map(m => m[0]);
    for (const r of refs) { if (!exists(r)) fail(b + ' อ้างไฟล์ที่ไม่มีจริง: ' + r); else ok(); }
  }
  const OW = 'skills/_overwrite.json';
  if (exists(OW)) { for (const f of JSON.parse(rd(OW)).files) { if (!exists(f)) fail(OW + ' ชี้ไฟล์ที่ไม่มี: ' + f); else ok(); } }
  if (MN && exists('skill-lib.js') && books.length) {
    const cap = /index\(\)\.slice\(0,(\d+)\)/.exec(rd('skill-lib.js'));
    const len = MN.library(ROOT).join('\n').length;
    if (!cap) fail('skill-lib.js: หา index().slice(0,N) ไม่เจอ'); else if (len > +cap[1]) fail('สารบัญสกิลยาว ' + len + ' > ' + cap[1] + ' ตัวอักษร — AI จะไม่เห็นเล่มท้ายๆ (ย่อคำอธิบายหรือเพิ่มเพดานใน skill-lib.js)'); else ok();
  }
}

section('skill pointers (context-architecture audit: size, weak pointers, decision gates)');
if (exists('js/lib-health.js') && files.some(f => f.startsWith('skills/'))) {
  const vmx = require('vm'), cx = {};
  cx.window = cx;
  vmx.createContext(cx);
  vmx.runInContext(rd('js/lib-health.js'), cx, { filename: 'js/lib-health.js' });
  const keys = files.filter(f => f.startsWith('skills/'));
  const res = cx.ninoLibHealth.audit({ keys: () => keys, read: k => (exists(k) ? rd(k) : null) }, { root: exists('Skill.md') ? rd('Skill.md') : null });
  for (const i of res.issues) {
    if (i.level === 'red') fail(i.where + ' — ' + i.msg + (i.fix ? ' → ' + i.fix : ''));
    else warn(i.where + ' — ' + i.msg + (i.fix ? ' → ' + i.fix : ''));
  }
  if (!res.red) ok();
  console.log('  (หอสมุด ' + res.books + ' เล่ม: สีแดง ' + res.red + ' · สีเหลือง ' + res.yellow + ' · สีเขียว ' + res.green + ' — ดูเองด้วย `nino lib`)');
}

section('human-in-the-loop gates (charter)');
if (exists('github-agent.js')) {
  const ga = rd('github-agent.js'), prot = MN && MN.protectedRegex(ROOT);
  if (!prot) fail('github-agent.js: หา PROT ไม่เจอ');
  else {
    const must = ['github-agent.js', 'self-upgrade.js', 'nino-agent.js', 'revive.js', 'service-worker.js', 'lock.js', 'skill-lib.js', '.github/workflows/android.yml', 'android/app/build.gradle.kts', 'tools/ci/prepare-web.sh', 'tools/check.js', 'tools/make-now.js', 'tools/test/web.test.js', 'js/ota.js', 'js/obs.js', 'js/term.js', 'js/loop-guard.js', 'js/delegate.js', 'js/lib-health.js', 'js/prompt-cache.js', 'js/native-bridge.js'];
    const lost = must.filter(f => !prot.test(f));
    if (lost.length) fail('ไฟล์ที่ต้องป้องกันหลุดจาก PROT ใน github-agent.js: ' + lost.join(', ')); else ok();
  }
  if (!/ps\.filter\(function\(p\)\{return PROT\.test\(p\);\}\)/.test(ga) || !/askUser\('NINO ขอ commit/.test(ga)) fail('github-agent.js: ด่านอนุมัติตอน gh_commit (PROT + askUser) หายไป'); else ok();
  if (!/isProtected:function/.test(ga)) fail('github-agent.js: ไม่ส่งออก ninoGH.isProtected'); else ok();
  const gm = /var KEY='nino-gh-config'/.test(ga);
  if (!gm) fail('github-agent.js: คีย์ config เปลี่ยน — ตรวจ self-upgrade.js/js/ota.js/js/nino-sys.js ที่อ่านคีย์เดียวกัน'); else ok();
  const rg = /repo:String\(c\.repo\|\|'([^']+)'\)/.exec(ga), rs = exists('self-upgrade.js') && /repo: '([^']+)'/.exec(rd('self-upgrade.js'));
  if (rg && rs && rg[1] !== rs[1]) fail('repo เริ่มต้นไม่ตรงกัน: github-agent.js=' + rg[1] + ' self-upgrade.js=' + rs[1]); else ok();
}
if (exists('js/modes-session.js') && !/window\.ninoGH\.isProtected/.test(rd('js/modes-session.js'))) fail('js/modes-session.js: ด่านโรลเพลย์ต้องใช้ ninoGH.isProtected (ห้ามลิสต์ซ้ำเอง)'); else ok();
if (exists('Skill.md')) {
  const sk = rd('Skill.md');
  if (sk.length > 6000) fail('Skill.md ยาว ' + sk.length + ' > 6000 ตัวอักษร — ถูกตัดตอนแนบพรอมต์ (nino-agent.js sbrief)'); else ok();
  if (!/^rev:\s*\d+\.\d+\.\d+/m.test(sk.slice(0, 400))) fail('Skill.md: ต้องมีบรรทัด "rev: x.y.z" ใน 400 ตัวอักษรแรก (ใช้ให้แอปรู้ว่ามีฉบับใหม่)'); else ok();
  if (/approved:true/.test(sk)) fail('Skill.md ยังเรียกคำอนุมัติ approved:true — ระบบใช้ confirm:true'); else ok();
  if (!/NOW\.md/.test(sk)) fail('Skill.md ต้องชี้ไป NOW.md'); else ok();
}
if (exists('version.js')) {
  const v = rd('version.js');
  if (!/NINO_GEN=\d+/.test(v)) fail('version.js: ไม่มี NINO_GEN'); else ok();
  if (exists('service-worker.js') && !/NINO_GEN/.test(rd('service-worker.js'))) fail('service-worker.js: ชื่อแคชต้องมี NINO_GEN'); else ok();
}

console.log('\n' + (bad ? '✗ ' + bad + ' problem(s)' : '✓ all clear') + ' (' + checks + ' checks)');
process.exit(bad ? 1 : 0);
