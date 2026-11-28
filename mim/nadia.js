/* มิ้ม | nadia.js: พี่นาเดียร์ โหมดออนไลน์ของมิ้ม
 * ผู้ใช้กดปุ่ม "นาเดียร์" เองเท่านั้น จึงจะเปิดโหมดนี้ได้ เมื่อเปิดแล้วคำถามจะวิ่งผ่านบริการ API
 * ที่ผู้ใช้ตั้งค่าไว้ในแอปอยู่แล้ว (ฟังก์ชัน geminiGenerate ของแอป ซึ่งส่งต่อให้ผู้ให้บริการที่เลือกไว้)
 *
 * หลักการ:
 *  - ไม่เขียนโค้ดเครือข่ายเอง ใช้ฟังก์ชันของแอปเท่านั้น และส่งเฉพาะตอนผู้ใช้พิมพ์ถาม
 *  - ความรู้ที่สอนไว้ที่ใกล้คำถามที่สุดจะแนบไปในคำสั่งเพื่อให้ยึดความรู้เป็นหลัก
 *  - คำตอบจาก API ติดป้าย "ยังไม่ยืนยัน" และจะถูกจำลงคลังก็ต่อเมื่อผู้ใช้กดจำเอง
 *  - ตอบไม่ได้ (ไม่มีคีย์ ออฟไลน์ หมดเวลา หรือไม่มีตัวอักษรไทย) ให้ผู้เรียกกลับไปใช้มิ้มออฟไลน์
 *  - การตั้งค่าของโหมดเก็บที่คีย์ nino_mim_nadia_v1 (ไม่ใช้คีย์ความรู้เดิม)
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;

  const CFG_KEY = 'nino_mim_nadia_v1';
  const NAME = 'พี่นาเดียร์';
  const TOP_K = 6;
  const MAX_CONTEXT_CHARS = 3000;
  const DEFAULT_TIMEOUT_MS = 30000;

  function readCfg() {
    try {
      const raw = root.localStorage.getItem(CFG_KEY);
      const o = raw ? JSON.parse(raw) : null;
      return o && typeof o === 'object' ? o : {};
    } catch (e) {
      return {};
    }
  }

  function writeCfg(c) {
    try {
      root.localStorage.setItem(CFG_KEY, JSON.stringify(c));
    } catch (e) {
      // พื้นที่เก็บเต็มหรือถูกบล็อก: ค่าจะหายเมื่อรีโหลด แต่ไม่ทำให้แอปพัง
    }
  }

  function status() {
    const c = readCfg();
    return { on: !!c.on, consentAt: c.consentAt || 0 };
  }

  // เปิดโหมดจะบันทึกเวลาที่ผู้ใช้ยืนยันความยินยอมไว้ด้วย ปิดแล้วไม่ลบเวลานั้น
  function setOn(on) {
    const c = readCfg();
    c.on = !!on;
    if (on) c.consentAt = Date.now();
    writeCfg(c);
    return status();
  }

  // ค้นความรู้ที่ใกล้คำถามที่สุด ใช้ดัชนีเดียวกับเครื่องยนต์ ไม่เรียกเครือข่าย
  function topHits(store, question, k) {
    const Text = NINO.Text;
    const qn = Text.normalize(question);
    if (!qn) return [];
    const idx = store.index();
    const qp = Text.profile(qn);
    const cand = new Set();
    for (const key of qp.b) for (const i of idx.post.get(key) || []) cand.add(i);
    for (const key of qp.t) for (const i of idx.post.get(key) || []) cand.add(i);
    const scored = [];
    for (const i of cand) {
      const item = idx.profiles[i];
      const s = Text.score(qp, item.p);
      if (s > 0) scored.push({ entry: item.entry, score: s });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k || TOP_K);
  }

  function buildSystem(hits) {
    const lines = [];
    let used = 0;
    hits.forEach((h, i) => {
      const line = (i + 1) + '. ถาม: ' + h.entry.q + '\n   ตอบ: ' + h.entry.a;
      if (used + line.length > MAX_CONTEXT_CHARS) return;
      used += line.length;
      lines.push(line);
    });
    return 'คุณคือ ' + NAME + ' ผู้ช่วยออนไลน์ของระบบตอบคำถามที่ชื่อ มิ้ม ทำงานผ่านบริการ API ที่ผู้ใช้ตั้งค่าไว้เอง\n' +
      'กติกา: ตอบเป็นภาษาไทยล้วน ไม่ใช้อิโมจิ ลงท้ายด้วยค่ะหรือคะ\n' +
      'ชื่อของระบบนี้คือ มิ้ม ห้ามเรียกระบบนี้ว่า NINO และเมื่อพูดถึงความรู้ที่สอนไว้ ให้บอกว่ามิ้มจำไว้\n' +
      'ถ้ามีความรู้ที่สอนไว้ด้านล่างที่ตรงกับคำถาม ให้ยึดความรู้นั้นเป็นหลัก\n' +
      'ถ้าไม่แน่ใจ ให้บอกตรงๆ ว่าไม่แน่ใจ และเชิญให้ผู้ใช้สอนคำตอบได้ ห้ามแต่งข้อเท็จจริง\n' +
      (lines.length
        ? 'ความรู้ที่สอนไว้:\n' + lines.join('\n')
        : 'ตอนนี้ยังไม่มีความรู้ที่สอนไว้ใกล้เคียงคำถามนี้');
  }

  // ถามผ่านฟังก์ชันของแอป ผลลัพธ์เป็น Promise เสมอ และไม่โยนข้อผิดพลาดออกไป
  // คืน { ok, text, usedKnowledge } เมื่อสำเร็จ หรือ { ok:false, error } เมื่อใช้ไม่ได้
  function ask(opts) {
    const question = String(opts.question || '').trim();
    const gen = opts.generate;
    const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    const hits = topHits(opts.store, question, TOP_K);
    return new Promise((resolve) => {
      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(r);
      };
      const timer = setTimeout(() => finish({ ok: false, error: 'หมดเวลารอการตอบ' }), timeoutMs);
      if (typeof gen !== 'function') {
        finish({ ok: false, error: 'ยังไม่ได้เชื่อมบริการ API ของแอป' });
        return;
      }
      Promise.resolve()
        .then(() => gen({
          systemInstruction: buildSystem(hits),
          contents: [{ role: 'user', parts: [{ text: question }] }],
          temperature: 0.3
        }))
        .then((raw) => {
          const body = raw && typeof raw === 'object' ? raw.text : raw;
          // ชื่อระบบในคำตอบต้องเป็นมิ้มเสมอ (displayName ไม่แก้ข้อความที่ไม่ได้พูดถึงตัวเอง)
          const raw2 = NINO.Text.stripEmoji(String(body || '')).trim();
          const text = NINO.Learn ? NINO.Learn.displayName(raw2) : raw2;
          if (!text || !/[ก-๛]/.test(text)) {
            finish({ ok: false, error: 'คำตอบไม่ใช่ภาษาไทย' });
            return;
          }
          finish({ ok: true, text, usedKnowledge: hits.length });
        })
        .catch((e) => {
          const msg = e && e.message ? String(e.message) : 'เกิดข้อผิดพลาดที่บริการ API';
          finish({ ok: false, error: msg });
        });
    });
  }

  // จำคำตอบเข้าคลังความรู้ออฟไลน์ เฉพาะเมื่อผู้ใช้กดจำเอง
  // คืน { status, derived } โดย status เหมือนเครื่องยนต์: 'new' | 'updated' | 'invalid' | 'too_long' | 'full'
  function teach(store, question, answer) {
    const a = NINO.Learn ? NINO.Learn.displayName(answer) : answer;
    const r = NINO.Learn
      ? NINO.Learn.teach(store, question, a)
      : { status: store.teach(question, a), derived: [] };
    if (r.status === 'new' || r.status === 'updated') store.save();
    return r;
  }

  root.NINO_NADIA = {
    NAME,
    status,
    setOn,
    ask,
    teach,
    topHits,
    buildSystem,
    readCfg
  };
})(typeof window !== 'undefined' ? window : globalThis);
