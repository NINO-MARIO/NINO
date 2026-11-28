/* ตัวเล่นเกม NDS (น่ารักและเล่นง่าย): ปุ่มสัมผัส ปุ่มคีย์บอร์ด เสียง ภาพรูปถ่าย และการตั้งค่า
   ทำงานผ่านสัญญาแกน (core-contract.js) เท่านั้น: setKeys(mask), audioBuffer(), reset() เป็นตัวเลือก
   ถ้าแกนไม่มีฟังก์ชันเหล่านี้ ตัวเล่นจะบอกในหน้าตั้งค่าและไม่ผิดพลาด */
var NDS_PLAYER = (function () {
  /* บิตปุ่มตามลำดับ KEYINPUT ของ DS (1 = กด) */
  var BITS = { A: 0, B: 1, SELECT: 2, START: 3, RIGHT: 4, LEFT: 5, UP: 6, DOWN: 7, R: 8, L: 9, X: 10, Y: 11 };
  var NAMES = { A: 'A', B: 'B', X: 'X', Y: 'Y', L: 'L', R: 'R', START: 'เริ่ม', SELECT: 'เลือก', UP: 'บน', DOWN: 'ล่าง', LEFT: 'ซ้าย', RIGHT: 'ขวา' };
  /* คีย์บอร์ด (ใช้ e.code จึงไม่ขึ้นกับภาษาของแป้น) */
  var DEFAULT_BINDS = {
    UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight',
    A: 'KeyX', B: 'KeyZ', X: 'KeyS', Y: 'KeyA', L: 'KeyQ', R: 'KeyW',
    START: 'Enter', SELECT: 'Backspace'
  };
  var binds = copyBinds(DEFAULT_BINDS);       /* การกระทำ -> รหัสแป้น (ตั้งค่าได้) */
  var waitingFor = null;                       /* การกระทำที่กำลังรอให้กดปุ่มใหม่ */
  var DEFAULTS = { volume: 0.6, showFps: true, smooth: false };
  /* จอยเกมตามมาตรฐาน Gamepad API (ปุ่มล่างของจอยเกมคือ B ของ DS) */
  var PAD_MAP = { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 8: 'SELECT', 9: 'START', 12: 'UP', 13: 'DOWN', 14: 'LEFT', 15: 'RIGHT' };
  var settings = { volume: DEFAULTS.volume, showFps: DEFAULTS.showFps, smooth: DEFAULTS.smooth };
  var io = { get: null, put: null, toast: function () {} };
  var built = false, playing = false, paused = false;
  var held = {};              /* ชื่อปุ่ม -> จำนวนแหล่งที่กดอยู่ (คีย์บอร์ดและสัมผัส) */
  var core = null, title = '';
  var ac = null, gain = null, nextAt = 0, audioCalls = 0;
  var romKey = null, curId = null, ready = true, saveTimer = 0, lastSum = -1;   /* เซฟของเกม: คีย์ IndexedDB และสถานะการโหลด */
  var touchDown = false, touchX = 0, touchY = 0;                  /* จอสัมผัส (จอล่าง 256x192) */
  var padHeld = {};                                               /* ปุ่มจากจอยเกมในเฟรมนี้ */

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* ---------- การตั้งค่า (เก็บไว้ในเครื่อง) ---------- */
  function loadSettings() {
    if (!io.get) return Promise.resolve();
    return io.get('nds:settings').then(function (v) {
      if (v && typeof v === 'object') {
        if (typeof v.volume === 'number') settings.volume = Math.max(0, Math.min(1, v.volume));
        if (typeof v.showFps === 'boolean') settings.showFps = v.showFps;
        if (typeof v.smooth === 'boolean') settings.smooth = v.smooth;
        if (v.binds && typeof v.binds === 'object') {
          Object.keys(DEFAULT_BINDS).forEach(function (k) {
            if (typeof v.binds[k] === 'string') binds[k] = v.binds[k];
          });
        }
      }
    }).catch(function () {});
  }
  function saveSettings() {
    if (io.put) io.put('nds:settings', { volume: settings.volume, showFps: settings.showFps, smooth: settings.smooth, binds: copyBinds(binds) }).catch(function () {});
  }
  function applySettings() {
    if (gain) gain.gain.value = settings.volume;
    var fps = $('fps');
    if (fps) fps.hidden = !settings.showFps;
    var c = $('screen');
    if (c) c.classList.toggle('np-smooth', !!settings.smooth);
  }

  /* ---------- ปุ่ม ---------- */
  function copyBinds(src) {
    var out = {};
    Object.keys(src).forEach(function (k) { out[k] = src[k]; });
    return out;
  }
  /* รหัสแป้น -> การกระทำ (ใช้เมื่อกดแป้นจริง) */
  function nameForCode(code) {
    var found = null;
    Object.keys(binds).forEach(function (k) { if (binds[k] === code) found = k; });
    return found;
  }
  function press(name) { held[name] = (held[name] || 0) + 1; }
  function release(name) {
    if (!held[name]) return;
    held[name]--;
    if (held[name] <= 0) delete held[name];
  }
  function pollGamepads() {
    var list = (navigator.getGamepads && navigator.getGamepads()) || [];
    var now = {};
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (!g) continue;
      var btns = g.buttons || [];
      for (var b = 0; b < btns.length; b++) {
        if (btns[b] && btns[b].pressed && PAD_MAP[b]) now[PAD_MAP[b]] = true;
      }
      var ax = g.axes || [];
      if (ax[0] < -0.5) now.LEFT = true;
      if (ax[0] > 0.5) now.RIGHT = true;
      if (ax[1] < -0.5) now.UP = true;
      if (ax[1] > 0.5) now.DOWN = true;
    }
    padHeld = now;
  }
  function mask() {
    var m = 0;
    Object.keys(held).forEach(function (name) {
      if (BITS[name] !== undefined && held[name] > 0) m |= (1 << BITS[name]);
    });
    Object.keys(padHeld).forEach(function (name) {
      if (BITS[name] !== undefined) m |= (1 << BITS[name]);
    });
    return m;
  }
  function onKeyDown(e) {
    if (waitingFor) return;
    if (!playing || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
    if (e.target && e.target.tagName === 'BUTTON' && (e.code === 'Enter' || e.code === 'Space')) return;
    var name = nameForCode(e.code);
    if (!name) return;
    e.preventDefault();
    if (!e.repeat) press(name);
  }
  function onKeyUp(e) {
    var name = nameForCode(e.code);
    if (name) release(name);
  }
  function releaseAll() { held = {}; }

  /* ---------- เสียง ---------- */
  function ensureAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ac = new AC();
      gain = ac.createGain();
      gain.gain.value = settings.volume;
      gain.connect(ac.destination);
      nextAt = 0;
    } catch (e) { ac = null; gain = null; }
  }
  function pushAudio(samples) {
    if (!ac || !gain || !samples || !samples.length) return;
    var frames = samples.length >> 1;
    if (!frames) return;
    var buf = ac.createBuffer(2, frames, NDS_CORE.AUDIO_RATE);
    var L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (var i = 0; i < frames; i++) {
      L[i] = samples[2 * i] / 32768;
      R[i] = samples[2 * i + 1] / 32768;
    }
    var now = ac.currentTime;
    if (nextAt < now) nextAt = now + 0.05;      /* เสียงขาด: เริ่มใหม่เล็กน้อย */
    if (nextAt - now > 0.25) return;            /* ค้างเกินไป: ทิ้งเพื่อให้ตอบสนองไว */
    var src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    src.start(nextAt);
    nextAt += buf.duration;
  }

  /* ---------- ภาพ: บันทึกหน้าจอเป็นรูป ---------- */
  function screenshot() {
    var c = $('screen');
    if (!c) return;
    c.toBlob(function (blob) {
      if (!blob) { io.toast('บันทึกรูปไม่ได้ค่ะ'); return; }
      var safe = (title || 'game').replace(/[^\w\u0E00-\u0E7F-]+/g, '_').slice(0, 40);
      var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      var name = 'NINO-DS-' + safe + '-' + stamp + '.png';
      if (NDS_NATIVE.inApp()) {
        if (!NDS_NATIVE.supported()) { io.toast('แอปรุ่นนี้ยังบันทึกรูปไม่ได้ค่ะ อัปเดตแอปก่อนนะคะ'); return; }
        NDS_NATIVE.save(name, 'image/png', blob).then(function (r) {
          io.toast(r.saved ? 'บันทึกรูปแล้วค่ะ' : 'ยังไม่ได้บันทึก: ' + r.why);
        });
        return;
      }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      io.toast('บันทึกรูปแล้วค่ะ');
    });
  }

  /* ---------- หน้าตั้งค่าและปุ่มต่างๆ ---------- */
  function supportRows() {
    var rows = [];
    var c = core || {};
    var items = [
      { k: 'setKeys', label: 'ส่งปุ่มให้แกน (setKeys)' },
      { k: 'audioBuffer', label: 'ส่งเสียงออก (audioBuffer)' },
      { k: 'reset', label: 'รีเซ็ตเครื่อง (reset)' },
      { k: 'status', label: 'ข้อมูลสถานะ (status)' },
      { k: 'setTouch', label: 'จอสัมผัส (setTouch)' },
      { k: 'saveData', label: 'บันทึกเซฟ (saveData)' },
      { k: 'loadSaveData', label: 'โหลดเซฟ (loadSaveData)' },
      { k: 'saveState', label: 'บันทึกสถานะ (saveState)' },
      { k: 'loadState', label: 'โหลดสถานะ (loadState)' }
    ];
    items.forEach(function (it) {
      var has = typeof c[it.k] === 'function';
      rows.push(it.label + ': ' + (has ? 'มี' : 'ยังไม่มี'));
    });
    return rows;
  }
  function renderBinds() {
    var box = $('np-binds');
    if (!box) return;
    box.innerHTML = '';
    Object.keys(DEFAULT_BINDS).forEach(function (name) {
      var row = el('div', 'np-bind-row');
      row.appendChild(el('span', '', (NAMES[name] || name) + ': '));
      var btn = el('button', 'np-btn', waitingFor === name ? 'กดปุ่มใหม่...' : (binds[name] || '-'));
      btn.type = 'button';
      btn.setAttribute('data-bind', name);
      btn.addEventListener('click', function () { waitingFor = name; renderBinds(); });
      row.appendChild(btn);
      box.appendChild(row);
    });
  }
  /* ตอนรอปุ่มใหม่: แป้นที่กดจะถูกผูกกับการกระทำนั้น (Escape ยกเลิก); ถ้าแป้นนั้นเคยผูกอยู่ จะถูกย้ายมา */
  function captureBind(e) {
    if (!waitingFor) return;
    e.preventDefault(); e.stopPropagation();
    if (e.code === 'Escape') { waitingFor = null; renderBinds(); return; }
    Object.keys(binds).forEach(function (k) { if (binds[k] === e.code) binds[k] = ''; });
    binds[waitingFor] = e.code;
    waitingFor = null;
    saveSettings(); renderBinds();
    io.toast('ตั้งปุ่มใหม่แล้วค่ะ');
  }
  function refreshSupport() {
    var box = $('np-support');
    if (!box) return;
    box.innerHTML = '';
    supportRows().forEach(function (t) { box.appendChild(el('li', '', t)); });
  }
  function build() {
    if (built) return;
    built = true;
    var host = $('play');
    if (!host) return;
    /* สไตล์ตัวเล่นทั้งหมดอยู่ในไฟล์ player.css ลิงก์ครั้งเดียวต่อหน้า */
    if (!document.querySelector('link[data-np-css]')) {
      var npCss = el('link'); npCss.rel = 'stylesheet'; npCss.href = 'player.css'; npCss.setAttribute('data-np-css', '');
      document.head.appendChild(npCss);
    }
    var tvFrame = document.querySelector('.frame');
    if (tvFrame && !tvFrame.classList.contains('np-tv')) {
      tvFrame.classList.add('np-tv');
      var tvKnobs = el('div', 'np-tv-knobs'); tvKnobs.setAttribute('aria-hidden', 'true');
      tvKnobs.appendChild(el('span', 'np-knob')); tvKnobs.appendChild(el('span', 'np-grill')); tvKnobs.appendChild(el('span', 'np-knob'));
      tvFrame.appendChild(tvKnobs);
    }

    var bar = el('div', 'np-bar');
    var pauseBtn = el('button', 'np-btn', 'หยุดชั่วคราว');
    pauseBtn.type = 'button'; pauseBtn.id = 'np-pause';
    pauseBtn.addEventListener('click', function () {
      paused = !paused;
      if (paused) flushSave();
      pauseBtn.textContent = paused ? 'เล่นต่อ' : 'หยุดชั่วคราว';
      pauseBtn.classList.toggle('np-on', paused);
      io.toast(paused ? 'พักเกมไว้แล้วค่ะ' : 'เล่นต่อเลยค่ะ');
    });
    var shotBtn = el('button', 'np-btn', 'ถ่ายรูป');
    shotBtn.type = 'button';
    shotBtn.addEventListener('click', screenshot);
    var setBtn = el('button', 'np-btn', 'ตั้งค่า');
    setBtn.type = 'button';
    var stSaveBtn = el('button', 'np-btn', 'บันทึกสถานะ');
    stSaveBtn.type = 'button'; stSaveBtn.id = 'np-state-save';
    stSaveBtn.addEventListener('click', function () {
      if (!core || typeof core.saveState !== 'function' || !curId) return;
      var bytes = core.saveState();
      if (!bytes || !bytes.length) { io.toast('แกนยังไม่ส่งสถานะออกมาค่ะ'); return; }
      io.put('state:' + curId, new Uint8Array(bytes)).then(function () { io.toast('บันทึกสถานะแล้วค่ะ'); })
        .catch(function () { io.toast('บันทึกสถานะไม่สำเร็จ'); });
    });
    var stLoadBtn = el('button', 'np-btn', 'โหลดสถานะ');
    stLoadBtn.type = 'button'; stLoadBtn.id = 'np-state-load';
    stLoadBtn.addEventListener('click', function () {
      if (!core || typeof core.loadState !== 'function' || !curId) return;
      io.get('state:' + curId).then(function (b) {
        if (!b) { io.toast('ยังไม่มีสถานะที่บันทึกไว้ค่ะ'); return; }
        core.loadState(new Uint8Array(b));
        io.toast('โหลดสถานะแล้วค่ะ');
      }).catch(function () { io.toast('โหลดสถานะไม่สำเร็จ'); });
    });
    bar.appendChild(stSaveBtn); bar.appendChild(stLoadBtn);
    var resetBtn = el('button', 'np-btn', 'รีเซ็ต');
    resetBtn.type = 'button'; resetBtn.id = 'np-reset';
    resetBtn.addEventListener('click', function () {
      if (core && typeof core.reset === 'function') {
        core.reset();
        io.toast('รีเซ็ตเครื่องแล้วค่ะ');
      } else {
        io.toast('แกนนี้ยังรีเซ็ตไม่ได้ค่ะ');
      }
    });
    bar.appendChild(pauseBtn); bar.appendChild(shotBtn); bar.appendChild(setBtn); bar.appendChild(resetBtn);

    /* เค้าโครงตาม DS: กากบาทซ้าย, ปุ่มหน้า X บน Y ซ้าย A ขวา B ล่าง, L/R มุมบน, Start/Select กลาง */
    var shoulder = el('div', 'np-shoulder');
    shoulder.appendChild(touchBtn('L', 'L')); shoulder.appendChild(touchBtn('R', 'R'));
    var console_ = el('div', 'np-console');
    console_.classList.add('np-kawaii');
    var controls = el('div', 'np-controls');
    var dpad = el('div', 'np-grid3'); dpad.id = 'np-dpad';
    var dcells = [null, touchBtn('UP', ARROW_UP), null, touchBtn('LEFT', ARROW_LEFT), null, touchBtn('RIGHT', ARROW_RIGHT), null, touchBtn('DOWN', ARROW_DOWN), null];
    dcells.forEach(function (c) { dpad.appendChild(c || el('div')); });
    var face = el('div', 'np-grid3'); face.id = 'np-face';
    var fcells = [null, touchBtn('X', 'X'), null, touchBtn('Y', 'Y'), null, touchBtn('A', 'A'), null, touchBtn('B', 'B'), null];
    fcells.forEach(function (c) { face.appendChild(c || el('div')); });
    controls.appendChild(dpad); controls.appendChild(face);
    var padLabel = el('div', 'np-label', 'จอยสติ๊ก'); padLabel.setAttribute('aria-hidden', 'true');
    console_.appendChild(padLabel);
    console_.appendChild(shoulder);
    console_.appendChild(controls);
    var mid = el('div', 'np-mid'); mid.id = 'np-mid';
    mid.appendChild(touchBtn('SELECT', 'SELECT')); mid.appendChild(touchBtn('START', 'START'));
    console_.appendChild(mid);
    host.appendChild(console_);
    host.appendChild(bar);

    var touchPad = el('div', 'np-touchpad');
    touchPad.id = 'np-touch';
    touchPad.setAttribute('aria-label', 'จอสัมผัสด้านล่าง');
    var tpHint = el('span', '', 'แตะจอล่างตรงนี้');
    touchPad.appendChild(tpHint);
    var tDown = function (e) { e.preventDefault(); touchDown = true; moveTouch(e); };
    var tMove = function (e) { if (touchDown) moveTouch(e); };
    var tUp = function () { touchDown = false; };
    touchPad.addEventListener('pointerdown', tDown);
    touchPad.addEventListener('pointermove', tMove);
    touchPad.addEventListener('pointerup', tUp);
    touchPad.addEventListener('pointercancel', tUp);
    touchPad.addEventListener('pointerleave', tUp);
    host.appendChild(touchPad);
    var set = el('div', 'np-set');
    set.id = 'np-set';
    set.hidden = true;
    var volLabel = el('label', '', 'เสียง');
    var vol = el('input'); vol.type = 'range'; vol.min = '0'; vol.max = '1'; vol.step = '0.05'; vol.id = 'np-volume';
    vol.setAttribute('aria-label', 'ระดับเสียง');
    vol.value = String(settings.volume);
    vol.addEventListener('input', function () {
      settings.volume = parseFloat(vol.value) || 0;
      applySettings(); saveSettings();
    });
    volLabel.appendChild(vol);
    set.appendChild(volLabel);
    var fpsLabel = el('label', '', 'แสดง FPS');
    var fpsBox = el('input'); fpsBox.type = 'checkbox'; fpsBox.id = 'np-fps';
    fpsBox.checked = settings.showFps;
    fpsBox.addEventListener('change', function () { settings.showFps = fpsBox.checked; applySettings(); saveSettings(); });
    fpsLabel.appendChild(fpsBox); set.appendChild(fpsLabel);
    var smLabel = el('label', '', 'ภาพนุ่มนวล (ไม่ทำให้พิกเซลเบลอ ปิดไว้ = คมชัดแบบพิกเซล)');
    var smBox = el('input'); smBox.type = 'checkbox'; smBox.id = 'np-smooth';
    smBox.checked = settings.smooth;
    smBox.addEventListener('change', function () { settings.smooth = smBox.checked; applySettings(); saveSettings(); });
    smLabel.appendChild(smBox); set.appendChild(smLabel);
    var help = el('div', 'np-help');
    help.appendChild(el('div', '', 'วิธีเล่น: ลูกศร = ทิศทาง, X = A, Z = B, S = X, A = Y, Enter = เริ่ม, Backspace = เลือก'));
    help.appendChild(el('div', '', 'จอยเกมมาตรฐานใช้ได้ทันที และแตะจอล่างเพื่อสัมผัสได้เลย'));
    help.appendChild(el('div', '', 'เซฟจะถูกบันทึกอัตโนมัติ เมื่อแกนรองรับการบันทึกเซฟ'));
    help.appendChild(el('div', '', 'BIOS ทดแทนฟรี: FreeBIOS (BSD-2) เขียนโดย Gilead Kutnick ลิขสิทธิ์ 2013'));
    set.appendChild(help);
    set.appendChild(el('div', '', 'ปุ่มคีย์บอร์ด (กดปุ่มที่ต้องการเปลี่ยน)'));
    var bindBox = el('div', 'np-binds'); bindBox.id = 'np-binds';
    set.appendChild(bindBox);
    var resetBinds = el('button', 'np-btn', 'คืนค่าปุ่มเดิม');
    resetBinds.type = 'button'; resetBinds.id = 'np-binds-reset';
    resetBinds.addEventListener('click', function () {
      binds = copyBinds(DEFAULT_BINDS); waitingFor = null; saveSettings(); renderBinds();
      io.toast('คืนค่าปุ่มเดิมแล้วค่ะ');
    });
    set.appendChild(resetBinds);
    set.appendChild(el('div', '', 'ระบบรองรับของแกนนี้'));
    var list = el('ul'); list.id = 'np-support';
    set.appendChild(list);
    host.appendChild(set);
    setBtn.addEventListener('click', function () {
      set.hidden = !set.hidden;
      refreshSupport();
    });

    /* ปุ่มคีย์บอร์ดและปุ่มสัมผัส */
    document.addEventListener('keydown', captureBind, true);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    applySettings();
  }
  /* ลูกศรทิศทาง (SVG คงที่ ไม่รับข้อความจากภายนอก) */
  var ARROW_UP = '<svg viewBox="0 0 8 8" width="14" height="14" aria-hidden="true"><path d="M4 1L7 6H1Z" fill="currentColor"/></svg>';
  var ARROW_DOWN = '<svg viewBox="0 0 8 8" width="14" height="14" aria-hidden="true"><path d="M4 7L1 2H7Z" fill="currentColor"/></svg>';
  var ARROW_LEFT = '<svg viewBox="0 0 8 8" width="14" height="14" aria-hidden="true"><path d="M1 4L6 1V7Z" fill="currentColor"/></svg>';
  var ARROW_RIGHT = '<svg viewBox="0 0 8 8" width="14" height="14" aria-hidden="true"><path d="M7 4L2 7V1Z" fill="currentColor"/></svg>';
  function touchBtn(name, label) {
    var b = el('button', 'np-btn');
    if (label.charAt(0) === '<') b.innerHTML = label; else b.textContent = label;
    b.type = 'button';
    b.setAttribute('data-key', name);
    b.setAttribute('aria-label', NAMES[name] || name);
    /* pointerup และ pointerleave มักเกิดคู่กัน: ปล่อยเพียงครั้งเดียว ไม่ให้ไปหักการกดของคีย์บอร์ด */
    var isDown = false;
    var down = function (e) { e.preventDefault(); if (isDown) return; isDown = true; b.classList.add('np-on'); press(name); };
    var up = function () { if (!isDown) return; isDown = false; b.classList.remove('np-on'); release(name); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    return b;
  }

  /* ---------- วงจรชีวิต ---------- */
  function init(opts) {
    io.get = opts.get; io.put = opts.put; io.toast = opts.toast || io.toast;
    return loadSettings();
  }
  function start(theCore, theTitle, romId) {
    core = theCore;
    title = theTitle || '';
    curId = romId || null;
    romKey = romId ? 'save:' + romId : null;
    lastSum = -1;
    touchDown = false; touchX = 0; touchY = 0;
    ready = true;
    if (core && typeof core.loadSaveData === 'function' && romKey && io.get) {
      ready = false;
      io.get(romKey).then(function (bytes) {
        if (bytes && bytes.length) core.loadSaveData(new Uint8Array(bytes));
        ready = true;
      }).catch(function () { ready = true; });
    }
    clearInterval(saveTimer);
    saveTimer = setInterval(flushSave, 10000);
    build();
    refreshSupport();
    renderBinds();
    playing = true;
    paused = false;
    releaseAll();
    var pb = $('np-pause');
    if (pb) { pb.textContent = 'หยุดชั่วคราว'; pb.classList.remove('np-on'); }
    var canState = !!(core && curId);
    var s1 = $('np-state-save'), s2 = $('np-state-load');
    if (s1) { s1.disabled = !(canState && typeof core.saveState === 'function'); s1.title = s1.disabled ? 'แกนนี้ยังไม่รองรับการบันทึกสถานะ' : ''; }
    if (s2) { s2.disabled = !(canState && typeof core.loadState === 'function'); s2.title = s2.disabled ? 'แกนนี้ยังไม่รองรับการโหลดสถานะ' : ''; }
    ensureAudio();
    applySettings();
  }
  function stop() {
    playing = false;
    releaseAll();
    clearInterval(saveTimer); saveTimer = 0;
    flushSave();
    touchDown = false;
    if (ac && ac.state === 'running') ac.suspend();
    if (typeof core === 'object' && core && typeof core.setKeys === 'function') core.setKeys(0);
  }
  function sumOf(bytes) {
    var h = 2166136261 >>> 0;                       /* FNV-1a 32 บิต */
    for (var i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619) >>> 0; }
    return h ^ bytes.length;
  }
  function flushSave() {
    if (!core || !romKey || !ready || typeof core.saveData !== 'function' || !io.put) return Promise.resolve(false);
    var bytes = core.saveData();
    if (!bytes || !bytes.length) return Promise.resolve(false);
    var sum = sumOf(bytes);
    if (sum === lastSum) return Promise.resolve(false);
    lastSum = sum;
    return io.put(romKey, new Uint8Array(bytes)).then(function () { return true; }).catch(function () { lastSum = -1; return false; });
  }
  function moveTouch(e) {
    var pad = $('np-touch');
    if (!pad) return;
    var r = pad.getBoundingClientRect();
    var x = Math.round((e.clientX - r.left) / r.width * 255);
    var y = Math.round((e.clientY - r.top) / r.height * 191);
    touchX = Math.max(0, Math.min(255, x));
    touchY = Math.max(0, Math.min(191, y));
  }
  /* เรียกก่อน runFrame: ส่งสถานะปุ่มให้แกน */
  function beforeFrame() {
    pollGamepads();
    if (!core) return;
    if (typeof core.setKeys === 'function') core.setKeys(mask());
    if (typeof core.setTouch === 'function') core.setTouch(touchDown ? touchX : 0, touchDown ? touchY : 0, touchDown);
  }
  /* เรียกหลัง runFrame: ส่งเสียงของเฟรมนี้ */
  function afterFrame() {
    if (core && typeof core.audioBuffer === 'function') {
      audioCalls++;
      pushAudio(core.audioBuffer());
    }
  }
  return {
    init: init, start: start, stop: stop,
    beforeFrame: beforeFrame, afterFrame: afterFrame,
    isPaused: function () { return paused; },
    status: function () { return !playing ? 'stopped' : paused ? 'paused' : !ready ? 'loading' : 'running'; },
    flushSave: flushSave,
    isPlaying: function () { return playing; },
    audioState: function () { return ac ? ac.state : 'none'; },
    audioCalls: function () { return audioCalls; },
    mask: mask,
    settings: function () { return { volume: settings.volume, showFps: settings.showFps, smooth: settings.smooth }; },
    BITS: BITS
  };
})();
