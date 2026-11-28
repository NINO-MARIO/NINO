/* NINO · เมนูโหนดแนว Sci-fi ใน >_
 *
 * ปุ่มรูปเมนู (#nd-menu) อยู่หัว >_ กดแล้วปุ่มทั้ง 8 สไลด์ออกมาเป็นวงโคจร 3 มิติ หมุนช้าๆ
 * มีเส้นเชื่อมจากแกนกลางและเส้นต่อระหว่างโหนด กดอีกครั้งจึงสไลด์กลับเข้าที่เดิม
 *
 * ไม่สร้างปุ่มใหม่: ปุ่มเดิมของแต่ละโมดูล (nd-font, nd-brain, ...) ถูกย้ายชั่วคราวเข้าวงโคจร
 * และทิ้ง comment ไว้ที่ตำแหน่งเดิม เมื่อปิดจะวางกลับตำแหน่งนั้นพร้อม style เดิม
 * จึงไม่กระทบ insertBefore ของโมดูลอื่น ไม่แตะ localStorage และไม่แตะความจำของ AI
 */
(function () {
  'use strict';
  var IDS = ['nd-font', 'nd-brain', 'nd-hc', 'nd-class', 'nd-lib', 'nd-cg', 'nd-mk', 'nd-console'];
  var NS = 'http://www.w3.org/2000/svg';
  var TILT = 0.9;
  var REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var SPIN = REDUCE ? 0.08 : 0.32;
  var S = { dr: null, orb: null, svg: null, btn: null, guide: null, nodes: [], target: 0, raf: 0, ang: 0, last: 0, R: 90, W: 0, H: 0 };

  var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="2.6"/><path d="M12 9.4V5.8M14.1 13.2L17.6 15.2M9.9 13.2L6.4 15.2"/><circle cx="12" cy="4" r="1.8"/><circle cx="19" cy="16.5" r="1.8"/><circle cx="5" cy="16.5" r="1.8"/></svg>';

  var CSS = [
    '#nino-drawer{background:linear-gradient(180deg,#0B0F16 0%,#0F0B16 100%);border-right:1px solid rgba(125,249,255,.35);box-shadow:0 0 22px rgba(125,249,255,.12)}',
    '#nino-drawer::before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(125,249,255,.035) 0 1px,transparent 1px 4px);z-index:0}',
    '#nino-drawer>div:first-child b{font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.3em;color:#7DF9FF;text-shadow:0 0 8px rgba(125,249,255,.7)}',
    '#nino-drawer .nd-b{background:rgba(125,249,255,.05);border:1px solid rgba(125,249,255,.4);color:#D6FBFF;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;letter-spacing:.03em;clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px);transition:box-shadow .2s,background .2s}',
    '#nino-drawer .nd-b:active{background:rgba(125,249,255,.18)}',
    '#nino-drawer .nd-b.on{background:rgba(255,179,71,.14);border-color:#FFB347;color:#FFE3B0;box-shadow:0 0 10px rgba(255,179,71,.35)}',
    '#nino-drawer #nd-scan{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#9FF6FF;background:rgba(125,249,255,.04);border-left:2px solid #7DF9FF;padding:6px 8px}',
    '#nino-drawer .nd-menu{width:34px;height:34px;padding:0;display:inline-flex;align-items:center;justify-content:center;margin:0 8px 0 auto;color:#7DF9FF;flex:0 0 auto}',
    '#nino-drawer .nd-menu svg{filter:drop-shadow(0 0 4px rgba(125,249,255,.8))}',
    '#nino-drawer .nd-menu.on{color:#FFB347;border-color:#FFB347}',
    '#nino-drawer.nd-orb #nd-scan,#nino-drawer.nd-orb #nd-new,#nino-drawer.nd-orb #nd-chats{visibility:hidden}',
    '#nd-orbit{position:absolute;left:0;right:0;visibility:hidden;pointer-events:none;z-index:2}',
    '#nd-orbit .nd-hub{position:absolute;left:50%;top:50%;width:74px;height:74px;margin:-37px 0 0 -37px;border-radius:50%;border:1px dashed rgba(255,179,71,.7);box-shadow:0 0 18px rgba(255,179,71,.35),inset 0 0 14px rgba(125,249,255,.2);display:flex;align-items:center;justify-content:center;font:700 11px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.2em;color:#FFE3B0;text-shadow:0 0 6px rgba(255,179,71,.8);background:radial-gradient(circle,rgba(125,249,255,.18),rgba(11,15,22,.85) 70%)}',
    '#nd-orbit .nd-hub:before{content:"";position:absolute;inset:-9px;border-radius:50%;border:1px solid rgba(125,249,255,.35);animation:nd-spin 9s linear infinite}',
    '@keyframes nd-spin{to{transform:rotate(360deg)}}',
    '@media (prefers-reduced-motion:reduce){#nd-orbit .nd-hub:before{animation:none}}',
    '#nd-orbit .nd-links{position:absolute;left:50%;top:50%;width:0;height:0;overflow:visible}',
    '#nd-orbit .nd-spoke{stroke:#7DF9FF;stroke-width:1;fill:none}',
    '#nd-orbit .nd-ring{stroke:#FFB347;stroke-width:1;stroke-dasharray:3 4;fill:none}',
    '#nd-orbit .nd-guide{fill:none;stroke:#7DF9FF;stroke-width:1;stroke-dasharray:2 6;stroke-opacity:.4}',
    '#nd-orbit .nd-node{position:absolute;left:50%;top:50%;width:74px;min-height:44px;margin:0;padding:6px 4px;box-sizing:border-box;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:9.5px;line-height:1.3;text-align:center;color:#E6FDFF;border:1px solid #7DF9FF;background:linear-gradient(160deg,rgba(125,249,255,.2),rgba(14,12,20,.94));box-shadow:0 0 12px rgba(125,249,255,.35),inset 0 0 10px rgba(125,249,255,.12);clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);transform-origin:center;backface-visibility:hidden;will-change:transform,opacity}',
    '#nd-orbit .nd-node:active{background:rgba(125,249,255,.3)}'
  ];

  function $(id) { return document.getElementById(id); }
  function svgEl(t, a) {
    var e = document.createElementNS(NS, t);
    Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); });
    return e;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function injectCss() {
    if ($('nd-orbit-style')) return;
    var s = document.createElement('style');
    s.id = 'nd-orbit-style';
    s.textContent = CSS.join('\n');
    document.head.appendChild(s);
  }

  function ensure() {
    if (S.orb) return true;
    var dr = $('nino-drawer'), x = $('nd-x');
    if (!dr || !x || !x.parentNode) return false;
    S.dr = dr;
    injectCss();

    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'nd-menu';
    b.className = 'nd-b nd-menu';
    b.title = 'เมนูโหนด';
    b.setAttribute('aria-label', 'เมนูโหนด');
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = ICON;
    x.parentNode.insertBefore(b, x);
    b.addEventListener('click', function () { setTarget(S.target ? 0 : 1); });
    S.btn = b;

    var o = document.createElement('div');
    o.id = 'nd-orbit';
    o.innerHTML = '<div class="nd-hub"><span>NINO</span></div>';
    var sv = svgEl('svg', { 'class': 'nd-links', 'aria-hidden': 'true' });
    S.guide = svgEl('path', { 'class': 'nd-guide' });
    sv.appendChild(S.guide);
    o.insertBefore(sv, o.firstChild);
    dr.appendChild(o);
    S.orb = o;
    S.svg = sv;

    // ปิดลิ้นชัก (ปุ่มปิด / ฉาก / กดโหนดแล้วลิ้นชักปิดเอง) ให้วงโคจรกลับเข้าที่ด้วย
    new MutationObserver(function () {
      if (!document.body.classList.contains('nd-open') && S.target) setTarget(0);
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return true;
  }

  function discover() {
    IDS.forEach(function (id) {
      var el = $(id);
      if (!el || S.nodes.some(function (n) { return n.id === id; })) return;
      var n = {
        id: id, el: el, ph: null, css: null, lp: 0, go: 0,
        spoke: svgEl('line', { 'class': 'nd-spoke' }),
        ring: svgEl('line', { 'class': 'nd-ring' }),
        pos: { x: 0, y: 0, d: 0.5, p: 0 }
      };
      S.svg.appendChild(n.spoke);
      S.svg.appendChild(n.ring);
      S.nodes.push(n);
    });
  }

  function park(n) {
    if (n.ph || !n.el.parentNode) return;
    n.css = n.el.getAttribute('style');
    n.ph = document.createComment('slot:' + n.id);
    n.el.parentNode.insertBefore(n.ph, n.el);
    S.orb.appendChild(n.el);
    n.el.classList.add('nd-node');
  }

  function unpark(n) {
    if (!n.ph) return;
    var p = n.ph.parentNode;
    if (p) { p.insertBefore(n.el, n.ph); p.removeChild(n.ph); }
    else S.dr.appendChild(n.el);
    n.el.classList.remove('nd-node');
    if (n.css == null) n.el.removeAttribute('style');
    else n.el.setAttribute('style', n.css);
    n.ph = null;
    n.css = null;
  }

  function size() {
    var hd = S.dr.firstElementChild;
    var top = hd ? hd.offsetTop + hd.offsetHeight + 10 : 60;
    var bl = $('nd-build');
    var bottom = bl && bl.parentNode ? S.dr.clientHeight - bl.parentNode.offsetTop + 10 : 80;
    S.orb.style.top = top + 'px';
    S.orb.style.bottom = bottom + 'px';
    S.W = S.orb.clientWidth;
    S.H = S.orb.clientHeight;
    S.R = Math.max(70, Math.min(S.W * 0.38, S.H * 0.4));
    // เส้นทางวงโคจร (ไม่หมุน) วาดจากวงเต็มที่ความเอียงเดียวกับโหนด
    var d = '';
    for (var k = 0; k <= 48; k++) {
      var a = k * 2 * Math.PI / 48;
      var rx = S.R * Math.cos(a), rz = S.R * Math.sin(a);
      var ry = -rz * Math.sin(TILT);
      d += (k ? 'L' : 'M') + rx.toFixed(1) + ' ' + ry.toFixed(1);
    }
    S.guide.setAttribute('d', d + 'Z');
  }

  function finish() {
    S.raf = 0;
    S.orb.style.visibility = 'hidden';
    S.dr.classList.remove('nd-orb');
    S.nodes.forEach(unpark);
  }

  function tick(now) {
    var dt = Math.min(0.05, Math.max(0, (now - S.last) / 1000));
    S.last = now;
    S.ang += SPIN * dt * (S.target ? 1 : 0.4);
    var N = S.nodes.length, R = S.R, cs = Math.cos(TILT), sn = Math.sin(TILT);
    var maxGo = -Infinity, sumP = 0, i, n, a, rx, rz, ry, zz, p, depth, sc, px, py;

    for (i = 0; i < N; i++) {
      n = S.nodes[i];
      if (now >= n.go) n.lp += (S.target - n.lp) * Math.min(1, dt * 7);
      if (n.go > maxGo) maxGo = n.go;
      p = clamp01(n.lp);
      sumP += p;
      a = S.ang + i * 2 * Math.PI / N;
      rx = R * Math.cos(a);
      rz = R * Math.sin(a);
      ry = -rz * sn;
      zz = rz * cs;
      px = rx * p;
      py = ry * p;
      depth = (zz + R) / (2 * R);
      sc = (0.4 + 0.6 * p) * (0.82 + 0.3 * depth);
      n.el.style.transform = 'translate(-50%,-50%) translate3d(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px,0) scale(' + sc.toFixed(3) + ')';
      n.el.style.opacity = (p * (0.35 + 0.65 * depth)).toFixed(3);
      n.el.style.zIndex = String(Math.round(zz + R) + 2);
      n.el.style.pointerEvents = (S.target && p > 0.6) ? 'auto' : 'none';
      n.pos = { x: px, y: py, d: depth, p: p };
    }

    for (i = 0; i < N; i++) {
      n = S.nodes[i];
      var c = n.pos;
      n.spoke.setAttribute('x2', c.x.toFixed(1));
      n.spoke.setAttribute('y2', c.y.toFixed(1));
      n.spoke.setAttribute('stroke-opacity', (c.p * (0.2 + 0.6 * c.d)).toFixed(3));
      if (N > 1) {
        var q = S.nodes[(i + 1) % N].pos;
        n.ring.setAttribute('x1', c.x.toFixed(1));
        n.ring.setAttribute('y1', c.y.toFixed(1));
        n.ring.setAttribute('x2', q.x.toFixed(1));
        n.ring.setAttribute('y2', q.y.toFixed(1));
        n.ring.setAttribute('stroke-opacity', (Math.min(c.p, q.p) * 0.4).toFixed(3));
      }
    }
    if (N) S.guide.setAttribute('stroke-opacity', (0.4 * sumP / N).toFixed(3));

    var done = !S.target && S.nodes.every(function (x) { return x.lp < 0.003; }) && now >= maxGo;
    if (done) { finish(); return; }
    S.raf = requestAnimationFrame(tick);
  }

  function setTarget(v) {
    if (!ensure()) return;
    var now = performance.now();
    discover();
    if (v) {
      size();
      S.nodes.forEach(park);
      S.orb.style.visibility = 'visible';
      S.dr.classList.add('nd-orb');
      S.btn.classList.add('on');
      S.btn.setAttribute('aria-pressed', 'true');
      S.nodes.forEach(function (n, i) { n.go = now + i * 70; });
    } else {
      S.btn.classList.remove('on');
      S.btn.setAttribute('aria-pressed', 'false');
      S.nodes.forEach(function (n, i) { n.go = now + (S.nodes.length - 1 - i) * 45; });
    }
    S.target = v;
    if (!S.raf) {
      S.last = now;
      S.raf = requestAnimationFrame(tick);
    }
  }

  function init() { ensure(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.ninoOrbit = {
    open: function () { setTarget(1); },
    close: function () { setTarget(0); },
    isOpen: function () { return !!S.target; },
    nodeIds: IDS.slice()
  };
})();
