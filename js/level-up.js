/* NINO | ลำดับการรีบูตและป็อปอัพเลเวลอัป
 * - ota.reboot() เรียก ninoLevelUp.begin(why) ก่อนโหลดหน้าใหม่: ขึ้นจอ "กำลังอัปเกรด" ให้เห็นขั้นตอน
 * - หลังโหลดใหม่ ถ้ามีเครื่องหมาย nino.ota.rebooted (ไม่เกิน 10 นาที) จะต่อจอรีบูต แล้วแสดง LEVEL UP
 *   เลเวลนับจากจำนวนครั้งที่อัปเกรดสำเร็จ (เก็บใน nino.level) การถอยกลับไม่นับเป็นเลเวล
 * - ถ้าผู้ใช้ตั้งค่า "ลดการเคลื่อนไหว" ไว้ จะไม่มีอนิเมชัน แสดงข้อความแทน
 */
(function () {
  'use strict';
  var KEY_MARK = 'nino.ota.rebooted';
  var KEY_LV = 'nino.level';
  var MAX_AGE = 10 * 60 * 1000;
  var CSS_ID = 'nino-lvl-css';
  var OV_ID = 'nino-lvl';

  function getS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function setS(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ใช้ค่าเริ่มต้น */ } }
  function delS(k) { try { localStorage.removeItem(k); } catch (e) { /* ไม่เป็นไร */ } }
  function reduced() {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function readLevel() {
    try { var v = JSON.parse(getS(KEY_LV) || 'null'); if (v && v.upgrades >= 0) return v; } catch (e) { /* ค่าเสีย ใช้ค่าเริ่มต้น */ }
    return { upgrades: 0 };
  }
  function levelOf(upgrades) { return 1 + upgrades; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var CSS = [
    '#' + OV_ID + '{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;',
    'background:radial-gradient(ellipse at center,rgba(40,20,70,.92) 0%,rgba(4,6,16,.96) 70%);color:#fff;',
    'font-family:system-ui,"Noto Sans Thai",sans-serif;opacity:0;transition:opacity .35s ease;overflow:hidden}',
    '#' + OV_ID + '.on{opacity:1}',
    '#' + OV_ID + ' .lv-box{position:relative;text-align:center;width:min(92vw,420px);padding:24px 16px}',
    '#' + OV_ID + ' .lv-ring{position:relative;width:150px;height:150px;margin:0 auto 14px}',
    '#' + OV_ID + ' .lv-ring i{position:absolute;inset:0;border-radius:50%;border:3px solid transparent;',
    'border-top-color:#ffd166;border-right-color:#7cf2ff;animation:lv-spin 1.6s linear infinite}',
    '#' + OV_ID + ' .lv-ring i:nth-child(2){inset:14px;border-top-color:#ff7ad9;border-left-color:#ffd166;animation-duration:2.4s;animation-direction:reverse}',
    '#' + OV_ID + ' .lv-ring i:nth-child(3){inset:30px;border-top-color:#7cf2ff;animation-duration:1.1s}',
    '#' + OV_ID + ' .lv-core{position:absolute;inset:50px;border-radius:50%;background:radial-gradient(circle,#fff 0%,#ffd166 40%,transparent 70%);',
    'box-shadow:0 0 30px #ffd166;animation:lv-pulse 1.2s ease-in-out infinite}',
    '#' + OV_ID + ' .lv-stage{font-size:15px;color:#cfd8ff;min-height:22px;margin:8px 0 10px}',
    '#' + OV_ID + ' .lv-title{font-size:38px;font-weight:900;letter-spacing:2px;opacity:0;transform:scale(.4);',
    'text-shadow:0 0 18px #ffd166,0 0 40px #ff7ad9;background:linear-gradient(90deg,#ffd166,#fff,#7cf2ff);-webkit-background-clip:text;color:transparent}',
    '#' + OV_ID + ' .lv-num{font-size:20px;margin:6px 0 12px;opacity:0;color:#ffd166}',
    '#' + OV_ID + ' .lv-num b{font-size:34px}',
    '#' + OV_ID + ' .lv-bar{height:10px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden;opacity:0;margin:0 auto 10px;max-width:320px}',
    '#' + OV_ID + ' .lv-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#7cf2ff,#ffd166,#ff7ad9);transition:width 1.1s ease}',
    '#' + OV_ID + ' .lv-info{font-size:13px;color:#aab4e0;opacity:0;min-height:18px;line-height:1.5}',
    '#' + OV_ID + ' .lv-btn{margin-top:18px;opacity:0;padding:10px 26px;border-radius:999px;border:0;font-size:15px;font-weight:700;',
    'background:linear-gradient(90deg,#ffd166,#ff9ad5);color:#1a1030;cursor:pointer;box-shadow:0 0 18px rgba(255,209,102,.55)}',
    '#' + OV_ID + ' .lv-p{position:absolute;width:6px;height:6px;border-radius:50%;background:#ffd166;',
    'left:50%;top:50%;opacity:0;animation:lv-burst 1.8s ease-out forwards}',
    '#' + OV_ID + '.celebrate .lv-title{animation:lv-pop .7s .15s cubic-bezier(.2,1.4,.4,1) forwards}',
    '#' + OV_ID + '.celebrate .lv-num{animation:lv-fade .5s .9s forwards}',
    '#' + OV_ID + '.celebrate .lv-bar{animation:lv-fade .4s 1.2s forwards}',
    '#' + OV_ID + '.celebrate .lv-info{animation:lv-fade .5s 1.6s forwards}',
    '#' + OV_ID + '.celebrate .lv-btn{animation:lv-fade .5s 2s forwards}',
    '@keyframes lv-spin{to{transform:rotate(360deg)}}',
    '@keyframes lv-pulse{50%{transform:scale(1.25);opacity:.7}}',
    '@keyframes lv-pop{60%{opacity:1;transform:scale(1.15)}to{opacity:1;transform:scale(1)}}',
    '@keyframes lv-fade{to{opacity:1}}',
    '@keyframes lv-burst{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--x),var(--y)) scale(.3)}}',
    '@media (prefers-reduced-motion: reduce){#' + OV_ID + ' *{animation:none!important;transition:none!important}',
    '#' + OV_ID + ' .lv-title,#' + OV_ID + ' .lv-num,#' + OV_ID + ' .lv-bar,#' + OV_ID + ' .lv-info,#' + OV_ID + ' .lv-btn{opacity:1;transform:none}}'
  ].join('');

  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement('style');
    st.id = CSS_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function ensureOverlay() {
    var ov = document.getElementById(OV_ID);
    if (ov) return ov;
    injectCss();
    ov = document.createElement('div');
    ov.id = OV_ID;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-live', 'polite');
    ov.innerHTML = '<div class="lv-box">' +
      '<div class="lv-ring"><i></i><i></i><i></i><div class="lv-core"></div></div>' +
      '<div class="lv-stage"></div>' +
      '<div class="lv-title">LEVEL UP!</div>' +
      '<div class="lv-num">เลเวล <b class="lv-n">1</b></div>' +
      '<div class="lv-bar"><i></i></div>' +
      '<div class="lv-info"></div>' +
      '<button class="lv-btn" type="button">ไปต่อ</button>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector('.lv-btn').addEventListener('click', hide);
    return ov;
  }

  function stage(text, pct) {
    var ov = ensureOverlay();
    ov.querySelector('.lv-stage').textContent = text;
    var bar = ov.querySelector('.lv-bar i');
    if (typeof pct === 'number') { bar.parentNode.style.opacity = '1'; bar.style.width = Math.max(0, Math.min(100, pct)) + '%'; }
    return ov;
  }

  function show() {
    var ov = ensureOverlay();
    requestAnimationFrame(function () { ov.classList.add('on'); });
    return ov;
  }

  function hide() {
    var ov = document.getElementById(OV_ID);
    if (!ov) return;
    ov.classList.remove('on');
    setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 400);
  }

  function burst(ov) {
    if (reduced()) return;
    var box = ov.querySelector('.lv-box');
    for (var i = 0; i < 40; i++) {
      var p = document.createElement('span');
      p.className = 'lv-p';
      var a = Math.random() * Math.PI * 2;
      var d = 120 + Math.random() * 180;
      p.style.setProperty('--x', Math.round(Math.cos(a) * d) + 'px');
      p.style.setProperty('--y', Math.round(Math.sin(a) * d) + 'px');
      p.style.animationDelay = (Math.random() * 0.25).toFixed(2) + 's';
      p.style.background = ['#ffd166', '#7cf2ff', '#ff7ad9', '#ffffff'][i % 4];
      box.appendChild(p);
    }
  }

  function countUp(ov, to) {
    var el = ov.querySelector('.lv-n');
    if (reduced()) { el.textContent = String(to); return; }
    var start = Date.now();
    var t = setInterval(function () {
      var k = Math.min(1, (Date.now() - start) / 900);
      el.textContent = String(Math.max(1, Math.round(to * k)));
      if (k >= 1) clearInterval(t);
    }, 40);
  }

  // เรียกจาก ota.reboot ก่อนโหลดหน้าใหม่
  function begin(why) {
    var ov = show();
    ov.classList.remove('celebrate');
    stage('กำลังบันทึกความคืบหน้า…', 15);
    var steps = [[500, 'กำลังติดตั้งเวอร์ชันใหม่…', 50], [900, 'เตรียมเปิดแอป…', 85]];
    return sleep(300).then(function () {
      return steps.reduce(function (p, s) {
        return p.then(function () { return sleep(s[0]).then(function () { stage(s[1], s[2]); }); });
      }, Promise.resolve());
    }).then(function () {
      stage('รีสตาร์ตแอป' + (why ? ' · ' + String(why).slice(0, 60) : '') + '…', 95);
    });
  }

  // หลังโหลดใหม่: ต่อจอรีบูต แล้วแสดง LEVEL UP ถ้าอัปเกรดสำเร็จ
  function celebrate(mark) {
    var why = String(mark.why || '');
    var rolledBack = why.indexOf('back to') === 0;
    var ov = show();
    ov.classList.remove('celebrate');
    stage('กำลังเปิดเวอร์ชันใหม่…', 60);
    var waited = 0;
    function ready() {
      var ok = document.readyState === 'complete' && (window.ninoObs || waited >= 2500);
      if (!ok && waited < 6000) { waited += 150; return sleep(150).then(ready); }
      return null;
    }
    return ready().then(function () {
      return sleep(600);
    }).then(function () {
      if (rolledBack) {
        stage('ถอยกลับเวอร์ชันแล้ว', 100);
        ov.querySelector('.lv-title').textContent = 'ถอยกลับแล้ว';
        ov.querySelector('.lv-num').style.display = 'none';
        ov.querySelector('.lv-info').textContent = why;
        ov.classList.add('celebrate');
        return;
      }
      if (why.indexOf('use ') === 0) {
        // สลับไปใช้เวอร์ชันที่ติดตั้งไว้แล้ว ไม่นับเป็นการอัปเกรด
        stage('เปลี่ยนเวอร์ชันสำเร็จ', 100);
        ov.querySelector('.lv-title').textContent = 'สลับเวอร์ชันแล้ว';
        ov.querySelector('.lv-num').style.display = 'none';
        ov.querySelector('.lv-info').textContent = why.slice(0, 80);
        ov.classList.add('celebrate');
        return;
      }
      var prev = readLevel();
      var next = { upgrades: (prev.upgrades || 0) + 1 };
      setS(KEY_LV, JSON.stringify(next));
      ov.querySelector('.lv-title').textContent = 'LEVEL UP!';
      ov.querySelector('.lv-num').style.display = '';
      stage('อัปเกรดสำเร็จ', 100);
      ov.querySelector('.lv-info').textContent = 'จากเวอร์ชัน ' + String(mark.from || '?') + (why ? ' · ' + why.slice(0, 80) : '');
      ov.classList.add('celebrate');
      burst(ov);
      countUp(ov, levelOf(next.upgrades));
    });
  }

  function boot() {
    var raw = getS(KEY_MARK);
    if (!raw) return;
    delS(KEY_MARK); // แสดงครั้งเดียว
    var mark;
    try { mark = JSON.parse(raw); } catch (e) { return; }
    if (!mark || typeof mark.t !== 'number' || Date.now() - mark.t > MAX_AGE) return;
    celebrate(mark);
  }

  window.ninoLevelUp = {
    begin: begin,
    celebrate: celebrate,
    hide: hide,
    level: function () { var u = readLevel().upgrades || 0; return { level: levelOf(u), upgrades: u }; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
