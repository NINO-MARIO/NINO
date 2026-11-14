/* NINO terminal: a real shell session on the phone (native /system/bin/sh) plus built-in `nino` commands.
   No pseudo-terminal: line commands work, full-screen programs (vi, top) do not. */
(function () {
  'use strict';
  var N = window.NINO_NATIVE && window.ninoNative && window.ninoNative.call ? window.ninoNative : null;
  var MAXLINES = 1500, HKEY = 'nino.term.hist', SKEY = 'nino.term.sid';

  /* ---------- pure helpers (unit-tested) ---------- */
  var COLORS = { 30: '#6e7681', 31: '#ff7b72', 32: '#8FD3B0', 33: '#d29922', 34: '#F28AB2', 35: '#bc8cff', 36: '#39c5cf', 37: '#E9E2EE',
    90: '#A79BB3', 91: '#ffa198', 92: '#56d364', 93: '#F2C275', 94: '#79c0ff', 95: '#C9A8F5', 96: '#56d4dd', 97: '#FBF7FD' };
  var SEQ = /\x1b\[([0-9;?]*)([A-Za-z])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Za-z0-9]|\x1b[=>78]|[\x00-\x08\x0b\x0c\x0e-\x1a\x7f]/g;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function stripAnsi(s) { return String(s).replace(SEQ, ''); }
  function sty(st) { var a = []; if (st.c) a.push('color:' + st.c); if (st.b) a.push('font-weight:700'); return a.join(';'); }

  /* Converts text with ANSI colour codes to safe HTML (everything is escaped first; only <span style> is emitted). */
  function ansiToHtml(s) {
    s = String(s);
    var out = '', open = false, st = { b: 0, c: null }, last = 0, m, re = new RegExp(SEQ.source, 'g');
    while ((m = re.exec(s))) {
      out += esc(s.slice(last, m.index));
      last = re.lastIndex;
      if (m[2] === 'm') {
        if (open) { out += '</span>'; open = false; }
        var codes = (m[1] || '0').split(';').map(function (x) { return parseInt(x, 10) || 0; });
        for (var i = 0; i < codes.length; i++) {
          var c = codes[i];
          if (c === 0) { st.b = 0; st.c = null; }
          else if (c === 1) st.b = 1;
          else if (c === 22) st.b = 0;
          else if (COLORS[c]) st.c = COLORS[c];
          else if (c === 39) st.c = null;
          else if (c === 38 || c === 48) i += codes[i + 1] === 5 ? 2 : codes[i + 1] === 2 ? 4 : 0;
        }
        var css = sty(st);
        if (css) { out += '<span style="' + css + '">'; open = true; }
      }
    }
    out += esc(s.slice(last));
    if (open) out += '</span>';
    return out;
  }

  function histLoad() { try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (e) { return []; } }
  function histSave(h) { try { localStorage.setItem(HKEY, JSON.stringify(h.slice(-100))); } catch (e) {} }

  /* Splits a command line into words, honouring simple quotes. */
  function words(line) {
    var out = [], cur = '', q = null, any = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) { if (ch === q) q = null; else cur += ch; }
      else if (ch === '"' || ch === "'") { q = ch; any = true; }
      else if (/\s/.test(ch)) { if (cur || any) { out.push(cur); cur = ''; any = false; } }
      else cur += ch;
    }
    if (cur || any) out.push(cur);
    return out;
  }

  /* ---------- session ---------- */
  var sess = { sid: null, alive: false, call: null, views: [] };

  function broadcast(text) { sess.views.forEach(function (v) { v.write(text); }); }
  function status(msg) { sess.views.forEach(function (v) { v.note(msg); }); }

  function onEvent(m) {
    if (m.open) { sess.sid = m.open.sid; sess.alive = true; try { localStorage.setItem(SKEY, sess.sid); } catch (e) {} status('เชลล์พร้อมแล้ว (' + sess.sid + ')'); }
    else if (m.attach) { sess.sid = m.attach.sid; sess.alive = !!m.attach.alive; if (m.attach.backlog) broadcast(m.attach.backlog); status('เชื่อมต่อเซสชัน ' + sess.sid + ' ต่อแล้ว'); }
    else if (m.out) broadcast(m.out.data);
    else if (m.exit) { sess.alive = false; status('เชลล์จบการทำงาน (รหัส ' + m.exit.code + ')'); }
  }

  async function ensure() {
    if (!N) throw new Error('เชลล์จริงใช้ได้ในแอป NINO.apk เท่านั้น (เบราว์เซอร์ใช้ได้เฉพาะคำสั่ง nino …)');
    if (sess.alive) return sess.sid;
    var old = ''; try { old = localStorage.getItem(SKEY) || ''; } catch (e) {}
    if (old) {
      try {
        var l = await N.call('term.list');
        var f = (l.sessions || []).filter(function (x) { return x.sid === old && x.alive; })[0];
        if (f) { sess.call = N.call('term.attach', { sid: old }, onEvent); sess.call.catch(function () { sess.alive = false; }); await new Promise(function (r) { setTimeout(r, 120); }); if (sess.alive) return sess.sid; }
      } catch (e) {}
    }
    sess.call = N.call('term.open', {}, onEvent);
    sess.call.catch(function (e) { sess.alive = false; status('เปิดเชลล์ไม่สำเร็จ: ' + e.message); });
    for (var i = 0; i < 80 && !sess.alive; i++) await new Promise(function (r) { setTimeout(r, 100); });
    if (!sess.alive) throw new Error('เปิดเชลล์ไม่สำเร็จ (ผู้ใช้ปฏิเสธหรือหมดเวลา)');
    return sess.sid;
  }
  async function send(text) { var sid = await ensure(); await N.call('term.write', { sid: sid, data: text }); }
  async function restart() {
    if (N && sess.sid) { try { await N.call('term.kill', { sid: sess.sid }); } catch (e) {} }
    sess.alive = false; sess.sid = null;
    try { localStorage.removeItem(SKEY); } catch (e) {}
    return ensure();
  }
  /* one-shot command for the AI: native shows its own approval dialog */
  async function exec(cmd, opt) {
    if (!N) throw new Error('ต้องใช้ในแอป NINO.apk');
    var r = await N.call('term.exec', { cmd: String(cmd), timeoutMs: (opt && opt.timeoutMs) || 30000 });
    return { code: r.code, out: r.out, timedOut: !!r.timedOut, truncated: !!r.truncated };
  }

  /* ---------- built-in `nino` commands ---------- */
  var HELP = [
    'คำสั่งในตัว (พิมพ์ nino <คำสั่ง>):',
    '  nino status           เวอร์ชันที่ใช้อยู่ + เวอร์ชันที่ย้อน/ถัดไปได้',
    '  nino versions         รายการเวอร์ชันที่เก็บไว้ในเครื่อง',
    '  nino update           ตรวจและติดตั้งเวอร์ชันล่าสุด แล้วรีบูต',
    '  nino build            commit งานที่ค้าง → รอ CI → ติดตั้ง → รีบูต',
    '  nino back | next      ย้อนกลับ/ถัดไปหนึ่งเวอร์ชัน แล้วรีบูต',
    '  nino use <id>         ใช้เวอร์ชันนี้ (id จาก nino versions)',
    '  nino log [n]          log เนทีฟ n บรรทัดล่าสุด (ค่าเริ่มต้น 40)',
    '  nino diag             รายงานวินิจฉัยทั้งระบบ (คัดลอกส่ง AI ได้)',
    '  nino lib [all]        สุขภาพหอสมุดสกิล (สีแดง = เกิน 500 บรรทัด/ชี้ผิด · สีเหลือง = pointer คลุมเครือ/ไม่มีประตูตัดสินใจ)',
    '  nino cache            สถานะแคชพรีฟิกซ์ของพรอมต์ + โทเคนที่ผู้ให้บริการรายงาน',
    '  nino snap [ชื่อ]       จับภาพหน้าจอ (Godview)',
    '  nino apk              ตรวจ/ติดตั้ง APK ใหม่ (ส่วนเนทีฟ)',
    '  clear                 ล้างหน้าจอ    help  ข้อความนี้',
    'อย่างอื่นจะถูกส่งเข้าเชลล์ของเครื่องจริง (ls, cat, grep, ping, …) ไม่มี vi/top'
  ].join('\n');

  function lineOf(m) { return (m.id === 'builtin' ? 'builtin' : m.id) + '  v' + (m.version || '?') + '  run ' + (m.run || '-') + '  ' + (m.signed ? 'signed' : 'unsigned') + (m.bad ? '  BAD' : '') + (m.pinned ? '  pinned' : '') + '  ' + String(m.message || '').slice(0, 60); }

  async function nino(args, out) {
    var cmd = args[0] || 'help', O = window.ninoOta, S = window.ninoSys;
    if (cmd === 'help') return out(HELP);
    if (cmd === 'lib') return out(window.ninoLibHealth ? window.ninoLibHealth.report({ ansi: true, all: args[1] === 'all' }) : 'ninoLibHealth ยังไม่พร้อม');
    if (cmd === 'cache') return out(window.ninoPC ? window.ninoPC.report() : 'ninoPC ยังไม่พร้อม');
    if (!O || !O.native) return out('คำสั่งนี้ต้องใช้ในแอป NINO.apk');
    if (cmd === 'status') {
      var s = await O.refresh(); await O.buildInfo();
      var r = O.running();
      out('กำลังใช้: ' + r.id + ' (v' + r.version + ', run ' + (r.run || '-') + ')' + (s.pending ? '  [รอยืนยันสุขภาพ]' : ''));
      out('ย้อนกลับได้ไป: ' + (s.back || '-') + '   ถัดไปได้ไป: ' + (s.next || '-'));
      out('เก็บไว้ในเครื่อง ' + s.history.length + ' เวอร์ชัน · ' + (s.bytes / 1048576).toFixed(1) + ' MB · repo ' + (s.repo || '(จากการตั้งค่า GitHub)') + ' · ต้องมีลายเซ็น: ' + (s.requireSignature ? 'ใช่' : 'ไม่ (debug)'));
      if (s.lastRollback) out('ถอยกลับล่าสุด: ' + s.lastRollback);
      return;
    }
    if (cmd === 'versions') {
      var st = await O.refresh();
      out((st.active === 'builtin' ? '>' : '  ') + 'builtin  (ติดมากับ APK)');
      st.history.slice().reverse().forEach(function (m) { out((st.active === m.id ? '>' : '  ') + lineOf(m)); });
      return;
    }
    if (cmd === 'update') { if (!S) return out('ninoSys ยังไม่พร้อม'); return S.updateLatest(out); }
    if (cmd === 'build') { if (!S) return out('ninoSys ยังไม่พร้อม'); return S.build({ log: out }); }
    if (cmd === 'back' || cmd === 'next') { if (!S) return out('ninoSys ยังไม่พร้อม'); return S.step(cmd === 'back' ? -1 : 1, out); }
    if (cmd === 'use') { if (!args[1]) return out('ใช้: nino use <id>'); if (!S) return out('ninoSys ยังไม่พร้อม'); return S.use(args[1], out); }
    if (cmd === 'log') {
      var n = Math.max(1, Math.min(300, parseInt(args[1], 10) || 40));
      var lg = await N.call('log.tail', { n: n });
      lg.lines.forEach(function (x) { out(new Date(x.t).toISOString().slice(11, 19) + ' ' + x.l + '/' + x.tag + ': ' + x.msg); });
      if (!lg.lines.length) out('(ว่าง)');
      return;
    }
    if (cmd === 'diag') return out(await window.ninoObs.report());
    if (cmd === 'snap') {
      if (!window.ninoGodview) return out('Godview ยังไม่พร้อม');
      var sn = await window.ninoGodview.snap(args.slice(1).join(' ') || 'manual');
      return out('จับภาพแล้ว: ' + sn.id + '  (' + sn.w + 'x' + sn.h + ', ' + Math.round(sn.bytes / 1024) + ' KB) · DOM ' + sn.dom.elements + ' elements, ปัญหา ' + sn.dom.issues.length);
    }
    if (cmd === 'apk') {
      var ck = await O.apkCheck();
      if (!ck.apk) return out('ยังไม่มี APK ในรีลีส nino-latest');
      out('APK ล่าสุด: v' + ck.apk.versionName + ' (code ' + ck.apk.versionCode + ') · ที่ติดตั้ง: ' + ck.installedName + ' (code ' + ck.installedCode + ')');
      if (!ck.newer) return out('เป็นเวอร์ชันล่าสุดแล้ว');
      if (!window.confirm('ดาวน์โหลดและติดตั้ง APK v' + ck.apk.versionName + ' ?\n(Android จะขอให้คุณกดยืนยันอีกครั้ง)')) return out('ยกเลิก');
      var last = '';
      await O.apkInstall(function (p) { var t = p.phase + (p.total ? ' ' + Math.round(p.done * 100 / p.total) + '%' : ''); if (t !== last) { last = t; out('… ' + t); } });
      return out('ส่งให้ตัวติดตั้งของ Android แล้ว — กดยืนยันในหน้าต่างที่เด้งขึ้น');
    }
    return out('ไม่รู้จัก nino ' + cmd + ' — พิมพ์ help');
  }

  /* ---------- view ---------- */
  function mount(host) {
    host.innerHTML = '<div class="nc-term"><div class="nc-out" tabindex="0"></div><div class="nc-keys"></div><form class="nc-in" autocomplete="off"><span class="nc-ps">$</span><input type="text" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="send" placeholder="พิมพ์คำสั่ง… (help)"><button type="submit">ส่ง</button></form></div>';
    var outEl = host.querySelector('.nc-out'), keys = host.querySelector('.nc-keys'), form = host.querySelector('form'), inp = host.querySelector('input');
    var lines = [], cur = null, hist = histLoad(), hi = hist.length, stick = true;

    function newLine(cls) { var d = document.createElement('div'); d.className = 'nc-l' + (cls ? ' ' + cls : ''); outEl.appendChild(d); lines.push(d); if (lines.length > MAXLINES) { var x = lines.shift(); if (x.parentNode) x.parentNode.removeChild(x); } return d; }
    function scroll() { if (stick) outEl.scrollTop = outEl.scrollHeight; }
    outEl.addEventListener('scroll', function () { stick = outEl.scrollHeight - outEl.scrollTop - outEl.clientHeight < 40; });

    var view = {
      write: function (text) {
        text = String(text).replace(/\r\n/g, '\n');
        var parts = text.split('\n');
        for (var i = 0; i < parts.length; i++) {
          var seg = parts[i], k = seg.lastIndexOf('\r');
          if (!cur) { cur = newLine(); cur._raw = ''; }
          if (k >= 0) { cur._raw = ''; seg = seg.slice(k + 1); }
          cur._raw += seg;
          cur.innerHTML = ansiToHtml(cur._raw) || '&nbsp;';
          if (i < parts.length - 1) cur = null;
        }
        scroll();
      },
      note: function (msg) { cur = null; var d = newLine('nc-note'); d.textContent = '· ' + msg; scroll(); },
      echo: function (cmd) { cur = null; var d = newLine('nc-cmd'); d.textContent = '$ ' + cmd; scroll(); },
      clear: function () { outEl.innerHTML = ''; lines = []; cur = null; }
    };
    sess.views.push(view);
    view.note('NINO Terminal · พิมพ์ help ดูคำสั่งในตัว · เชลล์จริงเปิดเมื่อพิมพ์คำสั่งแรก' + (N ? '' : ' (เบราว์เซอร์: ไม่มีเชลล์จริง)'));
    if (sess.alive) view.note('เซสชัน ' + sess.sid + ' ยังทำงานอยู่');

    function println(t) { view.write(String(t) + '\n'); }
    var running = false;
    async function submit(line) {
      line = line.trim();
      if (!line) return;
      if (hist[hist.length - 1] !== line) { hist.push(line); histSave(hist); }
      hi = hist.length;
      view.echo(line);
      if (line === 'clear') return view.clear();
      var w = words(line);
      try {
        if (w[0] === 'nino' || w[0] === 'help') { running = true; await nino(w[0] === 'help' ? ['help'] : w.slice(1), println); }
        else await send(line + '\n');
      } catch (e) { view.note('✗ ' + e.message); }
      running = false;
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); var v = inp.value; inp.value = ''; submit(v); });
    function key(label, fn) { var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', fn); keys.appendChild(b); }
    key('↑', function () { if (hi > 0) { hi--; inp.value = hist[hi] || ''; } inp.focus(); });
    key('↓', function () { if (hi < hist.length) { hi++; inp.value = hist[hi] || ''; } inp.focus(); });
    key('Ctrl-C', function () { view.note('^C — รีสตาร์ทเชลล์ (ไม่มี PTY จึงส่งสัญญาณขัดจังหวะไม่ได้)'); restart().catch(function (e) { view.note('✗ ' + e.message); }); });
    key('Tab', function () { inp.value += '  '; inp.focus(); });
    key('/', function () { inp.value += '/'; inp.focus(); });
    key('~', function () { inp.value += '~'; inp.focus(); });
    key('|', function () { inp.value += '|'; inp.focus(); });
    key('ล้าง', function () { view.clear(); });
    return { focus: function () { inp.focus(); }, view: view, destroy: function () { var i = sess.views.indexOf(view); if (i >= 0) sess.views.splice(i, 1); } };
  }

  window.ninoTerm = { mount: mount, exec: exec, send: send, restart: restart, ensure: ensure, session: function () { return { sid: sess.sid, alive: sess.alive }; },
    _ansi: ansiToHtml, _strip: stripAnsi, _words: words, _help: HELP };
})();
