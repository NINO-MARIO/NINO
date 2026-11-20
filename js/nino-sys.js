/* NINO system: the Build button pipeline, version stepping and the AI tools for the real app.
   Build = wait until NINO finishes -> screenshot BEFORE -> commit staged files -> wait for CI bundle ->
           download + verify -> reboot the whole app -> screenshot AFTER -> compare -> keep or go back. */
(function () {
  'use strict';
  var LS = localStorage, JOB = 'nino.build.job', AUTO = 'nino.sys.auto', REQ = 'nino.sys.request';
  var CI_POLL = Number(window.NINO_CI_POLL) || 10000, CI_MAX = 15 * 60 * 1000, APK_MAX = 25 * 60 * 1000, AFTER_MS = Number(window.NINO_AFTER_MS) || 6000;
  var st = { running: false, armed: false, cancel: false, steps: [], error: '', startedAt: 0, result: null };
  var listeners = [];

  function O() { return window.ninoOta; }
  function G() { return window.ninoGodview; }
  function native() { return !!(O() && O().native); }
  function emit() { listeners.slice().forEach(function (f) { try { f(st); } catch (e) {} }); }
  function say(m, t) { if (typeof toast === 'function') toast(m, t || 'ok'); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function logE(l, m) { if (window.ninoObs) ninoObs.log(l, 'sys', m); }
  function busy() { try { return typeof session !== 'undefined' && !!session && !!session.taskMode; } catch (e) { return false; } }
  function readJob() { try { return JSON.parse(LS.getItem(JOB) || 'null'); } catch (e) { return null; } }
  function writeJob(j) { try { if (j) LS.setItem(JOB, JSON.stringify(j)); else LS.removeItem(JOB); } catch (e) {} }
  function ghc() { try { return JSON.parse(LS.getItem('nino-gh-config') || '{}') || {}; } catch (e) { return {}; } }

  /* ---------- step tracking (drives the progress list in the console) ---------- */
  var ORDER = [['wait', 'รอ NINO ทำงานเสร็จ'], ['before', 'จับภาพ "ก่อน"'], ['commit', 'Commit งานที่ค้าง'], ['ci', 'รอ GitHub Actions สร้างเวอร์ชันใหม่'],
    ['install', 'ดาวน์โหลด + ตรวจลายเซ็น'], ['apk', 'ติดตั้ง APK ใหม่ (ส่วนเนทีฟ)'], ['reboot', 'รีบูตทั้งแอป']];
  function resetSteps() { st.steps = ORDER.map(function (s) { return { id: s[0], label: s[1], status: 'todo', detail: '' }; }); }
  function mark(id, status, detail) {
    st.steps.forEach(function (s) { if (s.id === id) { s.status = status; if (detail !== undefined) s.detail = detail; } });
    emit();
  }
  function skip(id, why) { mark(id, 'skip', why || ''); }
  function checkCancel() { if (st.cancel) throw new Error('ยกเลิกแล้ว'); }

  /* ---------- GitHub helpers ---------- */
  async function ghFetch(path) {
    var c = ghc();
    if (!c.owner || !c.token) throw new Error('ยังไม่ได้ตั้งค่า GitHub (owner/token)');
    var r = await fetch('https://api.github.com/repos/' + c.owner + '/' + (c.repo || 'NINO') + path, { headers: { Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('GitHub ' + r.status + ' ' + path);
    return r.json();
  }
  async function headSha() {
    var c = ghc();
    return (await ghFetch('/git/ref/heads/' + encodeURIComponent(c.branch || 'main'))).object.sha;
  }
  /* returns {status, conclusion, url} of the newest "NINO Android APK" run for this commit, or null */
  async function ciRun(sha) {
    try {
      var j = await ghFetch('/actions/runs?head_sha=' + sha + '&per_page=10');
      var runs = (j.workflow_runs || []).filter(function (r) { return /NINO Android APK/i.test(r.name || ''); });
      return runs.length ? { status: runs[0].status, conclusion: runs[0].conclusion, url: runs[0].html_url } : null;
    } catch (e) { return null; }
  }

  async function commitStaged(opts) {
    var gh = window.ninoGH;
    var staged = gh && gh.configured && gh.configured() ? gh.stagedList() : [];
    if (!staged.length) return null;
    var info = null;
    function onC(e) { info = e.detail; }
    window.addEventListener('nino:committed', onC);
    try {
      var msg = (opts && opts.message) || ('update: ' + staged.slice(0, 4).join(', ') + (staged.length > 4 ? ' +' + (staged.length - 4) : ''));
      var r = await gh.run('gh_commit', { message: msg, confirm: true });
      if (!r.ok) throw new Error('commit ไม่สำเร็จ: ' + String(r.error || '').slice(0, 160));
    } finally { window.removeEventListener('nino:committed', onC); }
    if (!info) throw new Error('commit สำเร็จแต่ไม่ได้รับ sha กลับมา');
    return info;
  }

  /* ---------- the Build pipeline ---------- */
  async function build(opts) {
    opts = opts || {};
    var log = opts.log || function () {};
    if (st.running) { log('Build กำลังทำงานอยู่แล้ว'); return null; }
    if (!native()) { log('Build ใช้ได้ในแอป NINO.apk เท่านั้น (เบราว์เซอร์: ใช้ commit แล้วรอ GitHub Pages)'); return null; }
    st.running = true; st.cancel = false; st.error = ''; st.result = null; st.startedAt = Date.now(); resetSteps(); emit();
    var job = { id: 'b' + Date.now().toString(36), t: Date.now(), stage: 'building', from: O().running().id, before: '', tag: '', sha: '', files: [], message: opts.message || '' };
    writeJob(job);
    try {
      /* 1. wait for NINO to finish its own work */
      mark('wait', 'doing', busy() ? 'NINO กำลังทำงานอยู่…' : '');
      st.armed = busy(); emit();
      var calm = 0;
      while (calm < 2) { checkCancel(); calm = busy() ? 0 : calm + 1; if (calm < 2) await sleep(1000); }
      st.armed = false; mark('wait', 'done', '');

      /* 2. BEFORE screenshot */
      if (G()) {
        mark('before', 'doing');
        try { var b = await G().snap('before build'); job.before = b.id; mark('before', 'done', b.dom.issues.length + ' ปัญหาที่ตรวจพบ'); }
        catch (e) { mark('before', 'skip', e.message); }
      } else skip('before');
      checkCancel();

      /* 3. commit */
      mark('commit', 'doing');
      var ci = await commitStaged(opts);
      var sha, files;
      if (ci) { sha = ci.sha; files = ci.files || []; mark('commit', 'done', 'commit ' + sha.slice(0, 7) + ' · ' + files.length + ' ไฟล์'); }
      else { sha = await headSha(); files = []; mark('commit', 'skip', 'ไม่มีไฟล์ค้าง — ใช้ commit ล่าสุด ' + sha.slice(0, 7)); }
      job.sha = sha; job.files = files; job.tag = 'web-' + sha.slice(0, 7); writeJob(job);
      var nativeFiles = files.some(function (p) { return /^android\//.test(p); });
      checkCancel();

      /* 4. wait for CI to publish the signed bundle */
      mark('ci', 'doing', 'รอ ' + job.tag);
      var info = null, t0 = Date.now(), lastRun = 0;
      while (!info) {
        checkCancel();
        info = await O().probe(job.tag);
        if (info) break;
        if (Date.now() - t0 > CI_MAX) throw new Error('รอ CI เกิน ' + Math.round(CI_MAX / 60000) + ' นาที — เปิด GitHub → Actions ดูสาเหตุ');
        if (Date.now() - lastRun > 25000) {
          lastRun = Date.now();
          var run = await ciRun(sha);
          if (run && run.conclusion && run.conclusion !== 'success' && run.conclusion !== 'skipped') throw new Error('GitHub Actions ล้มเหลว (' + run.conclusion + ') — ' + run.url);
          mark('ci', 'doing', (run ? 'CI: ' + run.status : 'รอคิว') + ' · ' + Math.round((Date.now() - t0) / 1000) + ' วินาที');
        }
        await sleep(CI_POLL);
      }
      mark('ci', 'done', 'พบ ' + info.id + ' (v' + (info.version || '?') + ', ' + (info.signed ? 'มีลายเซ็น' : 'ไม่มีลายเซ็น') + ')');
      checkCancel();

      /* 5. download + verify; if the bundle needs a newer native layer, go through the APK instead */
      var needApk = nativeFiles, installed = false;
      mark('install', 'doing');
      try {
        var last = '';
        await O().install(job.tag, { activate: !nativeFiles, onProgress: function (p) {
          var t = p.phase + (p.total ? ' ' + Math.round(p.done * 100 / p.total) + '%' : '');
          if (t !== last) { last = t; mark('install', 'doing', t); }
        } });
        installed = true;
        mark('install', 'done', nativeFiles ? 'ดาวน์โหลดแล้ว (จะเปิดใช้หลังติดตั้ง APK)' : 'ตรวจผ่านและเปิดใช้เวอร์ชันใหม่แล้ว');
      } catch (e) {
        if (e.code === 'incompatible') { needApk = true; mark('install', 'skip', 'ต้องอัปเดต APK ก่อน'); }
        else throw e;
      }

      /* 6. native layer (APK), only when Kotlin/Java changed or the bundle needs a newer bridge */
      if (needApk) {
        mark('apk', 'doing', 'รอ APK จาก CI');
        var ak = null, a0 = Date.now();
        while (true) {
          checkCancel();
          var c = await O().apkCheck();
          ak = c.apk;
          /* our own commit, or a newer APK that superseded it (newer builds contain our changes) */
          if (ak && (ak.commit === sha || (Date.parse(ak.builtAt) || 0) >= st.startedAt)) break;
          if (Date.now() - a0 > APK_MAX) throw new Error('รอ APK เกิน ' + Math.round(APK_MAX / 60000) + ' นาที');
          mark('apk', 'doing', 'ยังไม่เสร็จ · ' + Math.round((Date.now() - a0) / 1000) + ' วินาที');
          await sleep(CI_POLL * 2);
        }
        job.stage = 'apk-installing'; writeJob(job);
        if (!window.confirm('APK ใหม่พร้อมแล้ว (v' + ak.versionName + ')\nดาวน์โหลดและติดตั้งตอนนี้? Android จะขอให้คุณกดยืนยันอีกครั้ง')) throw new Error('ยกเลิกการติดตั้ง APK');
        var l2 = '';
        await O().apkInstall(function (p) { var t = p.phase + (p.total ? ' ' + Math.round(p.done * 100 / p.total) + '%' : ''); if (t !== l2) { l2 = t; mark('apk', 'doing', t); } }, false);
        mark('apk', 'done', 'ส่งให้ Android แล้ว — กดยืนยันในหน้าต่างติดตั้ง แอปจะรีสตาร์ตเอง');
        skip('reboot', 'ระบบจะรีสตาร์ตแอปหลังติดตั้ง APK');
        job.stage = 'apk-installing'; writeJob(job);
        st.running = false; emit();
        return { ok: true, apk: true };
      }
      skip('apk', 'ไม่มีการแก้ส่วนเนทีฟ');

      /* 7. reboot the whole app */
      mark('reboot', 'doing');
      job.stage = 'rebooted'; job.t = Date.now(); writeJob(job);
      logE('I', 'build ' + job.tag + ' installed, rebooting');
      st.running = false; emit();
      await O().reboot('build ' + job.tag);
      return { ok: true, tag: job.tag };
    } catch (e) {
      st.error = e.message || String(e); st.armed = false; st.running = false;
      st.steps.forEach(function (s) { if (s.status === 'doing') { s.status = 'fail'; s.detail = st.error; } });
      writeJob(null); emit();
      logE('E', 'build failed: ' + st.error);
      log('✗ Build ไม่สำเร็จ: ' + st.error);
      return { ok: false, error: st.error };
    }
  }
  function cancelBuild() { st.cancel = true; emit(); }

  /* after the reboot: screenshot AFTER, compare, report */
  async function afterReboot() {
    var job = readJob();
    if (!job || job.stage !== 'rebooted') return;
    if (Date.now() - job.t > 15 * 60 * 1000) { writeJob(null); return; }
    job.stage = 'verifying'; writeJob(job);
    var res = { ok: true, text: '', tag: job.tag, before: job.before, after: '' };
    try {
      await O().refresh(); await O().buildInfo();
      var run = O().running(), s = O().state();
      if (run.id !== job.tag) {
        res.ok = false;
        res.text = 'เวอร์ชันใหม่ ' + job.tag + ' เปิดไม่ผ่าน — ระบบถอยกลับไป ' + run.id + (s && s.lastRollback ? ' (' + s.lastRollback + ')' : '');
      } else if (G()) {
        var a = await G().snap('after build');
        res.after = a.id;
        if (job.before) {
          var cmp = await G().compare(job.before, a.id);
          res.text = cmp.text;
          res.ok = cmp.dom.newIssues.length === 0 && (!cmp.px || cmp.px.changedPct < 70);
        } else res.text = G().describe(a);
      }
    } catch (e) { res.ok = false; res.text = 'ตรวจหลังบูตไม่สำเร็จ: ' + e.message; }
    job.stage = 'done'; job.result = res; writeJob(job);
    st.result = res; emit();
    say(res.ok ? '✓ อัปเดตสำเร็จ — ' + job.tag : 'ตรวจหลังอัปเดตพบข้อสังเกต เปิดคอนโซลดูผล', res.ok ? 'ok' : 'err');
    logE(res.ok ? 'I' : 'W', 'post-build check ' + (res.ok ? 'ok' : 'flagged') + ': ' + res.text.split('\n').slice(0, 3).join(' | '));
    if (window.ninoConsole && !res.ok) window.ninoConsole.open('versions');
  }
  function lastResult() { var j = readJob(); return st.result || (j && j.stage === 'done' ? j.result : null); }
  function dismissResult() { st.result = null; writeJob(null); emit(); }

  /* ---------- version stepping ---------- */
  async function step(dir, out) {
    out = out || function () {};
    var s = await O().refresh(), t = dir < 0 ? s.back : s.next;
    if (!t) { out('ไม่มีเวอร์ชัน' + (dir < 0 ? 'ก่อนหน้า' : 'ถัดไป') + 'แล้ว'); return null; }
    if (busy() && !window.confirm('NINO กำลังทำงานอยู่ — รีบูตตอนนี้จะหยุดงานที่ค้าง ต้องการไปต่อไหม?')) return null;
    out((dir < 0 ? 'ย้อนกลับไป ' : 'ไปเวอร์ชัน ') + t + ' แล้วรีบูต…');
    await O().activate(t);
    await O().reboot((dir < 0 ? 'back to ' : 'forward to ') + t);
    return t;
  }
  async function use(id, out) {
    out = out || function () {};
    await O().activate(id);
    out('เปิดใช้ ' + id + ' แล้วรีบูต…');
    await O().reboot('use ' + id);
    return id;
  }
  async function updateLatest(out) {
    out = out || function () {};
    var c = await O().check();
    if (!c.available) { out('เป็นเวอร์ชันล่าสุดแล้ว (' + c.running.id + ')'); return null; }
    out('พบเวอร์ชันใหม่ ' + c.pointer.tag + ' (v' + (c.pointer.version || '?') + ') — ดาวน์โหลด…');
    var last = '';
    await O().install(c.pointer.tag, { activate: true, onProgress: function (p) { var t = p.phase + (p.total ? ' ' + Math.round(p.done * 100 / p.total) + '%' : ''); if (t !== last) { last = t; out('… ' + t); } } });
    out('ตรวจลายเซ็นผ่าน — รีบูต…');
    await O().reboot('update ' + c.pointer.tag);
    return c.pointer.tag;
  }

  /* ---------- AI tools ---------- */
  function ok(r) { return { ok: true, result: r, error: null }; }
  function bad(e) { return { ok: false, result: null, error: e }; }
  function autoOn() { return LS.getItem(AUTO) === '1'; }
  function setAuto(v) { LS.setItem(AUTO, v ? '1' : '0'); emit(); }

  async function statusText() {
    var L = ['NINO v' + (self.NINO_VERSION || '?') + ' build ' + (self.NINO_BUILD || '?') + (native() ? ' · แอปเนทีฟ' : ' · เบราว์เซอร์ (ไม่มี OTA/เชลล์/screenshot จริง)')];
    if (native()) {
      var s = await O().refresh(); await O().buildInfo();
      var r = O().running();
      L.push('กำลังใช้: ' + r.id + ' (v' + r.version + ', run ' + (r.run || '-') + ')' + (s.pending ? ' [รอยืนยันสุขภาพ]' : ''));
      L.push('ย้อนกลับได้: ' + (s.back || '-') + ' · ถัดไป: ' + (s.next || '-') + ' · เก็บไว้ ' + s.history.length + ' เวอร์ชัน');
      if (s.lastRollback) L.push('ถอยกลับอัตโนมัติล่าสุด: ' + s.lastRollback);
    }
    var gh = window.ninoGH;
    if (gh && gh.configured && gh.configured()) L.push('ไฟล์ staged ยังไม่ commit: ' + (gh.stagedList().join(', ') || 'ไม่มี'));
    L.push('NINO กำลังทำงาน: ' + (busy() ? 'ใช่' : 'ไม่') + ' · โหมดรีบูตเองอัตโนมัติ: ' + (autoOn() ? 'เปิด' : 'ปิด (ต้องให้ผู้ใช้กดยืนยัน)'));
    var j = readJob(); if (j) L.push('งาน Build ล่าสุด: ' + j.stage + (j.tag ? ' ' + j.tag : ''));
    return L.join('\n');
  }
  async function versionsText() {
    var s = await O().refresh();
    var L = [(s.active === 'builtin' ? '>' : '  ') + 'builtin (ติดมากับ APK)'];
    s.history.slice().reverse().forEach(function (m) { L.push((s.active === m.id ? '>' : '  ') + m.id + ' v' + m.version + ' run ' + m.run + (m.bad ? ' BAD' : '') + (m.pinned ? ' pinned' : '') + ' — ' + String(m.message || '').slice(0, 70)); });
    return L.join('\n');
  }

  /* reboot-causing requests need a human tap unless the user switched on auto mode */
  function request(kind, message) {
    try { LS.setItem(REQ, JSON.stringify({ kind: kind, message: message || '', t: Date.now() })); } catch (e) {}
    emit();
    if (autoOn()) {
      if (kind === 'build') { build({ message: message }); return 'เริ่ม Build อัตโนมัติ (โหมดอัตโนมัติเปิดอยู่) — ระบบจะรอให้ตอบเสร็จก่อนแล้วรีบูต'; }
      if (kind === 'rollback') { step(-1); return 'กำลังย้อนกลับเวอร์ชันและรีบูต'; }
    }
    say('NINO ขอ ' + (kind === 'build' ? 'Build' : 'ย้อนเวอร์ชัน') + ' — เปิดคอนโซล › Versions เพื่อยืนยัน', 'ok');
    return 'ส่งคำขอให้ผู้ใช้แล้ว — ผู้ใช้ต้องกดปุ่มในคอนโซล (Versions) เพื่อยืนยัน ห้ามบอกว่ารีบูต/อัปเดตแล้วจนกว่าจะเห็นผลลัพธ์จริง';
  }
  function pendingRequest() { try { return JSON.parse(LS.getItem(REQ) || 'null'); } catch (e) { return null; } }
  function clearRequest() { try { LS.removeItem(REQ); } catch (e) {} emit(); }

  var TOOLS = /^(app_status|app_versions|app_build|app_rollback|app_logs|app_diag|term_exec|godview_snap|godview_compare|godview_dom|godview_list)$/;
  async function dispatch(call) {
    var n = call.name, a = call.args || {};
    try {
      if (n === 'app_status') return ok(await statusText());
      if (n === 'app_versions') { if (!native()) return bad('ใช้ได้ในแอป APK เท่านั้น'); return ok(await versionsText()); }
      if (n === 'app_build') { if (!native()) return bad('ใช้ได้ในแอป APK เท่านั้น — ในเบราว์เซอร์ให้ commit แล้วรอ GitHub Pages'); return ok(request('build', a.message)); }
      if (n === 'app_rollback') { if (!native()) return bad('ใช้ได้ในแอป APK เท่านั้น'); return ok(request('rollback')); }
      if (n === 'app_logs') {
        if (!native()) return bad('ใช้ได้ในแอป APK เท่านั้น');
        var lg = await window.ninoNative.call('log.tail', { n: Math.min(200, Number(a.n) || 60), level: String(a.level || 'W').toUpperCase().slice(0, 1) });
        return ok(lg.lines.map(function (x) { return new Date(x.t).toISOString().slice(11, 19) + ' ' + x.l + '/' + x.tag + ': ' + x.msg; }).join('\n') || '(ไม่มี log ในระดับนี้)');
      }
      if (n === 'app_diag') return ok(await window.ninoObs.report());
      if (n === 'term_exec') {
        if (!a.cmd) return bad('ต้องมี cmd');
        var r = await window.ninoTerm.exec(a.cmd, { timeoutMs: Number(a.timeoutMs) || 30000 });
        return ok('exit ' + r.code + (r.timedOut ? ' (หมดเวลา)' : '') + (r.truncated ? ' (ตัดผลลัพธ์)' : '') + '\n' + r.out);
      }
      if (n === 'godview_snap') { var s = await G().snap(String(a.label || '').slice(0, 40)); return ok(G().describe(s) + '\n(id ' + s.id + ')'); }
      if (n === 'godview_compare') { var c = await G().compare(a.a, a.b); return ok(c.text); }
      if (n === 'godview_dom') { var d = G().dom(); return ok(G().describe({ id: 'now', label: 'ตอนนี้', t: Date.now(), version: self.NINO_VERSION, bundle: native() ? O().running().id : '', dom: d })); }
      if (n === 'godview_list') return ok(G().list().slice(0, 12).map(function (x) { return x.id + ' · ' + new Date(x.t).toISOString().slice(11, 19) + ' · ' + (x.label || '-') + ' · ' + x.dom.issues.length + ' ปัญหา'; }).join('\n') || '(ยังไม่มีภาพ)');
    } catch (e) { return bad(e.message || String(e)); }
    return bad('tool ไม่รู้จัก: ' + n);
  }

  var BLOCK = '\n\n## ระบบแอปจริง (เนทีฟ) — ดู/ทดสอบ/อัปเกรดตัวแอปเอง\n' +
    'app_status / app_versions: เวอร์ชันที่รันอยู่ + ย้อน/ถัดไป · app_logs {n,level} / app_diag: log เนทีฟและรายงานวินิจฉัย\n' +
    'app_build {message?}: ขอ Build จริง (commit → CI → ดาวน์โหลดพร้อมตรวจลายเซ็น → รีบูตทั้งแอป) ผู้ใช้ต้องกดยืนยันเอง · app_rollback: ขอย้อนเวอร์ชัน\n' +
    'godview_snap {label}: จับภาพหน้าจอจริง+ตรวจโครงสร้าง (ทำก่อนแก้ 1 ครั้ง หลัง Build 1 ครั้ง) → godview_compare {} เทียบก่อน/หลัง · godview_dom: ดูหน้าจอตอนนี้ · godview_list\n' +
    'term_exec {cmd,timeoutMs?}: เชลล์จริงของเครื่อง (ผู้ใช้กดอนุญาตเองทุกครั้ง) · งานที่แก้ android/ ต้อง Build แบบ APK และผู้ใช้ติดตั้งเอง\n' +
    'วงจรแบบ Claude Code: แก้ → commit → app_build → (ผู้ใช้ยืนยัน/รีบูต) → godview_compare → รายงานผลตามจริง ห้ามเดาว่าสำเร็จ\n';

  function hook() {
    var dt = window.dispatchTool, bp = window.buildSystemPrompt;
    if (typeof dt === 'function' && !dt._ninoSys) {
      var w = async function (call) { if (call && TOOLS.test(String(call.name || ''))) return dispatch(call); return dt.apply(this, arguments); };
      w._ninoSys = true; window.dispatchTool = w;
    }
    if (typeof bp === 'function' && !bp._ninoSys) {
      var p = function () { return bp.apply(this, arguments) + BLOCK; };
      p._ninoSys = true; window.buildSystemPrompt = p;
    }
  }
  hook();

  window.ninoSys = { state: function () { return st; }, on: function (f) { listeners.push(f); }, build: build, cancelBuild: cancelBuild, busy: busy,
    step: step, use: use, updateLatest: updateLatest, lastResult: lastResult, dismissResult: dismissResult, autoOn: autoOn, setAuto: setAuto,
    pendingRequest: pendingRequest, clearRequest: clearRequest, statusText: statusText, dispatch: dispatch, TOOLS: TOOLS, BLOCK: BLOCK, _hook: hook };

  if (native()) window.addEventListener('load', function () { setTimeout(function () { afterReboot().catch(function (e) { logE('W', 'afterReboot: ' + e.message); }); }, AFTER_MS); });
})();
