/* NINO · โหมดหน้าจอ (ปุ่มรูปจอ) และความกว้างบับเบิลแชทบอท (ปุ่มรูปเครื่องมือ)
 *
 * โหมดหน้าจอวนได้ 4 รอบ ทุกรอบเป็นคลาสบน <html> เท่านั้น:
 *   0 มือถือ (ปกติ)           ไม่มีคลาส
 *   1 เต็มจอมือถือ           ui-full: ซ่อนส่วนบน (หัวแอป/แถบแท็บ) เริ่มจากชื่อตัวละคร
 *   2 จำลองเดสก์ท็อป          ui-desk: ขยายความกว้างหน้าจอเป็นแบบเดสก์ท็อป เลื่อนแนวนอนได้
 *   3 เต็มจอเดสก์ท็อป         ui-desk + ui-full
 * กดรอบที่ 4 (กลับมา 0) แล้วลบค่าที่บันทึกไว้ จึงเหมือนไม่เคยกดเลย
 *
 * ความกว้างบับเบิล: ปกติ / กว้าง (คลาส bub-wide บน <html>) มีผลกับบับเบิลบอทเท่านั้น
 */
(function () {
  'use strict';
  var KEY_MODE = 'nino.uimode', KEY_BUB = 'nino.bubble';
  var MODES = [
    { cls: [], label: 'มือถือ (ปกติ)' },
    { cls: ['ui-full'], label: 'เต็มจอมือถือ' },
    { cls: ['ui-desk'], label: 'จำลองเดสก์ท็อป' },
    { cls: ['ui-desk', 'ui-full'], label: 'เต็มจอเดสก์ท็อป' }
  ];
  var BUB_LABEL = ['ปกติ', 'กว้าง'];
  var mode = 0, bub = 0;

  function getItem(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function setOrClear(k, v) {
    try { if (v) localStorage.setItem(k, String(v)); else localStorage.removeItem(k); } catch (e) { /* ไม่มีที่เก็บ ก็ใช้ค่าในหน่วยความจำ */ }
  }
  function clampTo(v, n) { v = parseInt(v, 10); return v >= 0 && v < n ? v : 0; }

  function paintMode() {
    var root = document.documentElement;
    root.classList.remove('ui-full', 'ui-desk');
    MODES[mode].cls.forEach(function (c) { root.classList.add(c); });
    var b = document.getElementById('btn-uimode');
    if (b) {
      b.title = 'โหมดหน้าจอ: ' + MODES[mode].label + ' (กดเพื่อเปลี่ยน)';
      b.setAttribute('aria-label', 'โหมดหน้าจอ: ' + MODES[mode].label);
      b.classList.toggle('on', mode > 0);
    }
  }

  function paintBub() {
    document.documentElement.classList.toggle('bub-wide', bub === 1);
    var b = document.getElementById('btn-bubble');
    if (b) {
      b.title = 'ความกว้างบับเบิลแชท: ' + BUB_LABEL[bub] + ' (กดเพื่อสลับ)';
      b.setAttribute('aria-label', 'ความกว้างบับเบิลแชท: ' + BUB_LABEL[bub]);
      b.classList.toggle('on', bub === 1);
    }
  }

  function cycleMode() {
    mode = (mode + 1) % MODES.length;
    setOrClear(KEY_MODE, mode);
    paintMode();
  }

  function toggleBub() {
    bub = bub ? 0 : 1;
    setOrClear(KEY_BUB, bub);
    paintBub();
  }

  function init() {
    mode = clampTo(getItem(KEY_MODE), MODES.length);
    bub = clampTo(getItem(KEY_BUB), BUB_LABEL.length);
    paintMode();
    paintBub();
    var a = document.getElementById('btn-uimode'), c = document.getElementById('btn-bubble');
    if (a) a.addEventListener('click', cycleMode);
    if (c) c.addEventListener('click', toggleBub);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.ninoChatLayout = {
    mode: function () { return mode; },
    bubble: function () { return bub; },
    cycleMode: cycleMode,
    toggleBub: toggleBub,
    labels: function () { return MODES.map(function (m) { return m.label; }); }
  };
})();
