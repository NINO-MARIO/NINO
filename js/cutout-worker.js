/* NINO cutout worker: รัน GrabCut นอกหน้าหลัก เพื่อไม่ให้หน้าจอค้างระหว่างตัดรูป */
importScripts('./cutout-core.js');
self.onmessage = function (e) {
  const m = e.data || {};
  try {
    const C = self.NINOCutout;
    const mask = C.grabCut({
      width: m.w,
      height: m.h,
      rgba: new Uint8Array(m.rgba),
      rect: m.rect || null,
      fgMarks: m.fg ? new Uint8Array(m.fg) : null,
      bgMarks: m.bg ? new Uint8Array(m.bg) : null,
      iters: 8,
      seed: 1
    });
    const kept = C.fillSmallHoles(C.keepLargest(mask, m.w, m.h, 0.02, m.fg ? new Uint8Array(m.fg) : null), m.w, m.h, 0.005);
    self.postMessage({ id: m.id, w: m.w, h: m.h, mask: kept.buffer }, [kept.buffer]);
  } catch (err) {
    self.postMessage({ id: m.id, error: String(err && err.message || err) });
  }
};
