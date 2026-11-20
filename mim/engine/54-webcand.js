/* มิ้ม | 54-webcand
 * ค้นเว็บเมื่อมิ้มตอบไม่ได้ แล้วเก็บผลเป็น "ผู้สมัคร" รอให้ผู้ใช้ยืนยันก่อนเสมอ
 *
 *   1. candidates(คำถาม, ผลค้นเว็บ): ดึงเฉพาะประโยครูปนิยาม "X คือ/เป็น/ใช้ ..." (ใช้ตัวดึงนิยามของ 48-selfstudy)
 *      และต้องมีชื่อ X อยู่ในคำถามจริง กันการดึงเรื่องอื่นมาตอบ
 *   2. queue(store, ผู้สมัคร): พักไว้ใน store.candidates ยังไม่เข้าความรู้ ข้ามรายการที่มีความรู้เดิมแล้ว
 *   3. confirm(store, id): เมื่อผู้ใช้กดยืนยันเท่านั้น จึงสอนเข้าคลังพร้อมที่มา (src = web-<แหล่ง>, trust)
 *      ไม่เขียนทับความรู้เดิม
 *   4. dismiss(store, id): ทิ้งผู้สมัคร
 *
 * ผู้สมัครไม่ถูกใช้ตอบจนกว่าจะยืนยัน จึงโหมด 1 ยังตอบได้เฉพาะจากความรู้ของมิ้ม 100%
 * ผลค้นเว็บมาจาก ninoWeb.search (ไม่ได้อยู่ในไฟล์นี้) ไฟล์นี้ไม่เรียกเครือข่ายเอง ทดสอบได้ทั้งหมดด้วยข้อมูลปลอม
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;
  const Text = NINO.Text;

  const PER_LOOKUP = 3;
  const MAX_SENT = 220;
  const MIN_SENT = 8;
  const TRUST_BY_SRC = { Wikipedia: 'medium' };

  function sentences(text) {
    return String(text ?? '')
      .split(/[\n.!?。]+/)
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(s => s.length >= MIN_SENT && s.length <= MAX_SENT);
  }

  function keyOf(q, src) {
    return Text.normalize(q) + '|' + String(src || '').toLowerCase();
  }

  function hostOf(url) {
    const m = String(url || '').match(/^https?:\/\/([^/]+)/i);
    return m ? m[1].replace(/^www\./, '') : '';
  }

  // ดึงนิยามจากผลค้นเว็บที่ตรงกับคำถาม คืนรายการผู้สมัคร (ไม่เกิน PER_LOOKUP)
  function candidates(question, results) {
    const nq = Text.normalize(String(question ?? ''));
    const out = [];
    const seen = new Set();
    if (!nq || !Array.isArray(results)) return out;
    for (const r of results) {
      if (!r || typeof r.text !== 'string') continue;
      for (const s of sentences(r.text)) {
        const item = NINO.SelfStudy.extract(s);
        if (!item) continue;
        const subj = Text.normalize(item.subject);
        if (subj.length < 2 || !nq.includes(subj)) continue;
        const cand = {
          q: item.q,
          a: item.a,
          src: String(r.src || 'web').slice(0, 40),
          title: String(r.title || '').slice(0, 120),
          url: String(r.url || '').slice(0, 300),
          trust: TRUST_BY_SRC[r.src] || 'low',
          quote: s,
        };
        const key = keyOf(cand.q, cand.src);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(cand);
        if (out.length >= PER_LOOKUP) return out;
      }
    }
    return out;
  }

  function idOf(c) {
    return keyOf(c.q, c.src);
  }

  // พักผู้สมัคร: ข้ามที่มีความรู้เดิมแล้ว และที่พักไว้แล้ว คืนจำนวนที่เพิ่มจริง
  function queue(store, list) {
    let added = 0;
    for (const c of Array.isArray(list) ? list : []) {
      if (!c || !c.q || !c.a) continue;
      if (store.find(c.q)) continue;
      const id = idOf(c);
      if (store.candidates.some(x => idOf(x) === id)) continue;
      store.candidates.push(c);
      added++;
    }
    if (store.candidates.length > 20) store.candidates.splice(0, store.candidates.length - 20);
    return added;
  }

  function list(store) {
    return store.candidates.map(c => ({
      id: idOf(c),
      q: c.q,
      a: c.a,
      src: c.src,
      title: c.title,
      url: c.url,
      trust: c.trust,
      host: hostOf(c.url),
      quote: c.quote,
    }));
  }

  // ยืนยันผู้สมัครหนึ่งรายการ: สอนเข้าคลังเฉพาะเมื่อยังไม่มีความรู้เดิมของคำถามนี้
  function confirm(store, id) {
    const i = store.candidates.findIndex(c => idOf(c) === id);
    if (i < 0) return { id, status: 'missing' };
    const c = store.candidates[i];
    if (store.find(c.q)) {
      store.candidates.splice(i, 1);
      store.save();
      return { id, status: 'exists', q: c.q };
    }
    const meta = { src: ('web-' + c.src).slice(0, 80), trust: c.trust };
    const status = store.teach(c.q, c.a, meta);
    if (status === 'new') store.candidates.splice(i, 1);
    store.save();
    return { id, status, q: c.q, a: c.a };
  }

  function dismiss(store, id) {
    const before = store.candidates.length;
    store.candidates = store.candidates.filter(c => idOf(c) !== id);
    if (store.candidates.length !== before) store.save();
    return store.candidates.length !== before;
  }

  NINO.WebCand = { candidates, queue, list, confirm, dismiss, hostOf, PER_LOOKUP };
})(typeof globalThis !== 'undefined' ? globalThis : this);
