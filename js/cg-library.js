(function () {
  var DBN = 'nino-cg', DBV = 1, STORE = 'items', LIMIT = 20, MAX_IMG = 25 * 1024 * 1024, MAX_VID = 200 * 1024 * 1024;
  var $ = function (i) { return document.getElementById(i); };
  var db = null, urls = {}, sheet = null, cat = 'HAPPY';
  var CATS = ['HAPPY', 'SAD', 'SASSY', 'THINKING', 'ANGRY', 'NEUTRAL'];
  var HINT = {
    HAPPY: 'ใช้เมื่อ NINO ดีใจ ขำ หรือชื่นชม',
    SAD: 'ใช้เมื่อ NINO เหงา ผิดหวัง หรือปลอบใจ',
    SASSY: 'ใช้เมื่อ NINO แซว ประชด หรือขี้เล่น',
    THINKING: 'ใช้เมื่อ NINO วิเคราะห์ อธิบายเหตุผล หรือคิดเป็นขั้นตอน',
    ANGRY: 'ใช้เมื่อ NINO หงุดหงิด เข้มงวด หรือตักเตือน',
    NEUTRAL: 'ใช้เมื่อคุยทั่วไป ข้อเท็จจริง ไม่มีอารมณ์เด่น'
  };

  var IMG_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i, VID_EXT = /\.(mp4|m4v|mov|webm|mkv|3gp|avi)$/i;
  function kindOf(file) {
    if (/^image\//.test(file.type)) return 'image';
    if (/^video\//.test(file.type)) return 'video';
    if (VID_EXT.test(file.name || '')) return 'video';
    if (IMG_EXT.test(file.name || '')) return 'image';
    return null;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function notify(m) { if (typeof toast === 'function') toast(m); else alert(m); }

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DBN, DBV);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = function () { db = r.result; res(db); };
      r.onerror = function () { rej(r.error); };
    });
  }

  function req(r) {
    return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; });
  }

  function all() {
    return open().then(function (d) { return req(d.transaction(STORE, 'readonly').objectStore(STORE).getAll()); });
  }

  function batch(fn) {
    return open().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, 'readwrite');
        fn(t.objectStore(STORE));
        t.oncomplete = function () { res(); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }

  function changed() {
    window.dispatchEvent(new CustomEvent('nino-cg-changed'));
    if (sheet && sheet.classList.contains('on')) renderSheet();
  }

  function revoke(id) {
    if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; }
  }

  function list(state) {
    return all().then(function (items) {
      return items.filter(function (x) { return x.state === state; }).sort(function (a, b) { return b.addedAt - a.addedAt; });
    });
  }

  function primary(state) {
    return list(state).then(function (items) {
      if (!items.length) return null;
      return items.filter(function (x) { return x.primary; })[0] || items[0];
    });
  }

  function urlOf(item) {
    if (!urls[item.id]) urls[item.id] = URL.createObjectURL(item.blob);
    return Promise.resolve(urls[item.id]);
  }

  function add(file, state) {
    var kind = kindOf(file);
    if (!kind) return Promise.reject(new Error('ไม่รู้จักชนิดไฟล์นี้ (ใช้ได้เฉพาะรูปภาพหรือวิดีโอ)'));
    var isV = kind === 'video';
    if (!isV && file.size > MAX_IMG) return Promise.reject(new Error('รูปใหญ่เกิน 25 MB'));
    if (isV && file.size > MAX_VID) return Promise.reject(new Error('วิดีโอใหญ่เกิน 200 MB'));
    if (!file.size) return Promise.reject(new Error('ไฟล์ว่างเปล่า'));
    return list(state).then(function (mine) {
      if (mine.length >= LIMIT) throw new Error('หมวดนี้เต็มแล้ว (' + LIMIT + ' รายการ)');
      var item = {
        id: 'cg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        state: state, kind: kind, name: file.name || '', type: file.type || (isV ? 'video/*' : 'image/*'),
        size: file.size, addedAt: Date.now(), primary: mine.length === 0, blob: file
      };
      return batch(function (s) { s.put(item); }).catch(function (err) {
        if (err && err.name === 'QuotaExceededError') throw new Error('พื้นที่เก็บของเบราว์เซอร์ไม่พอ ลบรายการเก่าออกก่อนแล้วลองใหม่');
        throw err;
      });
    }).then(changed);
  }

  function setPrimary(id) {
    return all().then(function (items) {
      var it = items.filter(function (x) { return x.id === id; })[0];
      if (!it) return;
      return batch(function (s) {
        items.forEach(function (x) {
          if (x.state !== it.state) return;
          var want = x.id === id;
          if (!!x.primary !== want) { x.primary = want; s.put(x); }
        });
      });
    }).then(changed);
  }

  function remove(id) {
    return all().then(function (items) {
      var it = items.filter(function (x) { return x.id === id; })[0];
      if (!it) return;
      revoke(id);
      return batch(function (s) {
        s.delete(id);
        if (it.primary) {
          var rest = items.filter(function (x) { return x.state === it.state && x.id !== id; })
            .sort(function (a, b) { return b.addedAt - a.addedAt; });
          if (rest[0]) { rest[0].primary = true; s.put(rest[0]); }
        }
      });
    }).then(changed);
  }

  function css() {
    var s = document.createElement('style');
    s.textContent = '#nino-cg{position:fixed;inset:0;z-index:2147483100;background:#14111A;color:#E9E2EE;display:none;flex-direction:column;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}' +
      '#nino-cg.on{display:flex}' +
      '#nino-cg *{box-sizing:border-box}' +
      '.ncg-top{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #3A3145;background:#1D1824}' +
      '.ncg-top b{font-size:15px;color:#FBF7FD}.ncg-top small{display:block;font-size:11px;color:#A79BB3;margin-top:2px}' +
      '.ncg-x{margin-left:auto;background:#272030;color:#E9E2EE;border:1px solid #3A3145;border-radius:8px;padding:6px 12px;font-size:13px}' +
      '.ncg-tabs{display:flex;gap:6px;overflow-x:auto;padding:8px 10px;border-bottom:1px solid #272030;flex-shrink:0}' +
      '.ncg-tab{flex:0 0 auto;background:#1D1824;color:#A79BB3;border:1px solid #3A3145;border-radius:999px;padding:6px 10px;font-size:12px;white-space:nowrap}' +
      '.ncg-tab.on{color:#FBF7FD;border-color:#F28AB2;background:#272030}' +
      '.ncg-tab i{font-style:normal;margin-left:4px;color:#9BE0BC}' +
      '.ncg-body{flex:1;min-height:0;overflow-y:auto;padding:10px 12px 24px;-webkit-overflow-scrolling:touch}' +
      '.ncg-hint{font-size:12px;color:#A79BB3;background:#1D1824;border:1px solid #3A3145;border-radius:10px;padding:8px 10px;margin-bottom:10px;line-height:1.5}' +
      '.ncg-hint b{color:#F2C275;font-weight:600}' +
      '.ncg-add{width:100%;padding:11px;border-radius:10px;border:1px dashed #F28AB2;background:#1D1824;color:#F28AB2;font-size:13px;margin-bottom:12px}' +
      '.ncg-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}' +
      '.ncg-card{background:#1D1824;border:1px solid #3A3145;border-radius:10px;overflow:hidden;display:flex;flex-direction:column}' +
      '.ncg-card.is-primary{border-color:#9BE0BC}' +
      '.ncg-media{aspect-ratio:4/3;background:#000;display:block;width:100%;object-fit:contain}' +
      '.ncg-meta{padding:6px 8px;font-size:11px;color:#A79BB3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ncg-acts{display:flex;gap:6px;padding:0 8px 8px}' +
      '.ncg-acts button{flex:1;padding:6px 4px;border-radius:7px;border:1px solid #3A3145;background:#272030;color:#E9E2EE;font-size:11px}' +
      '.ncg-acts .ncg-del{color:#F26D78}' +
      '.ncg-badge{color:#9BE0BC}' +
      '.ncg-empty{grid-column:1/-1;text-align:center;color:#6E6279;font-size:12px;padding:24px 8px}' +
      '.ncg-foot{font-size:10px;color:#6E6279;margin-top:12px;line-height:1.5}' +
      '.ncg-switch{display:flex;gap:10px;align-items:flex-start;background:#1D1824;border:1px solid #3A3145;border-radius:10px;padding:10px;margin-bottom:10px;cursor:pointer}' +
      '.ncg-switch input{margin-top:3px;width:18px;height:18px;accent-color:#9BE0BC;flex-shrink:0}' +
      '.ncg-switch b{display:block;font-size:13px;color:#FBF7FD;font-weight:600}' +
      '.ncg-switch small{display:block;font-size:11px;color:#A79BB3;margin-top:3px;line-height:1.5}' +
      '.ncg-status{font-size:12px;line-height:1.5;border:1px solid #3A3145;border-radius:10px;padding:8px 10px;margin-bottom:10px;background:#14111A;word-break:break-word}';
    document.head.appendChild(s);
  }

  function build() {
    css();
    sheet = document.createElement('div');
    sheet.id = 'nino-cg';
    sheet.innerHTML = '<header class="ncg-top"><div><b>ห้องฟิล์ม CG</b><small>ภาพและวิดีโอที่ NINO ใช้ในการ์ดแชทตามอารมณ์</small></div><button type="button" class="ncg-x" data-act="close">ปิด</button></header>' +
      '<nav class="ncg-tabs" id="ncg-tabs"></nav>' +
      '<div class="ncg-body">' +
      '<label class="ncg-switch"><input type="checkbox" id="ncg-on"><span><b>ให้ NINO เห็นห้องฟิล์มนี้</b><small>เปิด: NINO เห็นชื่อหมวดที่มีรูปหรือวิดีโอ และเลือกเองว่าจะแสดงอันไหนในการ์ดแชท · ปิด: NINO ไม่เห็นห้องนี้ ไม่มีการ์ดแชท ไม่ใช้โทเคนเพิ่ม</small></span></label>' +
      '<div class="ncg-hint" id="ncg-hint"></div>' +
      '<div class="ncg-status" id="ncg-status" style="display:none"></div>' +
      '<button type="button" class="ncg-add" data-act="add">+ เพิ่มรูปภาพหรือวิดีโอ</button>' +
      '<div class="ncg-grid" id="ncg-grid"></div>' +
      '<div class="ncg-foot">แต่ละหมวดเก็บได้ ' + LIMIT + ' รายการ รูปไม่เกิน 25 MB วิดีโอไม่เกิน 200 MB ไฟล์เก็บในเครื่องนี้เท่านั้น ไม่ถูกส่งไปกับข้อความ NINO เห็นแค่ชื่อหมวด</div></div>' +
      '<input type="file" id="ncg-file" accept="image/*,video/*,.heic,.heif,.mkv,.mov,.m4v,.3gp" multiple style="display:none">';
    document.body.appendChild(sheet);
    sheet.addEventListener('click', onClick);
    $('ncg-file').addEventListener('change', onFiles);
    $('ncg-on').addEventListener('change', function (e) {
      if (window.ninoCgPick) window.ninoCgPick.setOn(e.target.checked);
    });
  }

  function onClick(e) {
    var t = e.target.closest && e.target.closest('button');
    if (!t) return;
    var act = t.getAttribute('data-act');
    if (act === 'close') return close();
    if (act === 'add') return $('ncg-file').click();
    if (t.hasAttribute('data-cat')) { cat = t.getAttribute('data-cat'); return renderSheet(); }
    if (act === 'primary') return setPrimary(t.getAttribute('data-id')).catch(function (err) { notify(err.message); });
    if (act === 'del') {
      if (!confirm('ลบรายการนี้ออกจากห้องฟิล์ม?')) return;
      return remove(t.getAttribute('data-id')).catch(function (err) { notify(err.message); });
    }
  }

  function setStatus(text, bad) {
    var el = $('ncg-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = bad ? '#F26D78' : '#9BE0BC';
    el.style.display = text ? 'block' : 'none';
  }

  function onFiles(e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    var ok = 0, failed = [];
    setStatus('กำลังบันทึก ' + files.length + ' ไฟล์...', false);
    files.reduce(function (p, f) {
      return p.then(function () {
        return add(f, cat).then(function () { ok++; }, function (err) {
          failed.push(f.name + ': ' + (err && err.message ? err.message : 'บันทึกไม่สำเร็จ'));
        });
      });
    }, Promise.resolve()).then(function () {
      var msg = 'บันทึกสำเร็จ ' + ok + ' ไฟล์';
      if (failed.length) msg += ' · ไม่สำเร็จ ' + failed.length + ' ไฟล์: ' + failed.join(' | ');
      setStatus(msg, failed.length > 0);
      notify(msg);
    });
  }

  function setSwitch() {
    var box = $('ncg-on');
    if (box && window.ninoCgPick) box.checked = window.ninoCgPick.on();
  }

  function renderSheet() {
    if (!sheet) return;
    Promise.all(CATS.map(function (s) { return list(s); })).then(function (lists) {
      var counts = {};
      CATS.forEach(function (s, i) { counts[s] = lists[i]; });
      var tabs = $('ncg-tabs');
      tabs.innerHTML = '';
      CATS.forEach(function (s) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ncg-tab' + (s === cat ? ' on' : '');
        b.setAttribute('data-cat', s);
        b.textContent = window.ninoMood.info(s).label;
        var i = document.createElement('i');
        i.textContent = counts[s].length;
        b.appendChild(i);
        tabs.appendChild(b);
      });
      $('ncg-hint').innerHTML = '<b>' + esc(window.ninoMood.info(cat).label) + ' (' + cat + ')</b> · ' + esc(HINT[cat]) + '<br>' + esc(window.ninoMood.info(cat).desc) + '. กดปุ่ม "ตั้งเป็นหลัก" เพื่อเลือกรายการที่ใช้แสดงในการ์ดแชท';
      var grid = $('ncg-grid');
      grid.innerHTML = '';
      var items = counts[cat];
      if (!items.length) {
        var em = document.createElement('div');
        em.className = 'ncg-empty';
        em.textContent = 'ยังไม่มี CG ในหมวดนี้ การ์ดแชทจะแสดงแค่สถานะอารมณ์';
        grid.appendChild(em);
        return;
      }
      items.forEach(function (it) {
        urlOf(it).then(function (u) {
          var card = document.createElement('div');
          card.className = 'ncg-card' + (it.primary ? ' is-primary' : '');
          var m = document.createElement(it.kind === 'video' ? 'video' : 'img');
          m.className = 'ncg-media';
          if (it.kind === 'video') { m.muted = true; m.loop = true; m.playsInline = true; m.setAttribute('playsinline', ''); m.setAttribute('preload', 'metadata'); m.controls = true; }
          else m.alt = it.name || cat;
          m.src = u;
          card.appendChild(m);
          var meta = document.createElement('div');
          meta.className = 'ncg-meta';
          meta.textContent = (it.kind === 'video' ? 'วิดีโอ' : 'รูปภาพ') + (it.name ? ' · ' + it.name : '');
          card.appendChild(meta);
          var acts = document.createElement('div');
          acts.className = 'ncg-acts';
          var p = document.createElement('button');
          p.type = 'button';
          p.setAttribute('data-act', 'primary');
          p.setAttribute('data-id', it.id);
          p.textContent = it.primary ? 'หลักอยู่' : 'ตั้งเป็นหลัก';
          if (it.primary) p.className = 'ncg-badge';
          var d = document.createElement('button');
          d.type = 'button';
          d.className = 'ncg-del';
          d.setAttribute('data-act', 'del');
          d.setAttribute('data-id', it.id);
          d.textContent = 'ลบ';
          acts.appendChild(p);
          acts.appendChild(d);
          card.appendChild(acts);
          grid.appendChild(card);
        });
      });
    }).catch(function (err) { notify('เปิดห้องฟิล์มไม่ได้: ' + err.message); });
  }

  function openSheet(state) {
    if (!sheet) build();
    if (state && CATS.indexOf(state) >= 0) cat = state;
    sheet.classList.add('on');
    setSwitch();
    renderSheet();
  }

  function close() { if (sheet) sheet.classList.remove('on'); }

  function mk() {
    var dr = $('nino-drawer');
    if (!dr) return setTimeout(mk, 500);
    if ($('nd-cg')) return;
    var b = document.createElement('button');
    b.className = 'nd-b';
    b.id = 'nd-cg';
    b.textContent = 'CG · ห้องฟิล์มอารมณ์';
    b.onclick = function () { openSheet(); };
    var lib = $('nd-lib');
    dr.insertBefore(b, lib ? lib.nextSibling : null);
  }

  window.ninoCg = {
    open: openSheet,
    close: close,
    cats: CATS.slice(),
    list: list,
    primary: primary,
    urlOf: urlOf,
    add: add,
    remove: remove
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mk);
  else mk();
})();
