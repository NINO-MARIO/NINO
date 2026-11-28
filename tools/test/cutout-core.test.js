// ทดสอบแกน GrabCut (js/cutout-core.js) ด้วยภาพสังเคราะห์ที่รู้คำตอบ: วัดความทับซ้อน IoU กับวัตถุจริง
// รัน: node tools/test/cutout-core.test.js
const path = require('path');
const C = require(path.join(__dirname, '..', '..', 'js', 'cutout-core.js'));
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }

// สร้างภาพ W×H ที่มีวงกลมสีอยู่กลางภาพบนพื้นหลังที่กำหนด คืนภาพ RGBA และความจริงของวัตถุ
function scene(W, H, bg, fg, radius, seed) {
  const r = C.rng(seed);
  const rgba = new Uint8ClampedArray(W * H * 4), truth = new Uint8Array(W * H);
  const cx = W / 2, cy = H / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const inside = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius * radius;
    const c = inside ? fg : bg(x, y);
    const n = () => (r() - 0.5) * 24;
    rgba[i * 4] = clamp(c[0] + n()); rgba[i * 4 + 1] = clamp(c[1] + n()); rgba[i * 4 + 2] = clamp(c[2] + n()); rgba[i * 4 + 3] = 255;
    truth[i] = inside ? 1 : 0;
  }
  return { rgba, truth };
}
function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function iou(a, b) {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) inter++; if (a[i] || b[i]) uni++; }
  return uni ? inter / uni : 0;
}

