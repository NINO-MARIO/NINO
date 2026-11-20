/* NINO Godview: look at the running app the way a user does.
   snap()    real screenshot of the screen (native PixelCopy) + a structural report of the page
   compare() before/after: pixel diff heat map + DOM diff, with a text summary an AI can act on */
(function () {
  'use strict';
  var N = window.NINO_NATIVE && window.ninoNative && window.ninoNative.call ? window.ninoNative : null;
  var KEY = 'nino.gv.snaps', MAXS = 40, MAXEL = 2500;

  /* ---------- pure helpers (unit-tested) ---------- */

  /* a, b: RGBA byte arrays of equal w*h. Returns pixel mask + 8x14 heat grid + bounding box. */
  function diffArrays(a, b, w, h, thr) {
    thr = thr || 48;
    var GW = 8, GH = 14, mask = new Uint8Array(w * h), cells = new Array(GW * GH), tot = new Array(GW * GH), changed = 0;
    for (var i = 0; i < cells.length; i++) { cells[i] = 0; tot[i] = 0; }
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) {
      var gy = Math.min(GH - 1, Math.floor(y * GH / h));
      for (var x = 0; x < w; x++) {
        var p = (y * w + x) * 4;
        var d = Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]);
        var gi = gy * GW + Math.min(GW - 1, Math.floor(x * GW / w));
        tot[gi]++;
        if (d > thr) {
          mask[y * w + x] = 1; changed++; cells[gi]++;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    var heat = cells.map(function (c, k) { return tot[k] ? c / tot[k] : 0; });
    return { w: w, h: h, mask: mask, changedPct: w * h ? changed * 100 / (w * h) : 0, heat: heat, gw: GW, gh: GH,
      bbox: changed ? { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h } : null };
  }

  var ROW = ['บนสุด', 'บน', 'กลางบน', 'กลาง', 'กลางล่าง', 'ล่าง', 'ล่างสุด'], COL = ['ซ้าย', 'กลาง', 'ขวา'];
  /* Turns the heat grid into "where did it change" words. */
  function regions(d) {
    var out = [];
    for (var r = 0; r < d.gh; r += 2) {
      for (var c = 0; c < d.gw; c += 3) {
        var s = 0, n = 0;
        for (var rr = r; rr < Math.min(d.gh, r + 2); rr++) for (var cc = c; cc < Math.min(d.gw, c + 3); cc++) { s += d.heat[rr * d.gw + cc]; n++; }
        var avg = n ? s / n : 0;
        if (avg > 0.04) out.push({ name: ROW[Math.floor(r / 2)] + '-' + COL[Math.min(2, Math.floor(c / 3))], pct: Math.round(avg * 100) });
      }
    }
    return out.sort(function (a, b) { return b.pct - a.pct; }).slice(0, 5);
  }

  function key(i) { return i.type + '|' + i.sel + '|' + (i.detail || ''); }
  /* Structural diff of two page reports. */
  function domDiff(a, b) {
    var la = {}, lb = {}, ia = {}, ib = {};
    (a.labels || []).forEach(function (x) { la[x] = 1; });
    (b.labels || []).forEach(function (x) { lb[x] = 1; });
    (a.issues || []).forEach(function (x) { ia[key(x)] = x; });
    (b.issues || []).forEach(function (x) { ib[key(x)] = x; });
    return {
      elementsDelta: (b.elements || 0) - (a.elements || 0),
      added: Object.keys(lb).filter(function (k) { return !la[k]; }).slice(0, 25),
      removed: Object.keys(la).filter(function (k) { return !lb[k]; }).slice(0, 25),
      newIssues: Object.keys(ib).filter(function (k) { return !ia[k]; }).map(function (k) { return ib[k]; }),
      fixedIssues: Object.keys(ia).filter(function (k) { return !ib[k]; }).map(function (k) { return ia[k]; }),
      versionChanged: a.version !== b.version ? (a.version + ' → ' + b.version) : '',
      bundleChanged: a.bundle !== b.bundle ? (a.bundle + ' → ' + b.bundle) : ''
    };
  }

  function issueLine(i) { return i.type + ' ' + i.sel + (i.detail ? ' (' + i.detail + ')' : ''); }

  /* Plain-text verdict for people and for the AI. px may be null when no screenshots exist. */
  function describeCompare(sa, sb, px, dd) {
    var L = ['GODVIEW เทียบ "' + (sa.label || sa.id) + '" → "' + (sb.label || sb.id) + '"'];
    if (dd.versionChanged) L.push('เวอร์ชัน: ' + dd.versionChanged);
    if (dd.bundleChanged) L.push('bundle: ' + dd.bundleChanged);
    if (px) {
      L.push('พิกเซลที่เปลี่ยน: ' + px.changedPct.toFixed(1) + '%' + (px.changedPct < 0.2 ? ' (แทบไม่ต่าง)' : px.changedPct > 40 ? ' (เปลี่ยนมาก)' : ''));
      var rg = regions(px);
      if (rg.length) L.push('บริเวณที่เปลี่ยนมากสุด: ' + rg.map(function (r) { return r.name + ' ' + r.pct + '%'; }).join(', '));
    } else L.push('ไม่มีภาพหน้าจอให้เทียบ (เทียบเฉพาะโครงสร้าง)');
    L.push('จำนวน element: ' + (dd.elementsDelta >= 0 ? '+' : '') + dd.elementsDelta);
    if (dd.added.length) L.push('ข้อความ/ปุ่มที่เพิ่ม: ' + dd.added.join(' | '));
    if (dd.removed.length) L.push('ข้อความ/ปุ่มที่หายไป: ' + dd.removed.join(' | '));
    if (dd.newIssues.length) L.push('ปัญหาใหม่ (' + dd.newIssues.length + '): ' + dd.newIssues.slice(0, 8).map(issueLine).join('; '));
    if (dd.fixedIssues.length) L.push('✓ แก้ปัญหาได้ (' + dd.fixedIssues.length + '): ' + dd.fixedIssues.slice(0, 5).map(issueLine).join('; '));
    var bad = dd.newIssues.length > 0 || (px && px.changedPct > 60);
    L.push('สรุป: ' + (bad ? 'ควรตรวจก่อนใช้ต่อ — มีปัญหาใหม่หรือหน้าจอเปลี่ยนมากผิดปกติ' : 'ไม่พบปัญหาใหม่ในโครงสร้างหน้าจอ'));
    return L.join('\n');
  }

  function describeSnap(s) {
    var d = s.dom || {}, L = ['GODVIEW ' + s.id + ' "' + (s.label || '') + '" · ' + new Date(s.t).toISOString().slice(11, 19) + ' · v' + (s.version || '?') + ' · bundle ' + (s.bundle || '?')];
    L.push('viewport ' + (d.viewport ? d.viewport.w + 'x' + d.viewport.h : '?') + ' · element ' + (d.elements || 0) + ' · มองเห็นข้อความ/ปุ่ม ' + ((d.labels || []).length));
    if (d.issues && d.issues.length) L.push('ปัญหาที่พบ (' + d.issues.length + '): ' + d.issues.slice(0, 10).map(issueLine).join('; '));
    else L.push('ไม่พบปัญหาเลย์เอาต์ที่ตรวจจับได้');
    if (d.errors) L.push('error ใน 60 วินาทีล่าสุด: ' + d.errors);
    if (d.labels && d.labels.length) L.push('ข้อความหลักบนจอ: ' + d.labels.slice(0, 30).join(' | '));
    return L.join('\n');
  }

  /* ---------- page inspection ---------- */
  function sel(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    var c = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
    return c ? s + '.' + c : s;
  }
  /* true when an ancestor (below <body>) scrolls horizontally, so a wide child is intentional */
  function inScroller(el) {
    for (var p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return true;
    }
    return false;
  }
  function visible(el, r, cs) {
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.02;
  }

  function domReport() {
    var vw = window.innerWidth, vh = window.innerHeight, root = document.getElementById('nino-console');
    var all = document.body ? document.body.querySelectorAll('*') : [], issues = [], labels = {}, count = 0, tiny = 0, wide = 0, clip = 0;
    var lim = Math.min(all.length, MAXEL);
    function add(type, el, detail) { if (issues.length < 90) issues.push({ type: type, sel: sel(el), detail: detail || '' }); }
    for (var i = 0; i < lim; i++) {
      var el = all[i];
      if (root && (el === root || root.contains(el))) continue;
      if (/^(SCRIPT|STYLE|LINK|META|HEAD|NOSCRIPT|TEMPLATE|SVG|PATH)$/i.test(el.tagName)) continue;
      var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!visible(el, r, cs)) continue;
      count++;
      var tag = el.tagName;
      if (/^(BUTTON|A|H1|H2|H3|H4|LABEL|SUMMARY)$/.test(tag) || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'tab') {
        var t = (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (t && Object.keys(labels).length < 120) labels[t] = 1;
      }
      var tappable = /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(tag) || el.getAttribute('role') === 'button';
      if (tappable && (r.width < 28 || r.height < 28) && tiny++ < 40) add('tiny-tap', el, Math.round(r.width) + 'x' + Math.round(r.height) + 'px');
      if (r.right > vw + 3 && r.left < vw && wide++ < 6 && cs.position !== 'fixed' && !inScroller(el)) add('overflow-x', el, 'ขอบขวา ' + Math.round(r.right) + ' > จอ ' + vw);
      if ((cs.overflow === 'hidden' || cs.overflowX === 'hidden') && el.scrollWidth > el.clientWidth + 3 && el.clientWidth > 0 && (el.innerText || '').trim() && clip++ < 6) add('clipped-text', el, el.scrollWidth + '>' + el.clientWidth);
      if (tag === 'IMG' && el.complete && el.naturalWidth === 0) add('broken-img', el, String(el.currentSrc || el.src).slice(-40));
      if (cs.position === 'fixed' && ((r.left < -6 && r.right > 6) || (r.right > vw + 6 && r.left < vw - 6) || (r.bottom > vh + 6 && r.top < vh - 6))) add('offscreen-fixed', el, Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    var de = document.documentElement;
    if (de.scrollWidth > vw + 3) issues.unshift({ type: 'page-scrolls-sideways', sel: 'html', detail: de.scrollWidth + '>' + vw });
    var errs = window.ninoObs ? window.ninoObs.errors(60000).length : 0;
    var run = window.ninoOta && window.ninoOta.running ? window.ninoOta.running() : null;
    return { title: document.title, viewport: { w: vw, h: vh }, scroll: { w: de.scrollWidth, h: de.scrollHeight }, elements: count,
      truncated: all.length > MAXEL, labels: Object.keys(labels), issues: issues, errors: errs, version: self.NINO_VERSION || '', bundle: run ? run.id : '' };
  }

  /* ---------- storage ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function save(l) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { /* quota: drop oldest and retry once */ try { localStorage.setItem(KEY, JSON.stringify(l.slice(0, 10))); } catch (e2) {} } }
  function frames(n) { return new Promise(function (r) { var k = 0; (function f() { if (++k > n) r(); else requestAnimationFrame(f); })(); }); }

  async function snap(label) {
    var C = window.ninoConsole, wasOpen = C && C.isOpen && C.isOpen();
    if (wasOpen) { C.peek(true); await frames(3); await new Promise(function (r) { setTimeout(r, 120); }); }
    var rec;
    try {
      var dom = domReport(), img = null;
      if (N) { try { img = await N.call('snap.take', { label: label || '' }); } catch (e) { if (window.ninoObs) ninoObs.log('W', 'godview', 'screenshot failed: ' + e.message); } }
      var run = window.ninoOta && window.ninoOta.running ? window.ninoOta.running() : null;
      rec = { id: img ? img.id : 'd' + Date.now().toString(36), label: label || '', t: Date.now(), url: img ? img.url : '', w: img ? img.w : 0, h: img ? img.h : 0,
        bytes: img ? img.bytes : 0, version: self.NINO_VERSION || '', bundle: run ? run.id : '', dom: dom };
      var l = load(); l.unshift(rec);
      var dropped = l.splice(MAXS);
      dropped.forEach(function (d) { if (N && d.url) N.call('snap.del', { snap: d.id }).catch(function () {}); });
      save(l);
    } finally { if (wasOpen) C.peek(false); }
    return rec;
  }

  function loadImg(url) {
    return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('โหลดภาพไม่ได้: ' + url)); }; i.src = url + '?_=' + Date.now(); });
  }
  async function pixels(sa, sb) {
    if (!sa.url || !sb.url) return null;
    var A = await loadImg(sa.url), B = await loadImg(sb.url), w = 270, h = Math.round(w * A.naturalHeight / A.naturalWidth);
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(A, 0, 0, w, h); var da = g.getImageData(0, 0, w, h).data;
    g.clearRect(0, 0, w, h); g.drawImage(B, 0, 0, w, h); var db = g.getImageData(0, 0, w, h).data;
    return diffArrays(da, db, w, h);
  }

  function find(id) { var l = load(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  /* a = before, b = after. Defaults: the two newest snapshots (older one is "before"). */
  async function compare(aId, bId) {
    var l = load();
    var sb = bId ? find(bId) : l[0], sa = aId ? find(aId) : l[1];
    if (!sa || !sb) throw new Error('ต้องมีภาพอย่างน้อย 2 ภาพก่อนเทียบ (ใช้ godview_snap ก่อนและหลังแก้)');
    var px = null;
    try { px = await pixels(sa, sb); } catch (e) { if (window.ninoObs) ninoObs.log('W', 'godview', 'pixel diff skipped: ' + e.message); }
    var dd = domDiff(sa.dom, sb.dom);
    return { a: sa, b: sb, px: px, dom: dd, text: describeCompare(sa, sb, px, dd) };
  }

  /* hands a screenshot to the chat as an attachment for the next message (vision models) */
  async function attachToChat(id) {
    var s = find(id);
    if (!s || !s.url) throw new Error('ไม่มีภาพนี้');
    if (!window.ninoImg || !window.ninoImg.handleFile) throw new Error('ระบบแนบรูปยังไม่พร้อม');
    var blob = await (await fetch(s.url)).blob();
    await window.ninoImg.handleFile(new File([blob], 'godview-' + s.id + '.jpg', { type: 'image/jpeg' }));
  }

  function remove(id) {
    var l = load().filter(function (x) { return x.id !== id; }); save(l);
    if (N) N.call('snap.del', { snap: id }).catch(function () {});
  }

  window.ninoGodview = { snap: snap, compare: compare, list: load, find: find, remove: remove, dom: domReport, describe: describeSnap,
    attachToChat: attachToChat, regions: regions, _diff: diffArrays, _domDiff: domDiff, _describeCompare: describeCompare, _describeSnap: describeSnap };
})();
