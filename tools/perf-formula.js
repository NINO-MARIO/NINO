// สูตรเปรียบเทียบประสิทธิภาพ (ไม่มี DOM ไม่มีเครือข่าย ใช้ได้กับ Node และเบราว์เซอร์)
//   ค่ากลาง    median(xs)      = ค่ากลางของชุดตัวเลข (ค่าคู่ = เฉลี่ยสองค่ากลาง)
//   ความกระจาย  spread(xs)     = (มากสุด − น้อยสุด) ÷ median
//   ผลเทียบ    verdict(...)    ตามลำดับ:
//     1. ไม่มีค่าพื้นฐาน            → 'nobase' (ไม่ตัดสิน)
//     2. ความกระจายของรอบปัจจุบัน > noiseMax → 'noisy' (ไม่น่าเชื่อถือ ไม่ตัดสิน)
//     3. ผลต่าง = ปัจจุบัน − พื้นฐาน, อัตรา = ผลต่าง ÷ พื้นฐาน
//        ถ้า ผลต่าง > floor และ อัตรา > tol → 'regress' (ช้าลงเกินเกณฑ์)
//        อื่นๆ                              → 'ok'
// ค่าเริ่มต้น: tol = 0.20 (20%), floor = ค่าตามหน่วยของตัวชี้วัด, noiseMax = 0.5 (50%)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ninoPerfFormula = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  function median(xs) {
    const a = xs.map(Number).filter(Number.isFinite).sort((p, q) => p - q);
    if (!a.length) return NaN;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function spread(xs) {
    const a = xs.map(Number).filter(Number.isFinite);
    if (!a.length) return NaN;
    const md = median(a);
    return md > 0 ? (Math.max(...a) - Math.min(...a)) / md : 0;
  }
  function verdict(o) {
    const tol = o.tol == null ? 0.20 : o.tol;
    const floor = o.floor == null ? 0 : o.floor;
    const noiseMax = o.noiseMax == null ? 0.5 : o.noiseMax;
    if (!Number.isFinite(o.base) || o.base <= 0) return { status: 'nobase', delta: NaN, ratio: NaN };
    if (spread(o.runs || []) > noiseMax) return { status: 'noisy', delta: NaN, ratio: NaN };
    const delta = o.cur - o.base, ratio = delta / o.base;
    const status = (delta > floor && ratio > tol) ? 'regress' : 'ok';
    return { status, delta, ratio };
  }
  return { median, spread, verdict };
});
