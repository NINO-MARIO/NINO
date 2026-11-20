/* NINO | โหมด 1: โมเดลในเครื่องรวมกับมิ้ม (ชั้นที่สองของมิ้ม)
 * - ทำงานเฉพาะเมื่อมิ้มตอบไม่ได้ (kind = 'fallback') และผู้ใช้เลือกโหมด 1 ในแท็บ LLM ของ >_
 * - มิ้มดึงความรู้ที่ใกล้เคียงจากคลังของตัวเองมาให้โมเดลเป็นข้อมูลอ้างอิง โมเดลตอบได้เฉพาะจากข้อมูลนั้น
 * - ความรู้ทั้งหมดในคำตอบต้องมาจากคลังของมิ้ม (100%):
 *   (1) คำตอบของโมเดลใช้ได้เฉพาะเมื่อแทบทั้งหมดอยู่ในข้อมูลอ้างอิง (MIN_GROUND) และห้ามบอกชื่อโมเดลหรือบริษัทอื่น
 *   (2) ถ้าโมเดลตอบไม่ผ่าน มิ้มใช้คำตอบที่สอนไว้ในคลังโดยตรง (ข้อความเดิม ไม่ดัดแปลง) เมื่อคำถามตรงความรู้นั้นพอ
 *   (3) ถ้าไม่มีทั้งสองทาง มิ้มตอบว่ายังไม่รู้ ไม่มีกรณีที่คำตอบมาจากนอกคลัง
 * - ข้อจำกัดที่ต้องรู้: นี่ไม่ใช่การเทรนโมเดลใหม่ น้ำหนักของโมเดลยังเป็นของเดิม การควบคุมทำด้วยบริบทและตัวตรวจ
 *   ตัวตรวจเป็นเพียงฮิวริสติก (ไม่ได้ตรวจความจริง) และยังไม่ได้ทดสอบโมเดลจริงบนมือถือ
 */
