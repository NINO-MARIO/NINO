/* Test double for android NativeBridge: same message protocol (op/id in, id + events + done out).
   State lives in localStorage so it survives page reloads, like the real files on disk. */
(function () {
  var KEY = '__nativeMock';
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
  var S = load() || { active: 'builtin', pending: null, prev: null, lastRollback: null, tries: 0, history: [], releases: {}, pointer: null, apk: null, installedCode: 2900,
    logs: [], crash: null, sessions: {}, snapSeq: 0, probeMisses: {}, granted: false, failInstall: '' };
  var seq = { term: 0 };
  window.__mock = S; window.__mockSave = save;
  var NN = { onmessage: null, postMessage: function (s) { var m = JSON.parse(s); setTimeout(function () { try { handle(m); } catch (e) { out(m, { error: String(e.message || e) }); } }, 0); } };
  window.NinoNative = NN;
  function out(m, o) { o.id = m.id; setTimeout(function () { NN.onmessage && NN.onmessage({ data: JSON.stringify(o) }); }, 0); }
  function done(m, o) { o = o || {}; o.done = true; out(m, o); }
  function find(id) { return S.history.filter(function (x) { return x.id === id; })[0]; }
  function order() { return ['builtin'].concat(S.history.map(function (x) { return x.id; })); }
  function target(dir) { var a = order(), i = a.indexOf(S.active); for (var k = i + dir; k >= 0 && k < a.length; k += dir) { var h = find(a[k]); if (a[k] === 'builtin' || (h && !h.bad)) return a[k]; } return null; }
  function state() { return { active: S.active, pending: S.pending, prev: S.prev, lastGood: null, lastRollback: S.lastRollback, tries: S.tries, history: S.history, back: target(-1), next: target(1), bytes: S.history.reduce(function (a, b) { return a + b.size; }, 0), repo: 'tester/nino-app', requireSignature: true }; }
  function log(l, tag, msg) { S.logs.push({ t: Date.now(), l: l, tag: tag, msg: msg }); if (S.logs.length > 300) S.logs.shift(); save(); }
  var LV = { D: 0, I: 1, W: 2, E: 3 };
  window.__mockLog = log;

  function handle(m) {
    var op = m.op;
    console.log('[mock-op] ' + op + (m.tag ? ' ' + m.tag : '') + (m.bundle ? ' ' + m.bundle : '') + (m.dir ? ' dir=' + m.dir : ''));
    if (op === 'info') return done(m, { info: { package: 'app.nino', sdk: 34, bridge: 2, bundle: S.active, repo: 'tester/nino-app', debuggable: false, versionCode: S.installedCode, version: '2.9.0' } });
    if (op === 'ota.state') return done(m, { state: state() });
    if (op === 'ota.latest') return done(m, { pointer: S.pointer });
    if (op === 'ota.probe') {
      var r = S.releases[m.tag]; S.probeMisses[m.tag] = (S.probeMisses[m.tag] || 0);
      if (r && r.after && S.probeMisses[m.tag] < r.after) { S.probeMisses[m.tag]++; save(); return done(m, { info: null }); }
      return done(m, { info: r ? r.info : null });
    }
    if (op === 'ota.remote') return done(m, { releases: Object.keys(S.releases).map(function (t) { return { tag: t, name: S.releases[t].info.message, publishedAt: '2026-11-06T01:02:03Z', installed: !!find(t) }; }) });
    if (op === 'ota.install') {
      var rel = S.releases[m.tag];
      if (S.failInstall) { var f = S.failInstall; return out(m, { error: f === 'incompatible' ? 'needs a newer app' : f, code: f === 'incompatible' ? 'incompatible' : '' }); }
      if (!rel) return out(m, { error: 'release ' + m.tag + ' not found' });
      ['verify', 'download', 'hash', 'unpack'].forEach(function (ph, i) { setTimeout(function () { out(m, { progress: { phase: ph, done: i, total: 4 } }); }, i * 15); });
      setTimeout(function () {
        var i = rel.info;
        if (!find(i.id)) S.history.push({ id: i.id, version: i.version, commit: i.commit, message: i.message, builtAt: i.builtAt, sha256: 'x', run: i.run, installedAt: Date.now(), size: 1234567, files: 150, signed: true, pinned: false, bad: false });
        if (m.activate) { S.prev = S.active; S.active = i.id; S.pending = i.id; S.tries = 0; }
        save(); log('I', 'ota', 'installed ' + i.id);
        done(m, { meta: find(i.id), state: state() });
      }, 80);
      return;
    }
    if (op === 'ota.activate') { if (m.bundle !== 'builtin' && !find(m.bundle)) return out(m, { error: 'no such bundle: ' + m.bundle }); S.prev = S.active; S.active = m.bundle; S.pending = m.bundle === 'builtin' ? null : m.bundle; save(); return done(m, { state: state() }); }
    if (op === 'ota.step') { var t = target(m.dir >= 0 ? 1 : -1); if (!t) return out(m, { error: 'no version in that direction', code: 'end' }); S.prev = S.active; S.active = t; S.pending = t === 'builtin' ? null : t; save(); return done(m, { active: t, state: state() }); }
    if (op === 'ota.remove') { S.history = S.history.filter(function (x) { return x.id !== m.bundle; }); save(); return done(m, { state: state() }); }
    if (op === 'ota.pin') { var pp = find(m.bundle); if (pp) pp.pinned = !!m.pinned; save(); return done(m, { state: state() }); }
    if (op === 'ota.healthy') { if (S.pending === m.bundle) S.pending = null; S.tries = 0; save(); return done(m, { state: state() }); }
    if (op === 'ota.fail') {
      if (!S.pending) return done(m, { rolledBackTo: null, state: state() });
      var bad = find(S.active); if (bad) bad.bad = true;
      var to = S.prev && (S.prev === 'builtin' || find(S.prev)) ? S.prev : 'builtin';
      S.lastRollback = String(m.reason) + ' [' + S.active + ']'; S.active = to; S.pending = null; S.prev = null; save();
      return done(m, { rolledBackTo: to, state: state() });
    }
    if (op === 'app.reload') { done(m); return setTimeout(function () { location.reload(); }, 60); }
    if (op === 'app.restart') { return done(m); }
    if (op === 'apk.check') { return done(m, { installedCode: S.installedCode, installedName: '2.9.0', apk: S.apk, newer: !!S.apk && S.apk.versionCode > S.installedCode }); }
    if (op === 'apk.install') {
      if (!S.apk) return out(m, { error: 'no apk', code: 'none' });
      out(m, { progress: { phase: 'download', done: 1, total: 2 } });
      return setTimeout(function () { S.apkInstalling = true; save(); done(m, { state: 'awaiting_user', versionCode: S.apk.versionCode }); }, 50);
    }
    if (op === 'term.open') {
      if (!S.granted) { S.granted = true; save(); }
      var sid = 't' + (++seq.term); S.sessions[sid] = true; window.__mockTerm = { sid: sid, m: m };
      return out(m, { open: { sid: sid } });
    }
    if (op === 'term.list') return done(m, { sessions: [], granted: S.granted });
    if (op === 'term.write') {
      done(m);
      var line = String(m.data).replace(/\n$/, '');
      var term = window.__mockTerm; if (!term) return;
      var text = line === 'colors' ? '\x1b[31mred\x1b[0m \x1b[1;32mgreen\x1b[0m <b>not html</b>\n' : line.indexOf('echo ') === 0 ? line.slice(5) + '\n' : 'sh: ' + line + ': not found\n';
      return setTimeout(function () { out(term.m, { out: { sid: term.sid, data: text } }); }, 10);
    }
    if (op === 'term.kill') return done(m);
    if (op === 'term.exec') { log('I', 'term', 'exec: ' + m.cmd); return done(m, { code: 0, out: 'ran: ' + m.cmd + '\n', timedOut: false, truncated: false }); }
    if (op === 'log.tail') { var min = LV[m.level || 'D'] || 0; var ls = S.logs.filter(function (x) { return LV[x.l] >= min; }).slice(-(m.n || 100)); return done(m, { lines: ls }); }
    if (op === 'log.add') { log(m.level || 'I', 'js.' + (m.tag || 'app'), m.msg || ''); return done(m); }
    if (op === 'log.crash') return done(m, { crash: S.crash });
    if (op === 'log.clearCrash') { S.crash = null; save(); return done(m); }
    if (op === 'log.export') return done(m, { text: S.logs.map(function (x) { return x.l + '/' + x.tag + ': ' + x.msg; }).join('\n') });
    if (op === 'metrics') return done(m, { metrics: { uptimeSec: 42, jvmUsedMb: 30, jvmMaxMb: 256, nativeHeapMb: 20, deviceAvailMb: 1500, deviceLowMemory: false, bundleBytes: 1234567, activeBundle: S.active, webview: 'chromium test', counters: { 'boot.count': 3, 'net.requests': 9 } } });
    if (op === 'snap.take') {
      window.__shot().then(function (r) { done(m, { id: r.id, url: '/snaps/' + r.id + '.jpg', w: r.w, h: r.h, bytes: r.bytes, how: 'test', t: Date.now() }); }, function (e) { out(m, { error: String(e) }); });
      return;
    }
    if (op === 'snap.list') return done(m, { snaps: [] });
    if (op === 'snap.del') return done(m, { deleted: true });
    if (op === 'cancel') return done(m);
    return out(m, { error: 'ไม่รู้จักคำสั่ง ' + op });
  }
})();
