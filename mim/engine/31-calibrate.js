/* มิ้ม | 31-calibrate
 * ตัวปรับเกณฑ์การจับคู่แบบเรียลไทม์ (online calibration)
 *
 * เกณฑ์ที่ใช้จริง = เกณฑ์พื้นฐานที่ผู้ใช้ตั้งไว้ (settings.threshold) + ค่าปรับ (offset)
 * ค่าปรับขยับทุกครั้งที่มีสัญญาณจากการใช้งาน:
 *   - "wrong" (จับคู่ผิด): ผู้ใช้สอนคำตอบอื่นให้คำถามที่เพิ่งถูกตอบด้วยการจับคู่คล้ายกัน
 *     หรือลืมความรู้นั้นทันที ระบบจึงยกเกณฑ์ขึ้นเพื่อให้ตอบเฉพาะที่มั่นใจกว่าเดิม
 *   - "ok" (ยอมรับ): ผู้ใช้ถามเรื่องใหม่ต่อโดยไม่แก้ไข ระบบจึงลดค่าปรับลงช้าๆ
 *
 * ข้อจำกัดที่ตั้งใจ:
 *   - ค่าปรับถูกจำกัดช่วง ไม่ให้ไหลออกจากค่าที่สมเหตุสมผล
 *   - สัญญาณเป็นการอนุมานจากพฤติกรรม ไม่ใช่การให้คะแนนโดยตรง จึงเป็นสัญญาณอ่อน
 *   - ไม่มีการเรียนรู้เชิงความหมาย เป็นเพียงตัวควบคุมแบบปรับตามผลลัพธ์
 *
 * ค่าเริ่มต้น offset = 0 จึงให้ผลเหมือนเกณฑ์เดิมทุกประการจนกว่าจะมีสัญญาณ
 * ค่าที่ปรับเก็บใน settings.calib และถูกบันทึกไปพร้อมการตั้งค่า
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;

  // ค่าปรับไม่ลดเกณฑ์ต่ำกว่าค่าที่ผู้ใช้ตั้งไว้ จึงมีแต่ยกขึ้นเมื่อพลาด แล้วค่อยๆ กลับสู่ค่าพื้นฐาน
  const OFFSET = { min: 0, max: 0.15 };
  const STEP = { wrong: 0.02, ok: 0.005 };

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function state(store) {
    const s = store.settings;
    if (!s.calib || typeof s.calib !== 'object') s.calib = { offset: 0, wrong: 0, ok: 0 };
    if (!Number.isFinite(s.calib.offset)) s.calib.offset = 0;
    s.calib.wrong = Number(s.calib.wrong) || 0;
    s.calib.ok = Number(s.calib.ok) || 0;
    return s.calib;
  }

  const Calibrator = {
    // ค่าที่ผู้ใช้ตั้ง ใช้ตามที่ตั้งจริง ไม่ปัดให้เข้าช่วง (แถบเลื่อนจำกัดช่วงไว้ที่ UI อยู่แล้ว)
    base(store) {
      const t = Number(store.settings.threshold);
      return Number.isFinite(t) && t > 0 ? t : 0.34;
    },

    offset(store) {
      return clamp(state(store).offset, OFFSET.min, OFFSET.max);
    },

    // เกณฑ์ที่ใช้ตัดสินจริง ณ ขณะนี้
    // เมื่อไม่มีค่าปรับ ค่าที่ได้เท่ากับค่าที่ผู้ใช้ตั้งทุกประการ (ไม่เปลี่ยนพฤติกรรมเดิม)
    effective(store) {
      return Math.max(0.1, this.base(store) + this.offset(store));
    },

    // signal: 'wrong' | 'ok' คืนเกณฑ์ที่ใช้จริงหลังปรับ
    feedback(store, signal) {
      const st = state(store);
      if (signal === 'wrong') {
        st.offset = clamp(st.offset + STEP.wrong, OFFSET.min, OFFSET.max);
        st.wrong++;
      } else if (signal === 'ok') {
        // ค่อยๆ คืนค่าปรับสู่ศูนย์เมื่อผู้ใช้ยอมรับคำตอบ
        st.offset = clamp(st.offset - STEP.ok, OFFSET.min, OFFSET.max);
        st.ok++;
      } else {
        return this.effective(store);
      }
      return this.effective(store);
    },

    describe(store) {
      const st = state(store);
      return {
        base: this.base(store),
        offset: Math.round(this.offset(store) * 1000) / 1000,
        effective: Math.round(this.effective(store) * 1000) / 1000,
        wrong: st.wrong,
        ok: st.ok
      };
    }
  };

  NINO.Calibrator = Calibrator;
})(typeof globalThis !== 'undefined' ? globalThis : this);
