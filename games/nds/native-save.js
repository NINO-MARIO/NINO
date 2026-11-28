/* บันทึกไฟล์จากห้อง NDS ลงเครื่องเมื่ออยู่ในแอป: ใช้คำสั่ง saveFile ของ bridge 4 (ตัวเลือกไฟล์ของระบบ)
   ห้องนี้เป็น iframe ของหน้าหลัก: ข้อความของ bridge ต้องส่งจากเฟรมหลัก จึงเรียก ninoNative ของ parent
   ถ้าแอปรุ่นเก่า (bridge < 4) หรือเบราว์เซอร์ทั่วไป จะไม่ใช้ทางนี้ */
var NDS_NATIVE = (function () {
  var MAX = 16 * 1024 * 1024;
  function of() {
    if (window.ninoNative && typeof window.ninoNative.call === 'function') return window.ninoNative;
    try {
      var p = window.parent;
      if (p && p !== window && p.ninoNative && typeof p.ninoNative.call === 'function') return p.ninoNative;
    } catch (e) { /* ต่างโดเมน: ไม่ใช่แอป */ }
    return null;
  }
  function inApp() { return !!of(); }
  function supported() { var n = of(); return !!(n && Number(n.bridge) >= 4); }
  function b64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { var s = String(fr.result), i = s.indexOf(','); res(i < 0 ? '' : s.slice(i + 1)); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
  }
  /* คืน null ถ้าไม่รองรับ (ให้ผู้เรียกตัดสินใจเอง), ไม่งั้นคืน Promise<{saved, why}> */
  function save(name, mime, blob) {
    var n = of();
    if (!n || !(Number(n.bridge) >= 4)) return null;
    if (blob.size > MAX) return Promise.resolve({ saved: false, why: 'ไฟล์ใหญ่เกินไปสำหรับบันทึกในแอป' });
    return b64(blob).then(function (data) {
      return n.call('saveFile', { name: name, mime: mime, data: data });
    }).then(function (r) {
      return r && r.saved ? { saved: true } : { saved: false, why: (r && r.error) || 'ไม่ได้บันทึก' };
    });
  }
  return { MAX: MAX, inApp: inApp, supported: supported, save: save };
})();
