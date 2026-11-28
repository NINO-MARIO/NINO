/* มิ้ม | 36-graph
 * กราฟคำ: คำที่อยู่ในความรู้เดียวกันจะเชื่อมกัน
 * - คำในคำถามเชื่อมกับคำในคำตอบด้วยน้ำหนักมากกว่า (1.5) เพราะเป็นความสัมพันธ์ถาม-ตอบโดยตรง
 * - น้ำหนักถูกทำให้เป็นมาตรฐานด้วยความถี่ของคำ เพื่อไม่ให้คำที่พบบ่อยครอบงำ
 * - เพื่อนบ้านของทุกคำถูกเรียงและตัดเหลือ TOP_K คำตั้งแต่ตอนสร้างกราฟ (ไม่คำนวณซ้ำตอนค้นหา)
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;

  const CROSS_WEIGHT = 1.5;
  const SAME_SIDE_WEIGHT = 1;
  const TOP_K = 24;

  class WordGraph {
    constructor() {
      this.df = new Map();   // คำ -> จำนวนความรู้ที่มีคำนี้
      this.adj = new Map();  // คำ -> Map(คำข้างเคียง -> น้ำหนักดิบ)
      this.top = new Map();  // คำ -> เพื่อนบ้านเรียงตามน้ำหนัก (ตัดเหลือ TOP_K)
      this.docs = [];
      this._dirty = new Set(); // คำที่เพื่อนบ้านเปลี่ยนหลังเพิ่มความรู้ จะจัดอันดับใหม่เมื่อมีการอ่านเท่านั้น
    }

    // docs: [{entry, q: [คำ], a: [คำ]}] สร้างกราฟทั้งชุดในครั้งเดียว
    static build(docs) {
      const g = new WordGraph();
      for (const d of docs) g.addDoc(d, true);
      g._finalize();
      return g;
    }

    // เพิ่มความรู้หนึ่งรายการเข้ากราฟที่มีอยู่แล้ว (ไม่ต้องสร้างใหม่ทั้งชุด)
    // defer = true ใช้ตอนสร้างทั้งชุด แล้วเรียก _finalize ครั้งเดียวตอนท้าย
    // ผลลัพธ์เหมือนสร้างทั้งชุด: เพื่อนบ้านของทุกคำที่ความถี่เปลี่ยนจะถูกจัดอันดับใหม่ทันที
    addDoc(d, defer) {
      this.docs.push(d);
      const qs = [...new Set(d.q)];
      const as = [...new Set(d.a)];
      const words = new Set([...qs, ...as]);
      for (const w of words) this.df.set(w, (this.df.get(w) || 0) + 1);
      for (let i = 0; i < qs.length; i++)
        for (let j = i + 1; j < qs.length; j++) this._pair(qs[i], qs[j], SAME_SIDE_WEIGHT);
      for (let i = 0; i < as.length; i++)
        for (let j = i + 1; j < as.length; j++) this._pair(as[i], as[j], SAME_SIDE_WEIGHT);
      for (const x of qs)
        for (const y of as)
          if (x !== y) this._pair(x, y, CROSS_WEIGHT);
      if (defer) return;
      this._dirty.add(...words);
      for (const w of words) {
        const m = this.adj.get(w);
        if (m) for (const b of m.keys()) this._dirty.add(b);
      }
    }

    _pair(a, b, w) {
      if (a === b) return;
      this._add(a, b, w);
      this._add(b, a, w);
    }

    _add(a, b, w) {
      let m = this.adj.get(a);
      if (!m) { m = new Map(); this.adj.set(a, m); }
      m.set(b, (m.get(b) || 0) + w);
    }

    _finalize() {
      for (const a of this.adj.keys()) this._sortTop(a);
      this._dirty.clear();
    }

    _sortTop(a) {
      const m = this.adj.get(a);
      if (!m) return;
      const list = [];
      for (const b of m.keys()) list.push({ w: b, weight: this.weight(a, b) });
      list.sort((x, y) => y.weight - x.weight);
      this.top.set(a, list.slice(0, TOP_K));
    }

    has(w) {
      return this.df.has(w);
    }

    weight(a, b) {
      const raw = (this.adj.get(a) && this.adj.get(a).get(b)) || 0;
      if (!raw) return 0;
      return raw / Math.sqrt((this.df.get(a) || 1) * (this.df.get(b) || 1));
    }

    neighbors(a, limit) {
      if (this._dirty.has(a)) {
        this._dirty.delete(a);
        this._sortTop(a);
      }
      const list = this.top.get(a);
      if (!list) return [];
      return limit ? list.slice(0, limit) : list;
    }

    // กระจายการกระตุ้นจากคำต้นทางไปยังคำข้างเคียง ทีละชั้น
    activate(seeds, hops, decay) {
      const act = new Map(seeds);
      let frontier = new Map(seeds);
      const d = decay === undefined ? 0.5 : decay;
      for (let h = 0; h < (hops || 2); h++) {
        const next = new Map();
        for (const [w, v] of frontier) {
          for (const n of this.neighbors(w, 8)) {
            const add = v * d * Math.min(1, n.weight);
            if (add <= 0) continue;
            next.set(n.w, (next.get(n.w) || 0) + add);
          }
        }
        for (const [w, v] of next) act.set(w, (act.get(w) || 0) + v);
        frontier = next;
      }
      return act;
    }

    // เส้นทางที่สั้นที่สุดระหว่างสองคำ (BFS) ไม่เกิน maxHops ช่วง
    path(a, b, maxHops) {
      if (a === b) return [a];
      const prev = new Map([[a, null]]);
      let frontier = [a];
      for (let h = 0; h < (maxHops || 3); h++) {
        const next = [];
        for (const w of frontier) {
          for (const n of this.neighbors(w, 12)) {
            if (prev.has(n.w)) continue;
            prev.set(n.w, w);
            if (n.w === b) {
              const out = [b];
              let cur = prev.get(b);
              while (cur !== null) { out.push(cur); cur = prev.get(cur); }
              return out.reverse();
            }
            next.push(n.w);
          }
        }
        frontier = next;
      }
      return null;
    }
  }

  NINO.WordGraph = WordGraph;
})(typeof globalThis !== 'undefined' ? globalThis : this);
