/* NINO cutout core: GrabCut เขียนเองด้วย JavaScript (ไม่มีไลบรารีภายนอก ไม่มีเครือข่าย)
   - ไม่แตะ DOM ใช้ได้ทั้งในเว็บเวิร์กเกอร์ (importScripts) และในชุดทดสอบ Node
   - โมเดลสี: GMM แบบแนวทแยง (ความแปรปรวนต่อช่องสี) ฝึกด้วย k-means แบบแข็ง K ก้อนต่อฝั่ง
   - การตัด: max-flow แบบ Dinic บนกราฟ 4 เพื่อนบ้าน (สูตร t-link/n-link ตามเอกสาร GrabCut)
   - ผลลัพธ์เป็นมาสก์ 0/1 ที่ขนาดทำงาน แล้วขยายเป็นอัลฟาเต็มขนาดด้วยการสอดแทรกเชิงเส้น
   - สุ่มด้วยตัวสร้างเลขที่กำหนดได้ (seed) จึงได้ผลเดิมทุกครั้งกับอินพุตเดิม */
(function (root) {
  'use strict';

  const K = 12;           // จำนวนก้อนของ GMM ต่อฝั่ง (12 ช่วยแยกตาขาวกับพื้นมืดได้ดีกว่า 8)
  const GAMMA = 120;      // น้ำหนักความเรียบของขอบ (ปรับจากค่า 50 ของเอกสาร GrabCut เพื่อให้ตาขาวไม่ขาด)
  const VAR_FLOOR = 16;   // ความแปรปรวนขั้นต่ำต่อช่องสี (สเกล 0..255) กันการพุ่งเป็นอนันต์
  const INF = 1e12;
  const LOG_2PI = Math.log(2 * Math.PI);

  function rng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  const FIT_MAX = 6000;  // จำนวนตัวอย่างสูงสุดต่อฝั่งที่ใช้ฝึก GMM (เร็วขึ้นโดยคุณภาพแทบไม่ต่าง)
  const EM_ITERS = 6;    // รอบ EM ต่อการฝึกหนึ่งครั้ง
  const REG = 1.0;       // เติมบนแนวทแยงของความแปรปรวนร่วม กันเมทริกซ์เอกฐาน (สเกล 0..255)

  // ผกผันและดีเทอร์มิแนนต์ของเมทริกซ์ 3×3 (เรียงแถวต่อแถว)
  function inv3(a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a10 = a[3], a11 = a[4], a12 = a[5], a20 = a[6], a21 = a[7], a22 = a[8];
    const c00 = a11 * a22 - a12 * a21, c01 = a12 * a20 - a10 * a22, c02 = a10 * a21 - a11 * a20;
    const det = a00 * c00 + a01 * c01 + a02 * c02;
    const d = Math.max(det, 1e-9), id = 1 / d;
    return {
      inv: [c00 * id, (a02 * a21 - a01 * a22) * id, (a01 * a12 - a02 * a11) * id,
            c01 * id, (a00 * a22 - a02 * a20) * id, (a02 * a10 - a00 * a12) * id,
            c02 * id, (a01 * a20 - a00 * a21) * id, (a00 * a11 - a01 * a10) * id],
      det: d
    };
  }

  // ตั้งค่าก้อนหนึ่งจากน้ำหนัก ค่าเฉลี่ย และความแปรปรวนร่วม 3×3
  function setComp(M, c, w, mean, cov) {
    M.mu[c * 3] = mean[0]; M.mu[c * 3 + 1] = mean[1]; M.mu[c * 3 + 2] = mean[2];
    const r = [cov[0] + REG, cov[1], cov[2], cov[3], cov[4] + REG, cov[5], cov[6], cov[7], cov[8] + REG];
    const q = inv3(r);
    for (let j = 0; j < 9; j++) M.inv[c * 9 + j] = q.inv[j];
    M.logc[c] = Math.log(Math.max(w, 1e-9)) - 0.5 * (3 * LOG_2PI + Math.log(q.det));
  }

  // log(π_k N(c|μ_k,Σ_k)) ของทุกก้อนที่จุดสีหนึ่ง ใส่ลง out และคืนค่ามากสุด
  function compLL(M, r, g, b, out) {
    let mx = -Infinity;
    for (let c = 0; c < M.k; c++) {
      const dr = r - M.mu[c * 3], dg = g - M.mu[c * 3 + 1], db = b - M.mu[c * 3 + 2];
      const o = c * 9, I = M.inv;
      const q = I[o] * dr * dr + I[o + 1] * dr * dg + I[o + 2] * dr * db
              + I[o + 3] * dg * dr + I[o + 4] * dg * dg + I[o + 5] * dg * db
              + I[o + 6] * db * dr + I[o + 7] * db * dg + I[o + 8] * db * db;
      const v = M.logc[c] - 0.5 * q;
      out[c] = v;
      if (v > mx) mx = v;
    }
    return mx;
  }

  // GMM เต็มรูปจากชุดพิกเซล: k-means++ เริ่มต้น แล้วปรับด้วย EM แบบนุ่ม (สูตรมาตรฐานของ GrabCut)
  function fitGMM(px, idx, rand) {
    const n0 = idx.length;
    const k = Math.max(1, Math.min(K, n0));
    let sub;
    if (n0 > FIT_MAX) {
      sub = new Int32Array(FIT_MAX);
      for (let i = 0; i < FIT_MAX; i++) sub[i] = idx[Math.floor(rand() * n0)];
    } else sub = Int32Array.from(idx);
    const n = sub.length;
    const M = { k: k, mu: new Float64Array(k * 3), inv: new Float64Array(k * 9), logc: new Float64Array(k) };
    // k-means++ สำหรับจุดศูนย์เริ่มต้น
    const cen = new Float64Array(k * 3);
    const d2 = new Float64Array(n).fill(Infinity);
    const at = (i) => { const p = sub[i] * 3; return [px[p], px[p + 1], px[p + 2]]; };
    let c0 = at(Math.floor(rand() * n));
    for (let c = 0; c < k; c++) {
      if (c > 0) {
        let sum = 0;
        for (let i = 0; i < n; i++) sum += d2[i];
        let target = rand() * sum, chosen = n - 1;
        if (sum > 0) { for (let i = 0; i < n; i++) { target -= d2[i]; if (target <= 0) { chosen = i; break; } } }
        else chosen = Math.floor(rand() * n);
        c0 = at(chosen);
      }
      cen[c * 3] = c0[0]; cen[c * 3 + 1] = c0[1]; cen[c * 3 + 2] = c0[2];
      for (let i = 0; i < n; i++) {
        const p = sub[i] * 3;
        const dr = px[p] - c0[0], dg = px[p + 1] - c0[1], db = px[p + 2] - c0[2];
        const dd = dr * dr + dg * dg + db * db;
        if (dd < d2[i]) d2[i] = dd;
      }
    }
    // k-means แบบแข็ง 6 รอบ เพื่อได้ค่าเริ่มของแต่ละก้อน
    const assign = new Int32Array(n);
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < n; i++) {
        const p = sub[i] * 3;
        let best = Infinity, bk = 0;
        for (let c = 0; c < k; c++) {
          const dr = px[p] - cen[c * 3], dg = px[p + 1] - cen[c * 3 + 1], db = px[p + 2] - cen[c * 3 + 2];
          const dd = dr * dr + dg * dg + db * db;
          if (dd < best) { best = dd; bk = c; }
        }
        assign[i] = bk;
      }
      const cnt = new Float64Array(k), sum = new Float64Array(k * 3);
      for (let i = 0; i < n; i++) {
        const c = assign[i], p = sub[i] * 3;
        cnt[c]++;
        for (let d = 0; d < 3; d++) sum[c * 3 + d] += px[p + d];
      }
      for (let c = 0; c < k; c++) if (cnt[c] > 0) for (let d = 0; d < 3; d++) cen[c * 3 + d] = sum[c * 3 + d] / cnt[c];
    }
    // สถิติเริ่มต้นจากการกำหนดแข็ง
    const tmp = new Float64Array(k);
    const stats = (weightOf) => {
      const Nk = new Float64Array(k), Sx = new Float64Array(k * 3), Sxx = new Float64Array(k * 9);
      for (let i = 0; i < n; i++) {
        const p = sub[i] * 3, x = [px[p], px[p + 1], px[p + 2]];
        const w = weightOf(i, x);
        for (let c = 0; c < k; c++) {
          const wc = w[c];
          if (wc === 0) continue;
          Nk[c] += wc;
          for (let d = 0; d < 3; d++) Sx[c * 3 + d] += wc * x[d];
          for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) Sxx[c * 9 + a * 3 + b] += wc * x[a] * x[b];
        }
      }
      return { Nk, Sx, Sxx };
    };
    const apply = (st) => {
      let total = 0;
      for (let c = 0; c < k; c++) total += st.Nk[c];
      for (let c = 0; c < k; c++) {
        const N = st.Nk[c];
        if (N < 1) { setComp(M, c, 1e-6, [cen[c * 3], cen[c * 3 + 1], cen[c * 3 + 2]], [100, 0, 0, 0, 100, 0, 0, 0, 100]); continue; }
        const mean = [st.Sx[c * 3] / N, st.Sx[c * 3 + 1] / N, st.Sx[c * 3 + 2] / N];
        const cov = new Array(9);
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cov[a * 3 + b] = st.Sxx[c * 9 + a * 3 + b] / N - mean[a] * mean[b];
        setComp(M, c, N / Math.max(total, 1), mean, cov);
      }
    };
    // ค่าเริ่มจากการกำหนดแข็ง (w = 1 ให้ก้อนที่เลือก)
    apply(stats((i) => { const w = new Float64Array(k); w[assign[i]] = 1; return w; }));
    // EM แบบนุ่ม
    for (let it = 0; it < EM_ITERS; it++) {
      apply(stats((i, x) => {
        const w = new Float64Array(k);
        const mx = compLL(M, x[0], x[1], x[2], tmp);
        let s = 0;
        for (let c = 0; c < k; c++) { w[c] = Math.exp(tmp[c] - mx); s += w[c]; }
        for (let c = 0; c < k; c++) w[c] /= s;
        return w;
      }));
    }
    return M;
  }

  // -log p(c) ของพิกเซลหนึ่งจุดต่อโมเดล (log-sum-exp)
  function dataCost(M, r, g, b, tmp) {
    const mx = compLL(M, r, g, b, tmp);
    let s = 0;
    for (let c = 0; c < M.k; c++) s += Math.exp(tmp[c] - mx);
    return -(mx + Math.log(s));
  }

  // Dinic บนกราฟที่เก็บด้วยอาร์เรย์: ใช้ขอบคู่ (e, e^1) และดันทางด้วย stack แทนการเรียกซ้อน
  function Graph(n, maxEdges) {
    this.n = n;
    this.head = new Int32Array(n).fill(-1);
    this.to = new Int32Array(maxEdges);
    this.nxt = new Int32Array(maxEdges);
    this.cap = new Float64Array(maxEdges);
    this.m = 0;
  }
  Graph.prototype.add = function (u, v, c1, c2) {
    const e = this.m;
    this.to[e] = v; this.cap[e] = c1; this.nxt[e] = this.head[u]; this.head[u] = e;
    this.to[e + 1] = u; this.cap[e + 1] = c2; this.nxt[e + 1] = this.head[v]; this.head[v] = e + 1;
    this.m += 2;
  };
  Graph.prototype.maxflow = function (S, T) {
    const n = this.n, to = this.to, nxt = this.nxt, cap = this.cap, head = this.head;
    const level = new Int32Array(n), it = new Int32Array(n), queue = new Int32Array(n);
    let flow = 0;
    for (;;) {
      level.fill(-1);
      let qh = 0, qt = 0;
      queue[qt++] = S; level[S] = 0;
      while (qh < qt) {
        const u = queue[qh++];
        for (let e = head[u]; e !== -1; e = nxt[e]) {
          if (cap[e] > 0 && level[to[e]] < 0) { level[to[e]] = level[u] + 1; queue[qt++] = to[e]; }
        }
      }
      if (level[T] < 0) break;
      it.set(head);
      const path = [];
      let u = S;
      for (;;) {
        if (u === T) {
          let f = Infinity;
          for (const e of path) if (cap[e] < f) f = cap[e];
          if (f >= INF / 2) return flow; // ไม่ควรเกิด: เส้นทางที่ไม่มีขอบจำกัดเลย
          for (const e of path) { cap[e] -= f; cap[e ^ 1] += f; }
          flow += f;
          // ถอยกลับเฉพาะถึงขอบอิ่มตัวตัวแรก ไม่เดินทางจากต้นทางใหม่ทั้งเส้น
          let j = 0;
          while (j < path.length && cap[path[j]] > 0) j++;
          path.length = j;
          u = j === 0 ? S : to[path[j - 1]];
          continue;
        }
        let e = it[u];
        while (e !== -1 && !(cap[e] > 0 && level[to[e]] === level[u] + 1)) e = nxt[e];
        it[u] = e;
        if (e === -1) {
          if (u === S) break;
          const pe = path.pop();
          u = to[pe ^ 1];
          it[u] = nxt[it[u]];
          continue;
        }
        path.push(e);
        u = to[e];
      }
    }
    return flow;
  };
  // โหนดที่เข้าถึงได้จาก S ในกราฟเหลือ = ฝั่งวัตถุ
  Graph.prototype.reachable = function (S) {
    const n = this.n, head = this.head, nxt = this.nxt, cap = this.cap, to = this.to;
    const seen = new Uint8Array(n), queue = new Int32Array(n);
    let qh = 0, qt = 0;
    queue[qt++] = S; seen[S] = 1;
    while (qh < qt) {
      const u = queue[qh++];
      for (let e = head[u]; e !== -1; e = nxt[e]) {
        if (cap[e] > 0 && !seen[to[e]]) { seen[to[e]] = 1; queue[qt++] = to[e]; }
      }
    }
    return seen;
  };

  // GrabCut หลัก
  // opts: width, height, rgba (Uint8ClampedArray|Uint8Array ขนาด w*h*4), rect {x,y,w,h} หรือ null,
  //       fgMarks / bgMarks (Uint8Array w*h, 1 = จุดที่ผู้ใช้ระบุ), iters, seed
  // คืน Uint8Array w*h: 1 = วัตถุ 0 = พื้นหลัง
  function grabCut(opts) {
    const W = opts.width | 0, H = opts.height | 0;
    const P = W * H;
    if (!(W > 1 && H > 1) || !opts.rgba || opts.rgba.length < P * 4) throw new Error('ขนาดภาพไม่ถูกต้อง');
    const rect = opts.rect || null;
    const fgMarks = opts.fgMarks || null, bgMarks = opts.bgMarks || null;
    if (!rect && !(fgMarks && bgMarks)) throw new Error('ต้องมีกรอบหรือจุดทั้งวัตถุและพื้นหลัง');
    const iters = opts.iters || 5;
    const rand = rng(opts.seed || 1);

    const px = new Float32Array(P * 3);
    for (let i = 0; i < P; i++) {
      px[i * 3] = opts.rgba[i * 4]; px[i * 3 + 1] = opts.rgba[i * 4 + 1]; px[i * 3 + 2] = opts.rgba[i * 4 + 2];
    }
    const hard = new Uint8Array(P), base = new Uint8Array(P);
    let outside = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const inside = rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      if (rect) {
        if (inside) base[i] = 1; else { hard[i] = 1; base[i] = 0; outside++; }
      } else { hard[i] = 0; base[i] = 0; } // ไม่มีกรอบ: จุดที่ไม่ได้แตะเป็นพื้นหลังที่ยังไม่แน่ใจ ให้โมเดลเรียนรู้เอง
    }
    if (rect && outside === 0) { // กรอบคลุมทั้งภาพ: ขอบรูปถือเป็นพื้นหลังเพื่อให้มีตัวอย่างพื้นหลัง
      for (let x = 0; x < W; x++) { hard[x] = 1; base[x] = 0; hard[(H - 1) * W + x] = 1; base[(H - 1) * W + x] = 0; }
      for (let y = 0; y < H; y++) { hard[y * W] = 1; base[y * W] = 0; hard[y * W + W - 1] = 1; base[y * W + W - 1] = 0; }
    }
    if (fgMarks) for (let i = 0; i < P; i++) if (fgMarks[i]) { hard[i] = 1; base[i] = 1; }
    if (bgMarks) for (let i = 0; i < P; i++) if (bgMarks[i]) { hard[i] = 1; base[i] = 0; }

    // beta จากความต่างสีเฉลี่ยของเพื่อนบ้าน (สูตร GrabCut)
    let diffSum = 0, diffN = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      if (x + 1 < W) { const j = i + 3; diffSum += sq3(px, i, j); diffN++; }
      if (y + 1 < H) { const j = i + 3 * W; diffSum += sq3(px, i, j); diffN++; }
    }
    const beta = diffN && diffSum > 0 ? 1 / (2 * (diffSum / diffN)) : 0;

    const S = P, T = P + 1;
    const tmp = new Float64Array(K);

    // ค่าพลังงานของการจัดป้ายปัจจุบัน (ยิ่งต่ำยิ่งดี) ใช้เลือกผลระหว่างจุดเริ่มต่าง ๆ
    function energyOf(lab) {
      const fgIdx = [], bgIdx = [];
      for (let i = 0; i < P; i++) (lab[i] ? fgIdx : bgIdx).push(i);
      if (!fgIdx.length || !bgIdx.length) return Infinity;
      const mF = fitGMM(px, Int32Array.from(fgIdx), rand);
      const mB = fitGMM(px, Int32Array.from(bgIdx), rand);
      let E = 0;
      for (let i = 0; i < P; i++) {
        const p = i * 3;
        E += lab[i] ? dataCost(mF, px[p], px[p + 1], px[p + 2], tmp) : dataCost(mB, px[p], px[p + 1], px[p + 2], tmp);
        const x = i % W, y = (i / W) | 0;
        if (x + 1 < W && lab[i] !== lab[i + 1]) E += GAMMA * Math.exp(-beta * sq3(px, p, p + 3));
        if (y + 1 < H && lab[i] !== lab[i + W]) E += GAMMA * Math.exp(-beta * sq3(px, p, p + 3 * W));
      }
      return E;
    }

    // แก้ปัญหาจากจุดเริ่มต้นหนึ่ง คืนป้ายและพลังงาน
    function solve(start) {
      const lab = Uint8Array.from(start);
      for (let round = 0; round < iters; round++) {
        const fgIdx = [], bgIdx = [];
        for (let i = 0; i < P; i++) (lab[i] ? fgIdx : bgIdx).push(i);
        if (!fgIdx.length || !bgIdx.length) throw new Error('ไม่มีพื้นที่ทั้งวัตถุและพื้นหลังพอให้เรียนรู้');
        const mFG = fitGMM(px, Int32Array.from(fgIdx), rand);
        const mBG = fitGMM(px, Int32Array.from(bgIdx), rand);
        const maxEdges = 2 * (2 * P + 2 * P) + 8;
        const g = new Graph(P + 2, maxEdges);
        for (let i = 0; i < P; i++) {
          if (hard[i]) {
            if (lab[i]) g.add(S, i, INF, 0); else g.add(i, T, INF, 0);
            continue;
          }
          const p = i * 3;
          const dFG = dataCost(mFG, px[p], px[p + 1], px[p + 2], tmp);
          const dBG = dataCost(mBG, px[p], px[p + 1], px[p + 2], tmp);
          g.add(S, i, dBG, 0);   // ตัดขอบนี้ = ตั้งเป็นพื้นหลัง
          g.add(i, T, dFG, 0);   // ตัดขอบนี้ = ตั้งเป็นวัตถุ
        }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x, p = i * 3;
          if (x + 1 < W) { const w = GAMMA * Math.exp(-beta * sq3(px, p, p + 3)); g.add(i, i + 1, w, w); }
          if (y + 1 < H) { const w = GAMMA * Math.exp(-beta * sq3(px, p, p + 3 * W)); g.add(i, i + W, w, w); }
        }
        g.maxflow(S, T);
        const seen = g.reachable(S);
        let changed = 0;
        for (let i = 0; i < P; i++) {
          if (hard[i]) continue;
          const v = seen[i] ? 1 : 0;
          if (v !== lab[i]) { lab[i] = v; changed++; }
        }
        if (changed <= P * 0.001) break; // ลู่เข้าเมื่อเปลี่ยนไม่ถึงหนึ่งในพันของพิกเซล
      }
      return { lab, E: energyOf(lab) };
    }

    // จุดเริ่มที่ 1: กรอบทั้งหมดเป็นวัตถุชั่วคราว (วิธีเดิม)
    const candidates = [solve(base)];
    // จุดเริ่มที่ 2 (เฉพาะกรอบ): เริ่มจากสีของแถบขอบรูป ดูจุดในกรอบที่ไม่เหมือนพื้นหลังเป็นวัตถุ
    if (rect) {
      for (const kf of (opts.bgKeeps || [0.6])) {
        const init2 = borderStart(px, W, H, base, hard, rand, kf);
        if (init2) candidates.push(solve(init2));
      }
    }
    let best = candidates[0];
    for (const c of candidates) if (c.E < best.E) best = c;
    return best.lab;
  }

  // ป้ายเริ่มจากแถบขอบ: เรียนพื้นหลังจากขอบรูป (ตัด 40% ที่ไม่เหมือนพื้นหลังที่สุดออก)
  // แล้วจุดในกรอบที่ไม่เหมือนพื้นหลังเป็นวัตถุ คืน null ถ้าขอบบางเกินไป
  function borderStart(px, W, H, base, hard, rand, keepFrac) {
    const P = W * H;
    const r = Math.max(3, Math.round(0.03 * Math.min(W, H)));
    const ring = [];
    for (let i = 0; i < P; i++) {
      const x = i % W, y = (i / W) | 0;
      if (x < r || y < r || x >= W - r || y >= H - r) ring.push(i);
    }
    if (ring.length < 50) return null;
    const tmp2 = new Float64Array(K);
    const m0 = fitGMM(px, Int32Array.from(ring), rand);
    const c0 = ring.map((i) => ({ i, c: dataCost(m0, px[i * 3], px[i * 3 + 1], px[i * 3 + 2], tmp2) }));
    c0.sort((a, b) => a.c - b.c);
    const keep = c0.slice(0, Math.max(50, Math.floor(c0.length * keepFrac))).map((o) => o.i);
    const mB = fitGMM(px, Int32Array.from(keep), rand);
    const costs = keep.map((i) => dataCost(mB, px[i * 3], px[i * 3 + 1], px[i * 3 + 2], tmp2)).sort((a, b) => a - b);
    const T = costs[Math.floor(costs.length * 0.9)];
    const lab = Uint8Array.from(base);
    for (let i = 0; i < P; i++) {
      if (hard[i]) continue;
      if (!base[i]) continue;
      lab[i] = dataCost(mB, px[i * 3], px[i * 3 + 1], px[i * 3 + 2], tmp2) > T ? 1 : 0;
    }
    return lab;
  }

  function sq3(px, a, b) {
    const dr = px[a] - px[b], dg = px[a + 1] - px[b + 1], db = px[a + 2] - px[b + 2];
    return dr * dr + dg * dg + db * db;
  }

  // เก็บเฉพาะชิ้นวัตถุที่ใหญ่พอเมื่อเทียบกับชิ้นใหญ่สุด (ตัดจุดรบกวนที่แยกออกมา)
  // ชิ้นที่มีจุดที่ผู้ใช้แตะว่า "เก็บ" (seeds) จะเก็บไว้เสมอ เพราะผู้ใช้ตั้งใจให้อยู่
  function keepLargest(mask, W, H, minRatio, seeds) {
    const P = W * H, lbl = new Int32Array(P).fill(-1), sizes = [];
    const queue = new Int32Array(P);
    for (let s = 0; s < P; s++) {
      if (!mask[s] || lbl[s] >= 0) continue;
      const id = sizes.length;
      let qh = 0, qt = 0, n = 0;
      queue[qt++] = s; lbl[s] = id;
      while (qh < qt) {
        const i = queue[qh++]; n++;
        const x = i % W, y = (i / W) | 0;
        const nb = [];
        if (x > 0) nb.push(i - 1);
        if (x + 1 < W) nb.push(i + 1);
        if (y > 0) nb.push(i - W);
        if (y + 1 < H) nb.push(i + W);
        for (const j of nb) if (mask[j] && lbl[j] < 0) { lbl[j] = id; queue[qt++] = j; }
      }
      sizes.push(n);
    }
    if (!sizes.length) return mask;
    const big = Math.max.apply(null, sizes);
    const seeded = new Uint8Array(sizes.length);
    if (seeds) for (let i = 0; i < P; i++) if (seeds[i] && lbl[i] >= 0) seeded[lbl[i]] = 1;
    const out = new Uint8Array(P);
    for (let i = 0; i < P; i++) if (lbl[i] >= 0 && (seeded[lbl[i]] || sizes[lbl[i]] >= big * minRatio)) out[i] = 1;
    return out;
  }

  // เติมรูพื้นหลังเล็ก ๆ ที่ถูกล้อมด้วยวัตถุทั้งหมด (เช่น เลนส์แว่นที่โดนสีพื้นหลังดูด)
  // รูที่ติดขอบภาพ หรือใหญ่กว่า maxFrac ของพื้นที่ภาพ คงไว้ เพราะอาจเป็นช่องว่างจริงระหว่างแขนกับตัว
  function fillSmallHoles(mask, W, H, maxFrac) {
    const P = W * H, lim = Math.max(1, Math.floor(P * (maxFrac || 0.005)));
    const seen = new Uint8Array(P), queue = new Int32Array(P);
    const out = Uint8Array.from(mask);
    for (let s = 0; s < P; s++) {
      if (mask[s] || seen[s]) continue;
      let qh = 0, qt = 0, touches = false;
      queue[qt++] = s; seen[s] = 1;
      while (qh < qt) {
        const i = queue[qh++];
        const x = i % W, y = (i / W) | 0;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touches = true;
        if (x > 0 && !mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; queue[qt++] = i - 1; }
        if (x + 1 < W && !mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; queue[qt++] = i + 1; }
        if (y > 0 && !mask[i - W] && !seen[i - W]) { seen[i - W] = 1; queue[qt++] = i - W; }
        if (y + 1 < H && !mask[i + W] && !seen[i + W]) { seen[i + W] = 1; queue[qt++] = i + W; }
      }
      if (!touches && qt <= lim) for (let k = 0; k < qt; k++) out[queue[k]] = 1;
    }
    return out;
  }

  // ขยายมาสก์ขนาด w×h เป็นอัลฟา 0..255 ขนาด W×H ด้วยการสอดแทรกเชิงเส้น ขอบจึงนุ่ม
  function upscaleAlpha(mask, w, h, W, H) {
    const out = new Uint8Array(W * H);
    const sx = w / W, sy = h / H;
    for (let y = 0; y < H; y++) {
      let fy = (y + 0.5) * sy - 0.5;
      if (fy < 0) fy = 0;
      if (fy > h - 1) fy = h - 1;
      const y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < W; x++) {
        let fx = (x + 0.5) * sx - 0.5;
        if (fx < 0) fx = 0;
        if (fx > w - 1) fx = w - 1;
        const x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
        const a = mask[y0 * w + x0], b = mask[y0 * w + x1], c = mask[y1 * w + x0], d = mask[y1 * w + x1];
        const v = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
        out[y * W + x] = Math.round(v * 255);
      }
    }
    return out;
  }

  // ลบขอบขาวที่ติดมาจากพื้นหลังเดิม: จุดขอบที่เกือบขาวจะถูกแทนด้วยสีเฉลี่ยของเนื้อในใกล้เคียง
  // rgba = Uint8ClampedArray (W*H*4), alpha = Uint8Array (W*H) ค่า 0..255; แก้ rgba ในที่เดิม
  function defringe(rgba, alpha, W, H, opts) {
    const passes = (opts && opts.passes) || 2, R = (opts && opts.radius) || 3;
    const isWhite = (i) => {
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
      return mn >= 200 && mx - mn <= 40;
    };
    let changed = 0;
    for (let pass = 0; pass < passes; pass++) {
      const fix = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (alpha[i] === 0 || !isWhite(i)) continue;
          let edge = false;
          if (x > 0 && alpha[i - 1] < 128) edge = true;
          else if (x < W - 1 && alpha[i + 1] < 128) edge = true;
          else if (y > 0 && alpha[i - W] < 128) edge = true;
          else if (y < H - 1 && alpha[i + W] < 128) edge = true;
          if (!edge) continue;
          let sr = 0, sg = 0, sb = 0, n = 0;
          for (let dy = -R; dy <= R; dy++) {
            const yy = y + dy; if (yy < 0 || yy >= H) continue;
            for (let dx = -R; dx <= R; dx++) {
              const xx = x + dx; if (xx < 0 || xx >= W) continue;
              const j = yy * W + xx;
              if (alpha[j] < 250 || isWhite(j)) continue;
              sr += rgba[j * 4]; sg += rgba[j * 4 + 1]; sb += rgba[j * 4 + 2]; n++;
            }
          }
          if (n > 0) fix.push(i, Math.round(sr / n), Math.round(sg / n), Math.round(sb / n));
        }
      }
      for (let k = 0; k < fix.length; k += 4) {
        const i = fix[k];
        rgba[i * 4] = fix[k + 1]; rgba[i * 4 + 1] = fix[k + 2]; rgba[i * 4 + 2] = fix[k + 3];
      }
      changed += fix.length / 4;
      if (fix.length === 0) break;
    }
    return changed;
  }

  const api = { grabCut, keepLargest, fillSmallHoles, upscaleAlpha, defringe, rng, K, GAMMA };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NINOCutout = api;
})(typeof self !== 'undefined' ? self : globalThis);
