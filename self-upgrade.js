/* NINO self-upgrade — GitHub Contents API client + floating panel.
   Config (incl. token) lives ONLY in localStorage["nino-gh-config"]. Never commit tokens. */
(function () {
  'use strict';
  var KEY = 'nino-gh-config';
  var API = 'https://api.github.com';
  var DEFAULTS = { owner: '', repo: 'NINO', branch: 'main', token: '' };

  /* ---------- helpers ---------- */
  function toast(msg, type) {
    try {
      if (typeof window.toast === 'function') { window.toast(msg, type === 'err' ? 'err' : type === 'warn' ? 'warn' : 'ok'); return; }
    } catch (e) {}
    var el = document.getElementById('toast');
    if (!el) { console.log('[self-upgrade]', msg); return; }
    el.textContent = msg;
    el.className = type === 'err' ? 'err' : type === 'warn' ? 'warn' : '';
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 3500);
  }

  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str), bin = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  function b64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  function encPath(p) { return String(p).split('/').map(encodeURIComponent).join('/'); }

  function getConfig() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function setConfig(cfg) {
    var next = Object.assign({}, getConfig(), cfg || {});
    ['owner', 'repo', 'branch', 'token'].forEach(function (k) { next[k] = String(next[k] || '').trim(); });
    if (!next.repo) next.repo = DEFAULTS.repo;
    if (!next.branch) next.branch = DEFAULTS.branch;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { toast('บันทึก config ไม่ได้: ' + e.message, 'err'); }
    return next;
  }

  async function gh(method, path, body, accept) {
    var c = getConfig();
    if (!c.owner || !c.repo || !c.token) throw new Error('ยังไม่ได้ตั้งค่า owner / repo / token');
    var url = API + '/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo) + '/contents/' + encPath(path);
    if (method === 'GET') url += '?ref=' + encodeURIComponent(c.branch);
    var res = await fetch(url, {
      method: method,
      headers: {
        'Accept': accept || 'application/vnd.github+json',
        'Authorization': 'Bearer ' + c.token,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    });
    return res;
  }
  async function errText(res) {
    try { var j = await res.json(); return res.status + ' ' + (j.message || res.statusText); }
    catch (e) { return res.status + ' ' + res.statusText; }
  }

  /* ---------- API ---------- */
  // returns {content, sha} or null when file does not exist
  async function readMeta(path) {
    var res = await gh('GET', path);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await errText(res));
    var j = await res.json();
    if (Array.isArray(j)) throw new Error(path + ' เป็นโฟลเดอร์');
    var content;
    if (j.content && j.encoding === 'base64') content = b64ToUtf8(j.content);
    else { // >1MB: fetch raw
      var r2 = await gh('GET', path, null, 'application/vnd.github.raw+json');
      if (!r2.ok) throw new Error(await errText(r2));
      content = await r2.text();
    }
    return { content: content, sha: j.sha };
  }

  async function readFile(path) {
    try {
      var m = await readMeta(path);
      if (!m) throw new Error('ไม่พบไฟล์ ' + path);
      return m.content;
    } catch (e) { toast('readFile ล้มเหลว: ' + e.message, 'err'); throw e; }
  }

  async function writeFile(path, content, message) {
    try {
      var existing = await readMeta(path);
      var c = getConfig();
      var body = { message: message || ('update ' + path), content: utf8ToB64(String(content)), branch: c.branch };
      if (existing && existing.sha) body.sha = existing.sha;
      var res = await gh('PUT', path, body);
      if (!res.ok) throw new Error(await errText(res));
      var j = await res.json();
      return { commit: j.commit && j.commit.sha, path: path, created: !existing };
    } catch (e) { toast('writeFile ล้มเหลว: ' + e.message, 'err'); throw e; }
  }

  async function backup(path) {
    var m = await readMeta(path);
    if (!m) return null; // new file: nothing to back up
    var ts = new Date().toISOString().replace(/[:.]/g, '-');
    var r = await writeFile('backup/' + ts + '/' + path, m.content, 'backup before self-upgrade');
    return r.commit;
  }

  async function applyUpgrade(a, b) {
    // accepts applyUpgrade({files, note}) or applyUpgrade(files, note)
    var files, note;
    if (a && typeof a === 'object' && a.files && typeof a.files === 'object' && b === undefined) { files = a.files; note = a.note; }
    else { files = a; note = b; }
    files = files || {};
    note = note || 'NINO self-upgrade';
    var out = [];
    for (var path of Object.keys(files)) {
      var rec = { path: path, ok: false, commit: null, error: null };
      try {
        if (typeof files[path] !== 'string' || !files[path].length) throw new Error('เนื้อหาว่าง');
        if (/^backup\//.test(path)) throw new Error('ห้ามเขียนทับโฟลเดอร์ backup/');
        await backup(path);
        var r = await writeFile(path, files[path], 'self-upgrade: ' + note + ' [' + path + ']');
        rec.ok = true; rec.commit = r.commit;
      } catch (e) { rec.error = String((e && e.message) || e); }
      out.push(rec);
    }
    var okN = out.filter(function (x) { return x.ok; }).length;
    toast('อัปเกรด ' + okN + '/' + out.length + ' ไฟล์ — รีโหลดหน้า (ดึงลงเพื่อรีเฟรช)', okN === out.length ? 'ok' : 'warn');
    return out;
  }

  window.ninoSelfUpgrade = { getConfig: getConfig, setConfig: setConfig, readFile: readFile, writeFile: writeFile, backup: backup, applyUpgrade: applyUpgrade };

  /* ---------- floating UI ---------- */
  function mk(tag, props, kids) {
    var el = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'style') el.style.cssText = props[k];
      else if (k === 'text') el.textContent = props[k];
      else el[k] = props[k];
    });
    (kids || []).forEach(function (c) { el.appendChild(c); });
    return el;
  }

  function buildUI() {
    if (document.getElementById('nino-su-btn')) return;
    var fab = mk('button', {
      id: 'nino-su-btn', type: 'button', text: 'GH', title: 'NINO self-upgrade',
      style: 'position:fixed;right:calc(90px + env(safe-area-inset-right,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:9999;width:40px;height:40px;border-radius:50%;border:1px solid #3A3145;background:#1D1824;color:#E6EDF3;font-size:18px;cursor:pointer;opacity:.85;'
    });
    var inp = 'width:100%;box-sizing:border-box;margin:4px 0 10px;padding:8px;border-radius:6px;border:1px solid #3A3145;background:#14111A;color:#E6EDF3;font-size:14px;';
    var btn = 'padding:8px 12px;border-radius:6px;border:1px solid #3A3145;background:#272030;color:#E6EDF3;font-size:13px;cursor:pointer;';
    function field(label, id, type, ph) {
      return [mk('label', { text: label, style: 'font-size:12px;color:#A79BB3;' }), mk('input', { id: id, type: type || 'text', placeholder: ph || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, style: inp })];
    }
    var f = [].concat(field('Owner (GitHub username)', 'nino-su-owner'), field('Repo', 'nino-su-repo'), field('Branch', 'nino-su-branch'), field('Token (fine-grained PAT, Contents: read/write)', 'nino-su-token', 'password'));
    var bSave = mk('button', { type: 'button', text: 'Save config', style: btn });
    var bTest = mk('button', { type: 'button', text: 'Test connection', style: btn });
    var bRun = mk('button', { type: 'button', text: 'Run upgrade', style: btn + 'border-color:#F28AB2;' });
    var bClose = mk('button', { type: 'button', text: 'ปิด', style: btn + 'position:absolute;top:8px;right:8px;' });
    var ta = mk('textarea', { id: 'nino-su-json', placeholder: '{"files":{"app.js":"..."},"note":"..."}', spellcheck: false, style: inp + 'height:110px;font-family:monospace;font-size:12px;' });
    var status = mk('pre', { id: 'nino-su-out', style: 'white-space:pre-wrap;word-break:break-all;font-size:12px;color:#A79BB3;margin:6px 0 0;max-height:160px;overflow:auto;' });
    var row = mk('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;' }, [bSave, bTest, bRun]);
    var box = mk('div', { style: 'position:relative;width:min(92vw,460px);max-height:88vh;overflow:auto;background:#1D1824;color:#E6EDF3;border:1px solid #3A3145;border-radius:10px;padding:16px;' },
      [mk('h3', { text: 'NINO Self-Upgrade', style: 'margin:0 0 10px;font-size:16px;' }), bClose].concat(f, [row, mk('label', { text: 'Upgrade JSON', style: 'font-size:12px;color:#A79BB3;' }), ta, status]));
    var modal = mk('div', { id: 'nino-su-modal', style: 'display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px);' }, [box]);
    document.body.appendChild(fab); document.body.appendChild(modal);

    function $(id) { return document.getElementById(id); }
    function say(t, bad) { status.style.color = bad ? '#F26D78' : '#8FD3B0'; status.textContent = t; }
    function load() { var c = getConfig(); $('nino-su-owner').value = c.owner; $('nino-su-repo').value = c.repo; $('nino-su-branch').value = c.branch; $('nino-su-token').value = c.token; }
    function save() { setConfig({ owner: $('nino-su-owner').value, repo: $('nino-su-repo').value, branch: $('nino-su-branch').value, token: $('nino-su-token').value }); }
    function show(v) { modal.style.display = v ? 'flex' : 'none'; if (v) load(); }

    fab.addEventListener('click', function () { show(true); });
    bClose.addEventListener('click', function () { show(false); });
    modal.addEventListener('click', function (e) { if (e.target === modal) show(false); });
    bSave.addEventListener('click', function () { save(); say('✓ บันทึก config แล้ว (เก็บใน localStorage เท่านั้น)'); toast('บันทึกแล้ว'); });
    bTest.addEventListener('click', async function () {
      save(); say('กำลังทดสอบ…');
      try { var t = await readFile('index.html'); say('✓ เชื่อมต่อได้ — index.html ' + t.length + ' chars'); }
      catch (e) { say('✗ ' + e.message, true); }
    });
    bRun.addEventListener('click', async function () {
      save(); var payload;
      try { payload = JSON.parse(ta.value); } catch (e) { say('✗ JSON ไม่ถูกต้อง: ' + e.message, true); toast('JSON ไม่ถูกต้อง', 'err'); return; }
      if (!payload || typeof payload.files !== 'object') { say('✗ ต้องมี "files": {...}', true); return; }
      say('กำลังอัปเกรด…');
      try {
        var res = await applyUpgrade(payload);
        say(res.map(function (r) { return (r.ok ? '✓ ' : '✗ ') + r.path + (r.ok ? '  ' + r.commit : '  ' + r.error); }).join('\n'), res.some(function (r) { return !r.ok; }));
      } catch (e) { say('✗ ' + e.message, true); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI); else buildUI();
})();
