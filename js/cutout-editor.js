/* NINO cutout editor: หน้าตัดรูปก่อนส่ง (ปุ่มกรรไกรในถาดรูป)
   ลากกรอบรอบวัตถุ หรือแตะส่วนที่เก็บ/ตัดออก แล้วกด "ตัดเลย" (GrabCut ในเวิร์กเกอร์)
   "ใช้รูปนี้" จะขยายผลกลับเป็นขนาดเดิมและส่งผลกลับผ่าน onDone ไม่ส่งข้อความเอง */
(function (root) {
  'use strict';

  const WORK_SIDE = 512;                       // ขนาดที่ตัดจริง (ด้านยาว) 512 ให้ขอบและตาขาวดีกว่า 256 แต่ช้ากว่า
  const OUT_SIDES = [1280, 1024, 800, 640, 512];
  const OUT_BYTES = 400 * 1024;                // เพดานเดียวกับระบบแนบรูป
  const KEEP = 1, DROP = 2;

  let worker = null, seq = 0, activeToken = 0;
  const calls = new Map();
  let ui = null;
  const S = {};

  function getWorker() {
    if (worker) return worker;
    if (typeof Worker !== 'function') throw new Error('เครื่องนี้ตัดรูปไม่ได้ (ไม่รองรับเวิร์กเกอร์)');
    worker = new Worker('./js/cutout-worker.js');
    worker.onmessage = function (e) {
      const d = e.data || {};
      const c = calls.get(d.id);
      if (!c) return;
      calls.delete(d.id);
      if (d.error) c.reject(new Error(d.error)); else c.resolve(d);
    };
    worker.onerror = function () {
      worker = null;
      for (const c of calls.values()) c.reject(new Error('ตัวตัดรูปทำงานไม่ได้'));
      calls.clear();
    };
    return worker;
  }

  function runCut(job) {
    return new Promise(function (resolve, reject) {
      const id = ++seq;
      calls.set(id, { resolve: resolve, reject: reject });
      try { getWorker().postMessage(Object.assign({ id: id }, job)); }
      catch (err) { calls.delete(id); reject(err); }
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('เปิดรูปนี้ไม่ได้')); };
      img.src = src;
    });
  }

  function say(text, cls) {
    if (!ui) return;
    ui.msg.textContent = text || '';
    ui.msg.className = 'nino-cut-msg' + (cls ? ' ' + cls : '');
  }

  function build() {
    const el = document.createElement('div');
    el.id = 'nino-cut';
    el.className = 'nino-cut';
    el.innerHTML = '<div class="nino-cut-box" role="dialog" aria-modal="true" aria-label="ตัดพื้นหลังรูป">'
      + '<div class="nino-cut-head"><span>ตัดพื้นหลัง</span><button type="button" class="nino-cut-close" data-act="cancel" aria-label="ปิด">×</button></div>'
      + '<p class="nino-cut-hint">ลากกรอบรอบวัตถุ แล้วกดตัดเลย ถ้ายังไม่ดี แตะเพิ่มส่วนที่เก็บหรือส่วนที่ตัดออก</p>'
      + '<div class="nino-cut-stage"><canvas class="nino-cut-cv"></canvas></div>'
      + '<div class="nino-cut-tools">'
      + '<button type="button" data-tool="rect" class="on">ลากกรอบ</button>'
      + '<button type="button" data-tool="keep">แตะส่วนที่เก็บ</button>'
      + '<button type="button" data-tool="drop">แตะส่วนที่ตัดออก</button>'
      + '<button type="button" data-act="undo">ย้อน</button>'
      + '<button type="button" data-act="clear">ล้างทั้งหมด</button>'
      + '</div>'
      + '<div class="nino-cut-msg" aria-live="polite"></div>'
      + '<div class="nino-cut-actions">'
      + '<button type="button" class="nino-cut-primary" data-act="cut">ตัดเลย</button>'
      + '<button type="button" class="nino-cut-primary" data-act="apply" disabled>ใช้รูปนี้</button>'
      + '<button type="button" data-act="cancel">ยกเลิก</button>'
      + '</div></div>';
    document.body.appendChild(el);
    ui = {
      root: el,
      cv: el.querySelector('.nino-cut-cv'),
      msg: el.querySelector('.nino-cut-msg'),
      apply: el.querySelector('[data-act="apply"]'),
      cut: el.querySelector('[data-act="cut"]')
    };
    ui.ctx = ui.cv.getContext('2d');
    el.addEventListener('click', onClick);
    ui.cv.addEventListener('pointerdown', onDown);
    ui.cv.addEventListener('pointermove', onMove);
    ui.cv.addEventListener('pointerup', onUp);
    ui.cv.addEventListener('pointercancel', onUp);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ui && ui.root.classList.contains('open')) close(); });
    return ui;
  }

  function snap() {
    return { rect: S.rect ? Object.assign({}, S.rect) : null, fg: S.fg.slice(), bg: S.bg.slice(), mask: S.mask ? S.mask.slice() : null };
  }

  function restore(h) {
    S.rect = h.rect; S.fg = h.fg; S.bg = h.bg; S.mask = h.mask;
  }

  function pointAt(e) {
    const r = ui.cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) * S.ww / r.width);
    const y = Math.floor((e.clientY - r.top) * S.wh / r.height);
    return { x: Math.max(0, Math.min(S.ww - 1, x)), y: Math.max(0, Math.min(S.wh - 1, y)) };
  }

  function stamp(x, y, mode) {
    const rad = Math.max(2, Math.round(Math.max(S.ww, S.wh) * 0.03));
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > rad * rad) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= S.ww || yy >= S.wh) continue;
      const i = yy * S.ww + xx;
      if (mode === KEEP) { S.fg[i] = 1; S.bg[i] = 0; } else { S.bg[i] = 1; S.fg[i] = 0; }
    }
  }

  function onDown(e) {
    if (!S.work || S.busy) return;
    const p = pointAt(e);
    ui.cv.setPointerCapture && ui.cv.setPointerCapture(e.pointerId);
    S.history.push(snap());
    S.mask = null;
    ui.apply.disabled = true;
    if (S.tool === 'rect') {
      S.drag = { kind: 'rect', x0: p.x, y0: p.y };
      S.rect = { x: p.x, y: p.y, w: 0, h: 0 };
    } else {
      S.drag = { kind: 'paint', mode: S.tool === 'keep' ? KEEP : DROP, last: p };
      stamp(p.x, p.y, S.drag.mode);
    }
    draw();
  }

  function onMove(e) {
    if (!S.drag) return;
    const p = pointAt(e);
    if (S.drag.kind === 'rect') {
      const x = Math.min(S.drag.x0, p.x), y = Math.min(S.drag.y0, p.y);
      S.rect = { x: x, y: y, w: Math.max(S.drag.x0, p.x) - x + 1, h: Math.max(S.drag.y0, p.y) - y + 1 };
    } else {
      const a = S.drag.last, steps = Math.max(Math.abs(p.x - a.x), Math.abs(p.y - a.y), 1);
      for (let s = 1; s <= steps; s++) stamp(Math.round(a.x + (p.x - a.x) * s / steps), Math.round(a.y + (p.y - a.y) * s / steps), S.drag.mode);
      S.drag.last = p;
    }
    draw();
  }

  function onUp() {
    if (!S.drag) return;
    if (S.drag.kind === 'rect' && S.rect && (S.rect.w < 4 || S.rect.h < 4)) S.rect = null;
    S.drag = null;
    draw();
  }

  // วาดภาพทำงาน + ทับด้วยพื้นที่ที่ตัดออก เส้นกรอบ และจุดที่แตะ
  function draw() {
    if (!S.work) return;
    const base = S.work.data;
    const out = new Uint8ClampedArray(base);
    const n = S.ww * S.wh;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (S.mask && !S.mask[i]) { out[o] = out[o] * 0.25; out[o + 1] = out[o + 1] * 0.25; out[o + 2] = out[o + 2] * 0.25 + 40; }
      if (S.fg && S.fg[i]) { out[o + 1] = Math.min(255, out[o + 1] * 0.5 + 120); }
      if (S.bg && S.bg[i]) { out[o] = Math.min(255, out[o] * 0.5 + 120); }
    }
    ui.cv.width = S.ww; ui.cv.height = S.wh;
    ui.ctx.putImageData(new ImageData(out, S.ww, S.wh), 0, 0);
    if (S.rect && S.rect.w > 0) {
      ui.ctx.save();
      ui.ctx.setLineDash([3, 2]);
      ui.ctx.lineWidth = 1;
      ui.ctx.strokeStyle = '#5EEAD4';
      ui.ctx.strokeRect(S.rect.x + 0.5, S.rect.y + 0.5, S.rect.w - 1, S.rect.h - 1);
      ui.ctx.restore();
    }
  }

  function setBusy(on) {
    S.busy = on;
    ui.cut.disabled = on;
    ui.apply.disabled = on || !S.mask;
    ui.cut.textContent = on ? 'กำลังตัด...' : 'ตัดเลย';
  }

  function onClick(e) {
    const t = e.target.closest ? e.target.closest('button') : null;
    if (!t || !ui) return;
    if (t.dataset.tool) {
      S.tool = t.dataset.tool;
      ui.root.querySelectorAll('[data-tool]').forEach(function (b) { b.classList.toggle('on', b === t); });
      return;
    }
    const act = t.dataset.act;
    if (act === 'cancel') return close();
    if (act === 'undo') {
      if (S.busy || !S.history.length) return;
      restore(S.history.pop());
      ui.apply.disabled = !S.mask;
      say('');
      return draw();
    }
    if (act === 'clear') {
      if (S.busy) return;
      S.history.push(snap());
      S.rect = null; S.fg.fill(0); S.bg.fill(0); S.mask = null;
      ui.apply.disabled = true;
      say('');
      return draw();
    }
    if (act === 'cut') return cut();
    if (act === 'apply') return apply();
  }

  function cut() {
    if (S.busy) return;
    const hasFg = S.fg.some(function (v) { return v; });
    const hasBg = S.bg.some(function (v) { return v; });
    if (!S.rect && !(hasFg && hasBg)) return say('ลากกรอบ หรือแตะทั้งส่วนที่เก็บและส่วนที่ตัดออกก่อนนะคะ', 'err');
    const token = activeToken;
    setBusy(true);
    say('กำลังตัดพื้นหลัง...');
    const job = {
      w: S.ww,
      h: S.wh,
      rgba: S.work.data.slice().buffer,
      rect: S.rect ? { x: S.rect.x, y: S.rect.y, w: S.rect.w, h: S.rect.h } : null,
      fg: S.fg.slice().buffer,
      bg: S.bg.slice().buffer
    };
    runCut(job).then(function (d) {
      if (token !== activeToken) return;
      S.mask = new Uint8Array(d.mask);
      setBusy(false);
      say('ตัดแล้ว ถ้ายังไม่ตรงให้แตะเพิ่มแล้วกดตัดใหม่ได้');
      draw();
    }, function (err) {
      if (token !== activeToken) return;
      setBusy(false);
      say(err && err.message ? err.message : 'ตัดไม่สำเร็จ ลองลากกรอบใหม่', 'err');
    });
  }

  // ขยายผลไปขนาดเต็มของรูปต้นฉบับ แล้วเลือกขนาดที่ไม่เกินเพดานแนบรูป
  async function apply() {
    if (!S.mask || S.busy) return;
    const token = activeToken;
    setBusy(true);
    say('กำลังทำรูปขนาดเต็ม...');
    try {
      const alphaFull = root.NINOCutout.upscaleAlpha(S.mask, S.ww, S.wh, S.fullW, S.fullH);
      const img = await loadImage(S.src);
      const full = document.createElement('canvas');
      full.width = S.fullW; full.height = S.fullH;
      const fx = full.getContext('2d');
      fx.drawImage(img, 0, 0, S.fullW, S.fullH);
      const id = fx.getImageData(0, 0, S.fullW, S.fullH);
      for (let i = 0; i < alphaFull.length; i++) id.data[i * 4 + 3] = alphaFull[i];
      root.NINOCutout.defringe(id.data, alphaFull, S.fullW, S.fullH);
      fx.putImageData(id, 0, 0);
      let result = null;
      for (const side of OUT_SIDES) {
        const k = Math.min(1, side / Math.max(S.fullW, S.fullH));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(S.fullW * k));
        c.height = Math.max(1, Math.round(S.fullH * k));
        c.getContext('2d').drawImage(full, 0, 0, c.width, c.height);
        const url = c.toDataURL('image/webp', 0.9);
        const mime = url.indexOf('data:image/webp') === 0 ? 'image/webp' : 'image/png';
        const data = mime === 'image/webp' ? url : c.toDataURL('image/png');
        const bytes = Math.round((data.length - data.indexOf(',') - 1) * 0.75);
        if (bytes <= OUT_BYTES) { result = { canvas: c, dataUrl: data, mime: mime, bytes: bytes }; break; }
      }
      if (token !== activeToken) return;
      if (!result) throw new Error('รูปที่ตัดแล้วยังใหญ่เกินเพดาน ลองใช้รูปที่เล็กกว่านี้');
      const th = document.createElement('canvas');
      const tk = Math.min(1, 192 / Math.max(result.canvas.width, result.canvas.height));
      th.width = Math.max(1, Math.round(result.canvas.width * tk));
      th.height = Math.max(1, Math.round(result.canvas.height * tk));
      th.getContext('2d').drawImage(result.canvas, 0, 0, th.width, th.height);
      const thumb = th.toDataURL('image/webp', 0.8).indexOf('data:image/webp') === 0 ? th.toDataURL('image/webp', 0.8) : th.toDataURL('image/png');
      const done = S.onDone;
      close();
      if (done) done({ dataUrl: result.dataUrl, mime: result.mime, bytes: result.bytes, thumb: thumb, w: result.canvas.width, h: result.canvas.height });
    } catch (err) {
      if (token !== activeToken) return;
      setBusy(false);
      say(err && err.message ? err.message : 'ใช้รูปนี้ไม่ได้', 'err');
    }
  }

  function close() {
    activeToken++;
    S.busy = false;
    S.drag = null;
    if (ui) ui.root.classList.remove('open');
  }

  // เปิดหน้าตัด: opts = { dataUrl, w, h, onDone(result) }
  async function open(opts) {
    if (!opts || !opts.dataUrl) return;
    const b = ui || build();
    const token = ++activeToken;
    S.src = opts.dataUrl;
    S.onDone = opts.onDone;
    say('กำลังเปิดรูป...');
    b.root.classList.add('open');
    try {
      const img = await loadImage(opts.dataUrl);
      if (token !== activeToken) return;
      const fw = img.naturalWidth || opts.w, fh = img.naturalHeight || opts.h;
      const k = Math.min(1, WORK_SIDE / Math.max(fw, fh));
      S.ww = Math.max(2, Math.round(fw * k));
      S.wh = Math.max(2, Math.round(fh * k));
      S.fullW = fw; S.fullH = fh;
      const wc = document.createElement('canvas');
      wc.width = S.ww; wc.height = S.wh;
      const wx = wc.getContext('2d');
      wx.drawImage(img, 0, 0, S.ww, S.wh);
      S.work = wx.getImageData(0, 0, S.ww, S.wh);
      S.rect = null;
      S.fg = new Uint8Array(S.ww * S.wh);
      S.bg = new Uint8Array(S.ww * S.wh);
      S.mask = null;
      S.history = [];
      S.tool = 'rect';
      S.busy = false;
      b.root.querySelectorAll('[data-tool]').forEach(function (x) { x.classList.toggle('on', x.dataset.tool === 'rect'); });
      b.apply.disabled = true;
      b.cut.textContent = 'ตัดเลย';
      say('');
      draw();
    } catch (err) {
      if (token !== activeToken) return;
      say(err && err.message ? err.message : 'เปิดรูปนี้ไม่ได้', 'err');
    }
  }

  root.NINOCutoutEditor = { open: open, close: close };
})(typeof window !== 'undefined' ? window : globalThis);
