/* NINO OTA client: talks to the native bundle store. Upgrades the web layer (and the APK) from GitHub releases.
   Safety net lives in native code (watchdog + auto-rollback), so even a broken web bundle cannot lock you out. */
(function () {
  'use strict';
  var N = window.NINO_NATIVE && window.ninoNative && window.ninoNative.call ? window.ninoNative : null;
  var GHKEY = 'nino-gh-config';
  var REQUIRED = ['dispatchTool', 'ninoGH', 'ninoLib', 'renderMessages'];
  var state = null, binfo = null, listeners = [];

  function say(m, t) { if (typeof toast === 'function') toast(m, t || 'ok'); }
  function gh() { try { return JSON.parse(localStorage.getItem(GHKEY) || '{}') || {}; } catch (e) { return {}; } }
  function repo() { var c = gh(); return c.owner && (c.repo || 'NINO') ? String(c.owner).trim() + '/' + String(c.repo || 'NINO').trim() : ''; }
  function params(extra) { var o = Object.assign({}, extra || {}), r = repo(); if (r) o.repo = r; return o; }
  function need() { if (!N) throw new Error('ต้องใช้ในแอป NINO.apk (ไม่มีสะพานเนทีฟ)'); }
  function emit() { listeners.slice().forEach(function (f) { try { f(state); } catch (e) {} }); }

  /* newer = the candidate pointer has a higher CI run number than what is running */
  function isNewer(pointer, running) {
    if (!pointer) return false;
    var a = Number(pointer.run) || 0, b = Number(running && running.run) || 0;
    if (a && b) return a > b;
    return !!pointer.commit && !!running && !!running.commit ? pointer.commit !== running.commit && a >= b : false;
  }
  function metaOf(id) {
    if (!state) return null;
    for (var i = 0; i < state.history.length; i++) if (state.history[i].id === id) return state.history[i];
    return null;
  }
  async function buildInfo() {
    if (binfo) return binfo;
    try {
      var r = await fetch('./build-info.json?_=' + Date.now(), { cache: 'no-store' });
      binfo = r.ok ? await r.json() : {};
    } catch (e) { binfo = {}; }
    return binfo;
  }

  var api = {
    native: !!N,
    _isNewer: isNewer,
    on: function (f) { listeners.push(f); },

    async refresh() {
      if (!N) return null;
      state = (await N.call('ota.state')).state;
      emit();
      return state;
    },
    state: function () { return state; },

    /* what is running right now: {id, run, commit, version, builtin} */
    running: function () {
      var id = state ? state.active : 'builtin';
      if (id === 'builtin') {
        var b = binfo || {};
        return { id: 'builtin', builtin: true, run: Number(b.run) || 0, commit: b.commit || '', version: b.version || self.NINO_VERSION || '' };
      }
      var m = metaOf(id) || {};
      return { id: id, builtin: false, run: Number(m.run) || 0, commit: m.commit || '', version: m.version || '' };
    },
    buildInfo: buildInfo,

    async latest() { need(); return (await N.call('ota.latest', params())).pointer; },
    async check() {
      need();
      await Promise.all([api.refresh(), buildInfo()]);
      var p = await api.latest(), run = api.running();
      return { pointer: p, running: run, available: isNewer(p, run) };
    },
    async probe(tag) { need(); return (await N.call('ota.probe', params({ tag: tag }))).info; },
    async install(tag, o) {
      need(); o = o || {};
      var r = await N.call('ota.install', params({ tag: tag, activate: !!o.activate, allowOlder: !!o.allowOlder }), function (m) {
        if (m.progress && o.onProgress) o.onProgress(m.progress);
      });
      state = r.state; emit();
      return r.meta;
    },
    cancel: function (promise) { if (promise && promise.cancel) promise.cancel(); },
    async activate(id) { need(); state = (await N.call('ota.activate', { bundle: id })).state; emit(); return state; },
    async step(dir) { need(); var r = await N.call('ota.step', { dir: dir }); state = r.state; emit(); return r.active; },
    async remove(id) { need(); state = (await N.call('ota.remove', { bundle: id })).state; emit(); return state; },
    async pin(id, v) { need(); state = (await N.call('ota.pin', { bundle: id, pinned: !!v })).state; emit(); return state; },
    async remote() { need(); return (await N.call('ota.remote', params({ token: gh().token || '' }))).releases; },
    reload: function () { need(); return N.call('app.reload'); },
    restart: function () { need(); return N.call('app.restart'); },

    /* activate + reload in one go, remembering why, so the page can celebrate (or undo) after reboot */
    async reboot(why) {
      need();
      try { localStorage.setItem('nino.ota.rebooted', JSON.stringify({ t: Date.now(), why: why || '', from: api.running().id })); } catch (e) {}
      if (window.ninoObs) ninoObs.log('I', 'ota', 'reboot: ' + (why || ''));
      return api.reload();
    },

    async apkCheck() { need(); return N.call('apk.check', params()); },
    async apkInstall(onProgress, force) {
      need();
      return N.call('apk.install', params({ force: !!force }), function (m) { if (m.progress && onProgress) onProgress(m.progress); });
    }
  };

  /* --- boot health: tell native this bundle works, or ask it to roll back --- */
  function startHealth() {
    if (!N) return;
    var tries = 0;
    function tick() {
      api.refresh().then(function (s) {
        if (!s) return;
        if (s.lastRollback) {
          var seen = ''; try { seen = localStorage.getItem('nino.ota.seenRollback') || ''; } catch (e) {}
          if (seen !== s.lastRollback) {
            try { localStorage.setItem('nino.ota.seenRollback', s.lastRollback); } catch (e) {}
            say('เวอร์ชันใหม่เปิดไม่ผ่าน ระบบถอยกลับให้อัตโนมัติ — ' + String(s.lastRollback).slice(0, 90), 'err');
          }
        }
        if (!s.pending) return;
        var missing = REQUIRED.filter(function (k) { return typeof window[k] === 'undefined'; });
        var errs = window.ninoObs ? ninoObs.bootErrors(8) : 0;
        if (!missing.length && errs <= 3) {
          N.call('ota.healthy', { bundle: s.active }).then(function (r) {
            state = r.state; emit();
            if (window.ninoObs) ninoObs.log('I', 'ota', 'bundle ' + s.active + ' is healthy');
          });
          return;
        }
        if (++tries < 4) { setTimeout(tick, 2500); return; }
        var why = 'missing: ' + (missing.join(',') || '-') + ' · boot errors: ' + errs;
        if (window.ninoObs) ninoObs.log('E', 'ota', 'bundle ' + s.active + ' failed its health check (' + why + ')');
        N.call('ota.fail', { reason: why }).then(function (r) { if (r.rolledBackTo) api.reload(); });
      }).catch(function (e) { if (window.ninoObs) ninoObs.log('W', 'ota', 'health check error: ' + e.message); });
    }
    if (document.readyState === 'complete') setTimeout(tick, 3000);
    else window.addEventListener('load', function () { setTimeout(tick, 3000); });
  }

  window.ninoOta = api;
  if (N) { buildInfo(); api.refresh().catch(function () {}); startHealth(); }
})();