(function () {
  'use strict';
  var TOP_K = 3;
  var MIN_SCORE = 0.45;       // สัดส่วนน้ำหนักคู่ตัวอักษรของคำถามที่พบในความรู้ ต่ำกว่านี้ไม่ถือว่าเกี่ยวข้อง (วัดกับความรู้จริง 78 รายการ)
  var MIN_SHARED = 3;         // จำนวนคู่ตัวอักษรที่ตรงขั้นต่ำ
  // คำประกอบประโยคคำถามที่ไม่บอกเรื่อง ตัดออกก่อนจับคู่ กันการจับจากคำว่า "คืออะไร" หรือ "ยังไง"
  var QUESTION_FILLER = ['คืออะไร', 'ทำอย่างไร', 'อย่างไร', 'ยังไง', 'ทำไง', 'อะไร', 'ที่ไหน', 'ไหม', 'มั้ย', 'กี่', 'ทำไม', 'หรือเปล่า', 'หรือ', 'บ้าง', 'ค่ะ', 'คะ', 'ครับ', 'นะ', 'หน่อย', 'ช่วย', 'ให้', 'เป็น', 'มี'];
  var MIN_GROUND = 0.95;      // สัดส่วนคู่ตัวอักษรของคำตอบโมเดลที่มีในข้อมูลอ้างอิง ต้องแทบทั้งหมด (100% ของความรู้มิ้ม)
  var MIN_VERBATIM_SCORE = 0.6; // ใช้คำตอบที่สอนไว้โดยตรงเมื่อคำถามตรงความรู้รายการนั้นมากพอ (กันการใช้คำตอบที่ไม่เกี่ยว)
  var MIN_ANSWER_PAIRS = 4;   // คำตอบสั้นเกินไปไม่รับ
  var MAX_CHARS = 400;
  var FORBIDDEN = /SmolLM|Hugging\s*Face|Qwen|Gemma|Llama|OpenAI|ChatGPT|Gemini|Anthropic|Claude|GPT|Google|Alibaba|Meta\s*AI/i;
  var PERSONA = 'คุณคือมิ้ม ผู้ช่วยในเครื่องของผู้ใช้ พูดภาษาไทยสุภาพ ลงท้ายด้วยค่ะหรือนะคะ ' +
    'ตอบจากข้อมูลอ้างอิงที่ให้เท่านั้น ถ้าข้อมูลอ้างอิงไม่มีคำตอบ ให้บอกว่ายังไม่รู้เรื่องนี้ค่ะ ห้ามเดาและห้ามเพิ่มข้อเท็จจริงเอง ' +
    'ห้ามบอกว่าตัวเองเป็นโมเดลหรือเป็นผลงานของบริษัทใด ตอบสั้นๆ ไม่เกินสามประโยค';

  function norm(s) {
    var t = String(s || '');
    try { if (window.NINO && NINO.Text && typeof NINO.Text.normalize === 'function') t = NINO.Text.normalize(t); } catch (e) { /* ใช้ข้อความเดิม */ }
    return t.toLowerCase().replace(/[\s.,!?;:()"'“”‘’\-–—…]/g, '');
  }
  // เซตคู่ตัวอักษรติดกัน (ใช้วัดความคล้ายแบบไม่ต้องแยกคำ)
  function pairs(s) {
    var out = new Set(), t = norm(s);
    for (var i = 0; i + 1 < t.length; i++) out.add(t.substr(i, 2));
    return out;
  }
  function shareRatio(part, whole) {
    if (!part.size) return 0;
    var n = 0;
    part.forEach(function (p) { if (whole.has(p)) n++; });
    return n / part.size;
  }

  // ดึงความรู้ของมิ้มที่ใกล้คำถามที่สุด (ไม่ใช้โมเดล)
  // คู่ตัวอักษรที่พบบ่อยในทุกเรื่อง (เช่น "ไห" "ยั") ให้น้ำหนักน้อย คู่ที่หายากให้น้ำหนักมาก
  // ต้องมีคู่ที่ตรงอย่างน้อย MIN_SHARED คู่ กันการจับคู่จากตัวอักษรทั่วไป
  function retrieve(entries, question, k) {
    return retrieveScored(entries, question, k).map(function (x) { return x.entry; });
  }
  function retrieveScored(entries, question, k) {
    var q0 = norm(question);
    QUESTION_FILLER.forEach(function (w) { q0 = q0.split(w).join(''); });
    var qp = pairs(q0);
    if (!entries || !qp.size) return [];
    var docs = [], df = new Map();
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || !e.q || !e.a) continue;
      var ep = pairs(e.q + e.a);
      docs.push({ entry: e, pairs: ep });
      ep.forEach(function (p) { df.set(p, (df.get(p) || 0) + 1); });
    }
    var n = docs.length || 1;
    var weight = function (p) { return Math.log(1 + n / (df.get(p) || 1)); };
    var total = 0;
    qp.forEach(function (p) { total += weight(p); });
    if (!total) return [];
    var scored = [];
    docs.forEach(function (d) {
      var got = 0, shared = 0;
      qp.forEach(function (p) { if (d.pairs.has(p)) { got += weight(p); shared++; } });
      var s = got / total;
      if (shared >= MIN_SHARED && s >= MIN_SCORE) scored.push({ entry: d.entry, score: s });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, k || TOP_K);
  }

  function buildPrompt(question, facts) {
    var ref = facts.map(function (f, i) { return (i + 1) + '. ถาม: ' + f.q + ' ตอบ: ' + f.a; }).join('\n');
    return {
      systemInstruction: PERSONA + '\n\nข้อมูลอ้างอิง:\n' + ref,
      contents: [{ role: 'user', parts: [{ text: question }] }]
    };
  }

  // ตรวจคำตอบก่อนรับ: คืนเหตุผลที่ไม่ผ่าน หรือ '' ถ้าผ่าน
  function check(answer, facts) {
    var a = String(answer || '').trim();
    if (!a) return 'คำตอบว่างเปล่า';
    if (a.length > MAX_CHARS) return 'คำตอบยาวเกินไป';
    if (FORBIDDEN.test(a)) return 'คำตอบบอกชื่อโมเดลหรือบริษัทอื่น';
    var ap = pairs(a);
    if (ap.size < MIN_ANSWER_PAIRS) return 'คำตอบสั้นเกินไป';
    var ref = new Set();
    facts.forEach(function (f) { pairs(f.q + f.a).forEach(function (p) { ref.add(p); }); });
    if (shareRatio(ap, ref) < MIN_GROUND) return 'คำตอบไม่ตรงกับความรู้ที่มิ้มมี';
    return '';
  }

  function enabled() {
    try { return !!(window.NINOLocalLLM && NINOLocalLLM.mode() === 'mim'); } catch (e) { return false; }
  }

  // ตอบคำถามที่มิ้มตอบไม่ได้ด้วยโมเดล (คืน {ok, text, facts} หรือ {ok:false, reason})
  // แกนของคำถาม (ตัดคำประกอบประโยคออก) ใช้เทียบว่าเป็นเรื่องเดียวกันหรือไม่ ไม่ใช่แค่มีคู่ตัวอักษรร่วม
  function core(s) {
    var t = norm(s);
    QUESTION_FILLER.forEach(function (w) { t = t.split(w).join(''); });
    return t;
  }
  // ใช้คำที่สอนไว้โดยตรงได้เฉพาะเมื่อแกนของรายการนั้นอยู่ในคำถาม (ปัญญา ≠ ปัญญาประดิษฐ์)
  function sameTopic(question, entryQ) {
    var c = core(entryQ);
    return c.length >= 3 && core(question).indexOf(c) >= 0;
  }

  // คืน {ok, text, facts, source} โดย source = 'model' (โมเดลเรียบเรียงจากความรู้ที่ตรวจแล้ว) หรือ 'verbatim' (คำตอบที่สอนไว้โดยตรง)
  async function answer(store, question) {
    var L = window.NINOLocalLLM;
    if (!L || !enabled()) return { ok: false, reason: 'ไม่ได้เลือกโหมด 1' };
    if (!L.isReady()) return { ok: false, reason: 'โมเดลยังไม่พร้อม เปิดแท็บ LLM ใน >_ เพื่อโหลดก่อน' };
    var scored = retrieveScored(store && store.entries, question, TOP_K);
    if (!scored.length) return { ok: false, reason: 'ไม่มีความรู้ที่เกี่ยวข้องให้โมเดลอ้าง' };
    var facts = scored.map(function (x) { return x.entry; });
    var why;
    try {
      var p = buildPrompt(question, facts);
      var raw = await L.generate({ systemInstruction: p.systemInstruction, contents: p.contents, temperature: 0.3 });
      why = check(raw, facts);
      if (!why) return { ok: true, text: String(raw).trim(), facts: facts, source: 'model', entry: scored[0].entry };
      why = 'ตรวจคำตอบไม่ผ่าน: ' + why;
    } catch (e) {
      why = 'โมเดลตอบไม่ได้: ' + String((e && e.message) || e);
    }
    // โมเดลใช้ไม่ได้ในรอบนี้: ใช้คำที่มิ้มสอนไว้โดยตรง ยังคงมาจากคลังของมิ้มทั้งหมด
    var top = scored[0];
    if (top.score >= MIN_VERBATIM_SCORE && top.entry.a && sameTopic(question, top.entry.q))
      return { ok: true, text: String(top.entry.a), facts: facts, source: 'verbatim', modelReason: why, entry: top.entry };
    return { ok: false, reason: why };
  }

  window.NINOMimLLM = { enabled: enabled, answer: answer, retrieve: retrieve, retrieveScored: retrieveScored, check: check, buildPrompt: buildPrompt, PERSONA: PERSONA, MIN_GROUND: MIN_GROUND, MIN_VERBATIM_SCORE: MIN_VERBATIM_SCORE, sameTopic: sameTopic };
})();
