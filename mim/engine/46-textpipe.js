/* มิ้ม | 46-textpipe
 * ไปป์ไลน์คลังข้อความ (.txt) อัตโนมัติ: โมเดลคิด -> ไฟล์ .txt -> คลาสมารยาท -> อัลกอริทึม
 *
 *   1. generate(entries)  สร้างข้อความ .txt จากความรู้ที่มี พร้อมคำถามอื่นที่สร้างด้วยกฎ (เช่น เติม "ไหม")
 *   2. ผู้ใช้เปิดแก้ไขไฟล์ได้ทุกบรรทัด ไฟล์นี้เป็นข้อมูลที่มนุษย์ตรวจได้
 *   3. parse(text)        อ่านไฟล์กลับเป็นรายการคู่ถาม-ตอบ ทนต่อบรรทัดว่างและบรรทัดที่ไม่รู้จัก (รายงานใน errors)
 *   4. ingest(store, text) ปรับคำตอบด้วย NINO.Manners แล้วสอนเข้าคลัง (ผ่านการตรวจความยาวและขีดจำกัดเดิมทั้งหมด)
 *
 * รูปแบบไฟล์:
 *   # บรรทัดที่ขึ้นต้นด้วย # คือหมายเหตุ
 *   ถาม: คำถาม
 *   ตอบ: คำตอบ
 *   คำถามอื่น: คำถามทางเลือก | คำถามทางเลือก     (ไม่บังคับ)
 *   (บรรทัดว่างแยกรายการ)
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;
  const Text = NINO.Text;

  const HEADER = '# คลังข้อความคิดของมิ้ม (สร้างอัตโนมัติ ตรวจแก้ไขได้ทุกบรรทัด)';
  // คำลงท้ายที่ตัดออกก่อนสร้างคำถามทางเลือก
  const TRAIL_RE = /\s*(หรือเปล่าคะ|หรือเปล่า|ไหมคะ|ไหมครับ|ไหม|มั้ย|หรอ|เหรอ|คะ|ครับ|บ้าง)\s*$/;

  function oneLine(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
  }

  // คำถามทางเลือกที่สร้างด้วยกฎ (ไม่เดาความหมายใหม่) ตัดตัวซ้ำและคำถามเดิมออก
  function variants(q) {
    const base = oneLine(q);
    const stripped = base.replace(TRAIL_RE, '').trim();
    const cands = [];
    if (stripped && stripped !== base) cands.push(stripped);
    if (stripped) cands.push(stripped + 'ไหม');
    const seen = new Set([Text.normalize(base)]);
    const out = [];
    for (const c of cands) {
      const n = Text.normalize(c);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push(c);
    }
    return out.slice(0, 2);
  }

  function generate(entries) {
    const lines = [HEADER, ''];
    for (const e of entries || []) {
      lines.push('ถาม: ' + oneLine(e.q));
      lines.push('ตอบ: ' + oneLine(e.a));
      const v = variants(e.q);
      if (v.length) lines.push('คำถามอื่น: ' + v.join(' | '));
      lines.push('');
    }
    return lines.join('\n');
  }

  // คืน { items: [{q, a}], errors: [{line, text, reason}] }
  function parse(text) {
    const items = [];
    const errors = [];
    let block = null;
    let lineNo = 0;

    const flush = () => {
      if (!block) return;
      if (block.q && block.a) {
        items.push({ q: block.q, a: block.a });
        for (const alt of block.alts) items.push({ q: alt, a: block.a });
      } else {
        errors.push({ line: block.line, text: block.q || '(ไม่มีคำถาม)', reason: 'ขาดคำถามหรือคำตอบ' });
      }
      block = null;
    };

    for (const raw of String(text ?? '').split(/\r?\n/)) {
      lineNo++;
      const t = raw.trim();
      if (!t) { flush(); continue; }
      if (t.startsWith('#')) continue;
      const m = t.match(/^(ถาม|ตอบ|คำถามอื่น)\s*:\s*(.*)$/);
      if (!m) {
        errors.push({ line: lineNo, text: t, reason: 'ไม่รู้จักรูปแบบบรรทัดนี้' });
        continue;
      }
      const [, key, val] = m;
      if (key === 'ถาม') {
        flush();
        block = { q: oneLine(val), a: '', alts: [], line: lineNo };
      } else if (!block) {
        errors.push({ line: lineNo, text: t, reason: 'บรรทัดนี้ต้องอยู่หลัง "ถาม:"' });
      } else if (key === 'ตอบ') {
        block.a = oneLine(val);
      } else {
        block.alts = oneLine(val).split('|').map(s => s.trim()).filter(Boolean);
      }
    }
    flush();
    return { items, errors };
  }

  // นำเข้าไฟล์: ปรับคำตอบด้วยคลาสมารยาทก่อนสอนเข้าคลัง คืนสถิติผลการสอน
  function ingest(store, text) {
    const { items, errors } = parse(text);
    const counts = { new: 0, updated: 0, invalid: 0, too_long: 0, full: 0 };
    for (const it of items) {
      const r = store.teach(it.q, NINO.Manners.polish(it.a));
      counts[r] = (counts[r] || 0) + 1;
    }
    return { counts, errors, parsed: items.length };
  }

  NINO.TextPipe = { variants, generate, parse, ingest, HEADER };
})(typeof globalThis !== 'undefined' ? globalThis : this);
