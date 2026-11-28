/* มิ้ม | 38-profile
 * ตัววัดเวลา: ห่อแต่ละขั้นของการคิดด้วย span แล้วสะสมจำนวนครั้ง เวลารวม เวลาเฉลี่ย และค่าสูงสุด
 * สำหรับพนักงาน: NINO.profiler.summary() คืนตารางค่าวัด, NINO.profiler.last คือค่าวัดของคำตอบล่าสุด
 * หมายเหตุ: การวัดนี้วัดเวลาคำนวณจริงของระบบ ไม่รวมการหน่วงเพื่อแสดงผลทีละขั้นบนจอ
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;

  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  class Profiler {
    constructor() {
      this.stats = new Map();
      this.last = null;
    }

    span(name, fn) {
      const t = now();
      try {
        return fn();
      } finally {
        this.record(name, now() - t);
      }
    }

    record(name, ms) {
      let s = this.stats.get(name);
      if (!s) {
        s = { name, count: 0, total: 0, max: 0 };
        this.stats.set(name, s);
      }
      s.count++;
      s.total += ms;
      if (ms > s.max) s.max = ms;
    }

    reset() {
      this.stats.clear();
      this.last = null;
    }

    summary() {
      const r = x => Math.round(x * 1000) / 1000;
      return [...this.stats.values()]
        .map(s => ({ name: s.name, count: s.count, totalMs: r(s.total), meanMs: r(s.total / s.count), maxMs: r(s.max) }))
        .sort((a, b) => b.totalMs - a.totalMs);
    }
  }

  NINO.now = now;
  NINO.Profiler = Profiler;
  NINO.profiler = new Profiler();
})(typeof globalThis !== 'undefined' ? globalThis : this);