(async () => {
  console.log('== GrabCut แกน (ภาพสังเคราะห์)');
  const W = 160, H = 120, R = 34;
  const blue = () => [40, 90, 200];
  const grad = (x, y) => [200 - x * 0.6, 120 + y * 0.4, 60];

  // 1) พื้นหลังสีเดียว มีกรอบรอบวัตถุ
  {
    const s = scene(W, H, blue, [220, 40, 40], R, 3);
    const rect = { x: W / 2 - R - 10, y: H / 2 - R - 10, w: 2 * R + 20, h: 2 * R + 20 };
    const t0 = Date.now();
    const mask = C.grabCut({ width: W, height: H, rgba: s.rgba, rect, iters: 3, seed: 7 });
    const score = iou(mask, s.truth);
    ok(score >= 0.9, 'solid background with a box: IoU ' + score.toFixed(3));
    console.log('  (ฉาก 1 IoU ' + score.toFixed(3) + ' ใช้เวลา ' + (Date.now() - t0) + ' ms)');
  }
  // 2) พื้นหลังไล่สี
  {
    const s = scene(W, H, grad, [30, 200, 90], R, 5);
    const rect = { x: W / 2 - R - 12, y: H / 2 - R - 12, w: 2 * R + 24, h: 2 * R + 24 };
    const mask = C.grabCut({ width: W, height: H, rgba: s.rgba, rect, iters: 3, seed: 9 });
    const score = iou(mask, s.truth);
    ok(score >= 0.85, 'gradient background with a box: IoU ' + score.toFixed(3));
    console.log('  (ฉาก 2 IoU ' + score.toFixed(3) + ')');
  }
  // 3) ไม่มีกรอบ ใช้จุดที่ผู้ใช้แตะเท่านั้น
  {
    const s = scene(W, H, blue, [220, 40, 40], R, 11);
    const fg = new Uint8Array(W * H), bg = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x + 0.5 - W / 2, y + 0.5 - H / 2);
      if (d < 8) fg[y * W + x] = 1;
      if (x < 6 || x >= W - 6 || y < 6 || y >= H - 6) bg[y * W + x] = 1;
    }
    const mask = C.grabCut({ width: W, height: H, rgba: s.rgba, rect: null, fgMarks: fg, bgMarks: bg, iters: 3, seed: 13 });
    const score = iou(mask, s.truth);
    ok(score >= 0.85, 'brush marks only: IoU ' + score.toFixed(3));
    console.log('  (ฉาก 3 IoU ' + score.toFixed(3) + ')');
  }
  // 3b) สีวัตถุใกล้พื้นหลังมาก และรูปดาวไม่กลม
  {
    const r = C.rng(5);
    const lowC = scene(W, H, () => [104, 100, 100], [120, 104, 96], R, 3);
    const rect = { x: W / 2 - R - 6, y: H / 2 - R - 6, w: 2 * R + 12, h: 2 * R + 12 };
    const m1 = C.grabCut({ width: W, height: H, rgba: lowC.rgba, rect, iters: 3, seed: 1 });
    ok(iou(m1, lowC.truth) >= 0.9, 'low-contrast object: IoU ' + iou(m1, lowC.truth).toFixed(3));
    const star = new Uint8ClampedArray(W * H * 4), starT = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, dx = (x + 0.5 - W / 2) / 34, dy = (y + 0.5 - H / 2) / 34;
      const inside = Math.hypot(dx, dy) <= 1 + 0.35 * Math.cos(5 * Math.atan2(dy, dx));
      const c = inside ? [200, 60, 60] : [60, 110, 200];
      for (let k = 0; k < 3; k++) star[i * 4 + k] = clamp(c[k] + (r() - 0.5) * 20);
      star[i * 4 + 3] = 255; starT[i] = inside ? 1 : 0;
    }
    const m2 = C.grabCut({ width: W, height: H, rgba: star, rect: { x: 40, y: 20, w: 80, h: 80 }, iters: 3, seed: 1 });
    ok(iou(m2, starT) >= 0.9, 'star-shaped object: IoU ' + iou(m2, starT).toFixed(3));
  }
  // 4) กำหนดผลได้: อินพุตเดิม ผลเดิมทุกบิต
  {
    const s = scene(W, H, blue, [220, 40, 40], R, 3);
    const rect = { x: W / 2 - R - 10, y: H / 2 - R - 10, w: 2 * R + 20, h: 2 * R + 20 };
    const a = C.grabCut({ width: W, height: H, rgba: s.rgba, rect, seed: 7 });
    const b = C.grabCut({ width: W, height: H, rgba: s.rgba, rect, seed: 7 });
    ok(a.every((v, i) => v === b[i]), 'same input gives the same mask');
  }
  // 5) กรอบคลุมทั้งภาพ ยังต้องทำงานได้ (ขอบรูปเป็นพื้นหลังแทน)
  {
    const s = scene(W, H, blue, [220, 40, 40], R, 3);
    let threw = false, mask = null;
    try { mask = C.grabCut({ width: W, height: H, rgba: s.rgba, rect: { x: 0, y: 0, w: W, h: H }, seed: 1 }); } catch (e) { threw = true; }
    ok(!threw && mask && mask.length === W * H, 'full-frame box does not crash');
  }
  // 6) อินพุตผิดต้องแจ้ง error ไทยไม่ค้าง
  {
    let msg = '';
    try { C.grabCut({ width: 10, height: 10, rgba: new Uint8Array(400), rect: null }); } catch (e) { msg = e.message; }
    ok(msg.indexOf('ต้องมี') >= 0, 'no box and no marks reports a Thai error: ' + msg);
  }
  // 7) keepLargest เก็บเฉพาะชิ้นใหญ่ และ upscaleAlpha ขยายขนาดได้ถูกต้อง
  {
    const w = 8, h = 4, m = new Uint8Array(w * h);
    m[0] = m[1] = m[w] = m[w + 1] = 1; // ชิ้นใหญ่ 4 จุด
    m[w * 3 + 7] = 1;                  // จุดแยกเดี่ยว
    const k = C.keepLargest(m, w, h, 0.5);
    ok(k[0] === 1 && k[w * 3 + 7] === 0, 'keepLargest drops the isolated speck');
    const seeds = new Uint8Array(w * h); seeds[w * 3 + 7] = 1;
    const k2 = C.keepLargest(m, w, h, 0.5, seeds);
    ok(k2[w * 3 + 7] === 1, 'keepLargest keeps a component the user marked as keep');
    const a = C.upscaleAlpha(new Uint8Array([0, 1, 1, 0]), 2, 2, 4, 4);
    const allOn = C.upscaleAlpha(new Uint8Array([1, 1, 1, 1]), 2, 2, 5, 3);
    ok(a.length === 16 && a[0] === 0 && a[15] === 0, 'upscaleAlpha keeps size and corners');
    ok(allOn.length === 15 && allOn.every(v => v === 255), 'upscaleAlpha of a full mask is fully opaque');
  }
  // 8) ความเร็วที่ขนาดทำงานจริง (256 ด้านยาว) ต้องไม่เกินงบ
  {
    const W2 = 256, H2 = 192;
    const s = scene(W2, H2, grad, [30, 200, 90], 50, 21);
    const rect = { x: W2 / 2 - 62, y: H2 / 2 - 62, w: 124, h: 124 };
    const t0 = Date.now();
    C.grabCut({ width: W2, height: H2, rgba: s.rgba, rect, iters: 3, seed: 2 });
    const ms = Date.now() - t0;
    ok(ms < 8000, 'working size 256x192 finishes in time: ' + ms + ' ms');
    console.log('  (ขนาด 256x192 ใช้เวลา ' + ms + ' ms)');
  }

  // 9) defringe: ขอบขาวที่ติดมาจากพื้นหลังเดิมถูกแทนด้วยสีเนื้อ แต่จุดขาวในเนื้อไม่ถูกแตะ
  {
    const W3 = 24, H3 = 24;
    const rgba = new Uint8ClampedArray(W3 * H3 * 4);
    const alpha = new Uint8Array(W3 * H3);
    for (let y = 4; y < 20; y++) for (let x = 4; x < 20; x++) {
      const i = y * W3 + x; alpha[i] = 255;
      const ring = x === 4 || x === 19 || y === 4 || y === 19;
      const c = ring ? [250, 250, 250] : (x === 12 && y === 12 ? [255, 255, 255] : [200, 40, 40]);
      rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255;
    }
    C.defringe(rgba, alpha, W3, H3);
    const at = (x, y) => { const i = (y * W3 + x) * 4; return [rgba[i], rgba[i + 1], rgba[i + 2]]; };
    const edge = at(4, 4), dot = at(12, 12);
    ok(edge[0] > 150 && edge[1] < 120, 'defringe replaces white edge with body colour: ' + edge);
    ok(dot[0] === 255 && dot[1] === 255 && dot[2] === 255, 'defringe keeps interior white highlight');
  }

  // 10) fillSmallHoles: เติมรูเล็กที่ถูกล้อมจริง แต่ไม่เติมรูที่ติดขอบภาพหรือรูใหญ่เกินเพดาน
  {
    const W4 = 20, H4 = 20;
    const m = new Uint8Array(W4 * H4);
    for (let y = 3; y < 17; y++) for (let x = 3; x < 17; x++) m[y * W4 + x] = 1;
    for (let y = 8; y < 11; y++) for (let x = 8; x < 11; x++) m[y * W4 + x] = 0;   // รูเล็กล้อมรอบ 9 พิกเซล
    const f1 = C.fillSmallHoles(m, W4, H4, 0.05);
    ok(f1[9 * W4 + 9] === 1, 'fillSmallHoles fills a small enclosed hole');
    const n = new Uint8Array(W4 * H4);
    for (let y = 3; y < 17; y++) for (let x = 3; x < 17; x++) n[y * W4 + x] = 1;
    for (let y = 8; y < 11; y++) for (let x = 0; x < 3; x++) n[y * W4 + x] = 0;      // รูต่อกับขอบภาพ
    const f2 = C.fillSmallHoles(n, W4, H4, 0.05);
    ok(f2[9 * W4 + 1] === 0, 'fillSmallHoles keeps a hole that touches the image edge');
    const b = new Uint8Array(W4 * H4);
    for (let y = 2; y < 18; y++) for (let x = 2; x < 18; x++) b[y * W4 + x] = 1;
    for (let y = 6; y < 12; y++) for (let x = 6; x < 12; x++) b[y * W4 + x] = 0;     // รูใหญ่ 36 พิกเซล เกินเพดาน 20
    const f3 = C.fillSmallHoles(b, W4, H4, 0.05);
    ok(f3[8 * W4 + 8] === 0, 'fillSmallHoles keeps a hole larger than the limit');
  }

  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL: crashed: ' + e.stack); process.exit(1); });
