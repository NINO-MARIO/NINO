(function () {
  var CSS = '.nino-cc{margin-top:2px;padding:8px 0 0 8px;border-top:1px dashed #272030;border-left:3px solid var(--cc,#A79BB3);display:flex;flex-direction:column;gap:6px;width:100%}' +
    '.nino-cc-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
    '.nino-cc-badge{font:600 10px/1 ui-monospace,Menlo,monospace;letter-spacing:.04em;color:var(--cc,#A79BB3);background:transparent;border:1px solid var(--cc,#A79BB3);border-radius:999px;padding:4px 9px;white-space:nowrap}' +
    '.nino-cc-en{flex:1 1 90px;min-width:80px;height:6px;background:#272030;border-radius:99px;overflow:hidden}' +
    '.nino-cc-en>i{display:block;height:100%;width:0;background:#8FD3B0;transition:width .4s ease}' +
    '.nino-cc-en>i.hot{background:#F26D78}' +
    '.nino-cc-num{font-size:10px;color:#A79BB3;font-family:ui-monospace,Menlo,monospace;min-width:32px;text-align:right}' +
        '.nino-cc-media[hidden]{display:none}' +
    '.nino-cc-media{border-radius:10px;overflow:hidden;background:#000;max-height:240px}' +
    '.nino-cc-media img,.nino-cc-media video{display:block;width:100%;max-height:240px;object-fit:contain;background:#000}';
  var st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var ctxCache = { t: 0, v: 0 };
  function ctxNow() {
    var now = Date.now();
    if (now - ctxCache.t < 1500) return ctxCache.v;
    ctxCache.t = now;
    try {
      var p = window.ninoAgent && window.ninoAgent.progress ? window.ninoAgent.progress() : null;
      ctxCache.v = p ? Math.max(0, Math.min(100, p.ctx || 0)) : 0;
    } catch (e) { ctxCache.v = 0; }
    return ctxCache.v;
  }
  function energy() { return 100 - ctxNow(); }

  function html(msg) {
    if (!msg || msg.sender !== 'nino' || msg.streaming || msg.error || msg.cg === undefined) return '';
    if (!window.ninoCgPick || !window.ninoCgPick.on()) return '';
    var cg = msg.cg;
    if (!cg || cg === 'NONE') return '';
    var inf = window.ninoMood.info(cg), en = energy();
    return '<div class="nino-cc" style="--cc:' + inf.color + '">' +
      '<div class="nino-cc-top">' +
      '<span class="nino-cc-badge">AI เลือก: ' + esc(cg) + ' · ' + esc(inf.label) + '</span>' +
      '<div class="nino-cc-en" title="พลังงานบริบท"><i data-cc-en class="' + (en <= 15 ? 'hot' : '') + '" style="width:' + en + '%"></i></div>' +
      '<span class="nino-cc-num" data-cc-num>' + en + '%</span>' +
      '</div>' +
      '<div class="nino-cc-media" data-cc-slot="' + esc(cg) + '" hidden></div>' +
      '</div>';
  }

  var prim = {}, ready = false, busy = false, gen = 0, els = new Map(), ELS_MAX = 60;

  function make(it) {
    var el = document.createElement(it.kind === 'video' ? 'video' : 'img');
    if (it.kind === 'video') {
      el.muted = true;
      el.loop = true;
      el.autoplay = true;
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      el.setAttribute('muted', '');
      el.setAttribute('loop', '');
      el.setAttribute('autoplay', '');
    }
    else el.alt = it.name;
    el.src = it.url;
    return el;
  }

  function loadPrim() {
    var g = gen, next = {};
    busy = true;
    return Promise.all(window.ninoCg.cats.map(function (s) {
      return window.ninoCg.primary(s).then(function (it) {
        if (!it) { next[s] = null; return; }
        return window.ninoCg.urlOf(it).then(function (u) {
          next[s] = { id: it.id, kind: it.kind, name: it.name || s, url: u };
        });
      });
    })).then(function () {
      if (g !== gen) return;
      prim = next;
      ready = true;
      busy = false;
      hydrate();
    }, function () {
      if (g === gen) busy = false;
    });
  }

  function fill(slot) {
    slot.setAttribute('data-hyd', '1');
    var it = prim[slot.getAttribute('data-cc-slot')];
    if (!it) { slot.innerHTML = ''; slot.hidden = true; return; }
    var row = slot.closest('[data-msg-id]');
    var key = (row ? row.getAttribute('data-msg-id') : 'x') + '|' + it.id;
    var el = els.get(key);
    if (!el) {
      el = make(it);
      els.set(key, el);
      if (els.size > ELS_MAX) els.delete(els.keys().next().value);
    }
    if (el.parentNode !== slot) {
      slot.innerHTML = '';
      slot.appendChild(el);
    }
    slot.hidden = false;
    if (el.tagName === 'VIDEO' && el.paused) {
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
    }
  }

  function hydrate() {
    var root = document.getElementById('chat-messages-container');
    if (!root || !window.ninoCg) return;
    if (!ready) { if (!busy) loadPrim(); return; }
    root.querySelectorAll('[data-cc-slot]:not([data-hyd])').forEach(fill);
  }

  var lastEn = -1;
  function refresh() {
    if (!document.querySelector('[data-cc-en]')) return;
    var en = energy();
    if (en === lastEn) return;
    lastEn = en;
    document.querySelectorAll('[data-cc-en]').forEach(function (i) {
      i.style.width = en + '%';
      i.classList.toggle('hot', en <= 15);
    });
    document.querySelectorAll('[data-cc-num]').forEach(function (n) { n.textContent = en + '%'; });
  }

  window.addEventListener('nino-cg-changed', function () {
    gen++;
    busy = false;
    ready = false;
    prim = {};
    els = new Map();
    document.querySelectorAll('[data-cc-slot]').forEach(function (s) {
      s.removeAttribute('data-hyd');
      s.innerHTML = '';
      s.hidden = true;
    });
    loadPrim();
  });

  function attach() {
    var root = document.getElementById('chat-messages-container');
    if (!root) return setTimeout(attach, 500);
    new MutationObserver(hydrate).observe(root, { childList: true, subtree: true });
    hydrate();
  }
  setInterval(refresh, 2000);
  attach();

  window.ninoChatCard = { html: html, refresh: refresh, hydrate: hydrate };
})();
