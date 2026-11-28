/* NINO observability (web side). Loaded first so boot errors are captured.
   - in-page ring buffer of errors/warnings/events (also feeds Godview reports)
   - ninoObs.log() forwards deliberate events to the native log (native already logs console errors itself)
   - ninoObs.report() builds one diagnostic text for humans and for the AI */
(function () {
  'use strict';
  if (window.ninoObs) return;
  var MAX = 300, ring = [], marks = {}, T0 = Date.now();

  function push(l, tag, msg) {
    ring.push({ t: Date.now(), l: l, tag: tag, msg: String(msg == null ? '' : msg).slice(0, 700) });
    if (ring.length > MAX) ring.shift();
  }
  function fmt(args) {
    try {
      return Array.prototype.map.call(args, function (x) {
        if (x instanceof Error) return x.stack || x.message;
        if (x && typeof x === 'object') { try { return JSON.stringify(x); } catch (e) { return String(x); } }
        return String(x);
      }).join(' ');
    } catch (e) { return '?'; }
  }
  var oe = console.error, ow = console.warn;
  console.error = function () { push('E', 'console', fmt(arguments)); return oe.apply(console, arguments); };
  console.warn = function () { push('W', 'console', fmt(arguments)); return ow.apply(console, arguments); };
  window.addEventListener('error', function (e) {
    if (e.target && e.target !== window && (e.target.src || e.target.href)) {
      push('W', 'resource', 'failed to load ' + (e.target.src || e.target.href));
      return;
    }
    push('E', 'window', (e.message || 'error') + ' @ ' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    push('E', 'promise', r && r.stack ? r.stack : String(r));
  });

  function native() { return !!(window.NINO_NATIVE && window.ninoNative && window.ninoNative.call); }

  function log(level, tag, msg) {
    push(level, tag, msg);
    if (native()) window.ninoNative.call('log.add', { level: level, tag: tag, msg: String(msg).slice(0, 1500) }).catch(function () {});
  }

  function errors(sinceMs) {
    var from = sinceMs ? Date.now() - sinceMs : 0;
    return ring.filter(function (x) { return x.l === 'E' && x.t >= from; });
  }
  /* errors raised during the first `secs` seconds of this page load */
  function bootErrors(secs) {
    var to = T0 + (secs || 6) * 1000;
    return ring.filter(function (x) { return x.l === 'E' && x.t <= to; }).length;
  }
  function mark(name) { marks[name] = Date.now() - T0; }

  /* Pure formatter (unit-tested): parts = {app, page, errors, metrics, nativeLog, crash} */
  function formatReport(p) {
    var L = [];
    L.push('NINO diagnostic report · ' + (p.at || new Date().toISOString()));
    var a = p.app || {};
    L.push('app: v' + (a.version || '?') + ' build ' + (a.build || '?') + ' · bundle ' + (a.bundle || 'n/a') + (a.native ? ' · native ' + a.native : ' · browser'));
    var g = p.page || {};
    L.push('page: ' + (g.url || '?') + ' · viewport ' + (g.vw || '?') + 'x' + (g.vh || '?') + ' · online=' + g.online + ' · uptime ' + (g.uptime || 0) + 's');
    var er = p.errors || [];
    L.push('', 'page errors (' + er.length + '):');
    er.slice(-12).forEach(function (x) { L.push('  ' + new Date(x.t).toISOString().slice(11, 19) + ' [' + x.tag + '] ' + x.msg.split('\n')[0].slice(0, 200)); });
    if (!er.length) L.push('  none');
    var m = p.metrics;
    if (m) {
      L.push('', 'native metrics:');
      ['uptimeSec', 'jvmUsedMb', 'jvmMaxMb', 'nativeHeapMb', 'deviceAvailMb', 'deviceLowMemory', 'bundleBytes', 'activeBundle', 'webview'].forEach(function (k) {
        if (m[k] !== undefined) L.push('  ' + k + ': ' + m[k]);
      });
      var c = m.counters || {};
      var ks = Object.keys(c).sort();
      if (ks.length) L.push('  counters: ' + ks.map(function (k) { return k + '=' + c[k]; }).join(' '));
    }
    if (p.nativeLog && p.nativeLog.length) {
      L.push('', 'native log (warnings and errors):');
      p.nativeLog.slice(-25).forEach(function (x) { L.push('  ' + x.l + '/' + x.tag + ': ' + String(x.msg).slice(0, 220)); });
    }
    if (p.crash) L.push('', 'last native crash:', String(p.crash).split('\n').slice(0, 14).join('\n'));
    return L.join('\n');
  }

  async function report() {
    var parts = {
      at: new Date().toISOString(),
      app: { version: self.NINO_VERSION, build: self.NINO_BUILD, native: native() ? 'yes' : '', bundle: (window.ninoOta && window.ninoOta.running && window.ninoOta.running().id) || '' },
      page: { url: location.href, vw: window.innerWidth, vh: window.innerHeight, online: navigator.onLine, uptime: Math.round((Date.now() - T0) / 1000) },
      errors: ring.filter(function (x) { return x.l === 'E'; })
    };
    if (native()) {
      var N = window.ninoNative;
      try { parts.metrics = (await N.call('metrics')).metrics; } catch (e) {}
      try { parts.nativeLog = (await N.call('log.tail', { n: 60, level: 'W' })).lines; } catch (e) {}
      try { parts.crash = (await N.call('log.crash')).crash; } catch (e) {}
    }
    return formatReport(parts);
  }

  window.ninoObs = {
    log: log, push: push, errors: errors, bootErrors: bootErrors, mark: mark, report: report,
    ring: function () { return ring.slice(); },
    uptime: function () { return Date.now() - T0; },
    _format: formatReport
  };
})();
