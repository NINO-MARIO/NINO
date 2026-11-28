/* NINO | โมเดลภาษาในเครื่อง (ทางสำรองเมื่อไม่มี API Key หรือไม่มีอินเทอร์เน็ต)
 * - ใช้เฉพาะแชตโค้ดและโรลเพลย์ของแอป ไม่ใช้กับมิ้มและพี่นาเดียร์ (mim/mim.js ส่ง noLocal ให้พี่นาเดียร์เสมอ)
 * - สองโมเดลให้เลือก (ตัวเล็กสุดของแต่ละตระกูล): Gemma 3 270M IT IQ2_XXS (ประมาณ 180 MB) และ Qwen2.5-0.5B-Instruct Q2_K (ประมาณ 415 MB)
 *   จาก Hugging Face ค่าเริ่มต้นคือ Gemma เลือกได้ในแท็บ LLM ยินยอมแยกตามโมเดลที่เลือก
 * - ปุ่มโหลดอยู่ใน NINO Console (>_) แท็บ LLM ผู้ใช้ต้องกดยืนยันก่อนดาวน์โหลดทุกครั้ง ยกเลิกได้ด้วยการลบโมเดล
 * - ความปลอดภัยการโหลด (ตามแนวทางที่ใช้ได้จริงบนมือถือ):
 *     1) ตั้งเครื่องหมายก่อนโหลด ถ้าแอปปิดกลางคัน รอบถัดไปจะจำว่าโหลดไม่สำเร็จ และจะไม่โหลดเองจนกว่าผู้ใช้จะกดเอง
 *     2) ถ้าดาวน์โหลดค้างโดยไม่มีความคืบหน้านานเกิน stallMs ระบบจะยกเลิกการรอและแจ้งผู้ใช้
 *     3) เครื่องที่มี RAM น้อยกว่า 2 GB (ถ้าเบราว์เซอร์บอก) จะไม่เริ่มโหลด
 * - ในแอป Android มีโมเดลเพิ่มอีกตัว (NATIVE_MODEL) รันด้วย llama.cpp บนเครื่องผ่าน ninoNative bridge 5 ขึ้นไป ดู loadNative/generateNative
 * - ตัวรัน wllama (llama.cpp WASM) ปักเวอร์ชันบน jsdelivr ไม่มี COOP/COEP จึงรันเธรดเดียว (n_threads = 1)
 * - ยังไม่ได้ทดสอบโมเดลจริงบนมือถือ: ชุดทดสอบใช้ตัวปลอมของ wllama
 */
(function () {
  'use strict';
  var WLLAMA_VERSION = '3.8.1'; // เผยแพร่ 2026-10-02 (เก่ากว่า 2 สัปดาห์)
  var CDN = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@' + WLLAMA_VERSION + '/esm/';
  // ขนาดเป็นค่าประมาณจากหน้าไฟล์ของ Hugging Face (ไม่ใช่จำนวนไบต์แน่นอน)
  var MODELS = [
    {
      id: 'gemma3_270m', name: 'Gemma 3 270M IT (IQ2_XXS)',
      repo: 'unsloth/gemma-3-270m-it-qat-GGUF', file: 'gemma-3-270m-it-qat-UD-IQ2_XXS.gguf',
      bytes: 180000000, license: 'Gemma Terms of Use', origin: 'google/gemma-3-270m-it',
      note: 'โมเดลมีพารามิเตอร์ประมาณ 270 ล้าน บีบอัดเหลือ 2 บิต จึงตอบได้จำกัดมาก โดยเฉพาะภาษาไทยและงานโค้ด ใช้ตรวจว่าระบบทำงานได้ ไม่ใช่สำหรับใช้งานจริง การใช้งานอยู่ภายใต้ ai.google.dev/gemma/terms'
    },
    {
      id: 'qwen25_05b', name: 'Qwen2.5 0.5B Instruct (Q2_K)',
      repo: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF', file: 'qwen2.5-0.5b-instruct-q2_k.gguf',
      bytes: 415000000, license: 'apache-2.0', origin: 'Qwen/Qwen2.5-0.5B-Instruct',
      note: 'โมเดลมีพารามิเตอร์ประมาณ 500 ล้าน บีบอัดเหลือ 2 บิต จึงตอบได้จำกัด โดยเฉพาะภาษาไทยและงานโค้ดที่ซับซ้อน และรันช้ากว่า API มาก'
    }
  ];
  // โมเดลในแอป Android (llama.cpp บนเครื่อง) ใช้ได้เมื่อ ninoNative รองรับ bridge 5 ขึ้นไป
  // ค่าทั้งหมดตรงกับ NinoLlm.kt ฝั่ง Android (ปักรุ่นและค่า sha256 ไว้ที่นั่น)
  var NATIVE_MODEL = {
    id: 'native_qwen25_05b_q4km', name: 'Qwen2.5 0.5B Instruct (Q4_K_M) ในแอป Android',
    repo: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF', file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    bytes: 491400032, license: 'Apache-2.0', origin: 'Qwen/Qwen2.5-0.5B-Instruct', backend: 'native',
    note: 'รันบนเครื่องด้วย llama.cpp ในแอป Android ดาวน์โหลดครั้งเดียวแล้วใช้ได้โดยไม่ต้องต่ออินเทอร์เน็ต ตอบภาษาไทยได้จำกัด'
  };
  var NATIVE_RUNNER = { native: true, exit: function () { return nativeCall('llm.unload', {}).catch(function () { /* ปิดไม่สำเร็จ ไม่เป็นไร */ }); } };
  var LONG_PROMPT_CHARS = 8000, LONG_OUT_TOKENS = 1536; // longOut (ห้องเรียนบน native) ใช้ค่านี้แทน
  var NATIVE_PROMPT_CHARS = 1500; // บริบทของโมเดลในแอปคือ 2048 โทเคน จึงตัดข้อความให้สั้นกว่า wllama
  var NATIVE_ERRORS = {
    NOT_INSTALLED: 'ยังไม่มีไฟล์โมเดลในแอป', CHECKSUM: 'ไฟล์ที่ดาวน์โหลดไม่ตรงกับค่าตรวจสอบ ลองใหม่',
    DOWNLOAD_HOST: 'ที่อยู่ดาวน์โหลดไม่ได้รับอนุญาต', DOWNLOAD_HTTP: 'ดาวน์โหลดโมเดลไม่สำเร็จ ลองใหม่เมื่อสัญญาณดีขึ้น',
    STORAGE: 'บันทึกไฟล์โมเดลไม่ได้ ตรวจพื้นที่ว่าง', NOT_LOADED: 'โมเดลยังไม่ได้โหลด', CANCELLED: 'ยกเลิกแล้ว',
    UNKNOWN_MODEL: 'ไม่รู้จักโมเดลนี้', INVALID_INPUT: 'ไม่มีข้อความให้ตอบ'
  };
  // llm เป็น true เมื่อแอปยืนยันว่ารองรับ llm.* (js/native-bridge.js ถาม info แล้วตั้งค่า)
  function nativeHost() { var n = window.ninoNative; return !!(n && n.llm === true && typeof n.call === 'function'); }
  // ninoNative โหลดหลัง local-llm.js จึงตรวจทุกครั้งที่ใช้โมเดล ไม่ตรวจครั้งเดียวตอนเริ่ม
  function refreshNative() {
    if (!nativeHost() || MODELS[0] === NATIVE_MODEL) return;
    MODELS.unshift(NATIVE_MODEL);
    var saved = null; try { saved = localStorage.getItem(KEY_MODEL); } catch (e) { /* ไม่มีที่เก็บ */ }
    if (!saved) MODEL = NATIVE_MODEL;
  }
  function nativeCall(op, params, onEv) { return window.ninoNative.call(op, Object.assign({ model: NATIVE_MODEL.id }, params || {}), onEv); }
  function nativeFriendly(e) { var c = e && e.message; return c && NATIVE_ERRORS[c] ? NATIVE_ERRORS[c] : friendly(e); }

  var KEY_MODEL = 'nino.llm.model'; // รหัสโมเดลที่เลือก ไม่มีหรือไม่รู้จัก = ตัวแรก
  function findModel(id) { for (var i = 0; i < MODELS.length; i++) if (MODELS[i].id === id) return MODELS[i]; return null; }
  function savedModel() { try { return findModel(localStorage.getItem(KEY_MODEL)) || MODELS[0]; } catch (e) { return MODELS[0]; } }
  var MODEL = savedModel(); // โมเดลที่กำลังใช้ (เปลี่ยนได้ด้วย setModel)
  var KEY_CONSENT = 'nino.llm.consent'; // เก็บรหัสโมเดลที่ยินยอมแล้ว ค่าเก่าจากไฟล์อื่นไม่นับ
  var KEY_LOADING = 'nino.llm.loading'; // เครื่องหมายระหว่างโหลด (sessionStorage)
  var KEY_INTERRUPTED = 'nino.llm.interrupted'; // โหลดครั้งก่อนไม่สำเร็จ (sessionStorage)
  var KEY_MODE = 'nino.llm.mode'; // 'mim' = โหมด 1 รวมกับมิ้ม (เฉพาะคำที่มิ้มไม่รู้) · 'plain' = โหมด 2 ปกติ (ค่าเริ่มต้น)
  var MODES = ['mim', 'plain'];
  var MAX_PROMPT_CHARS = 6000;
  var MAX_OUT_TOKENS = 512;
  // ชั้นโค้ด: กติกาที่ส่งให้โมเดลทุกครั้ง และตัวตรวจคำตอบก่อนส่งให้ผู้ใช้ (ดู checkCode)
  var CODE_RULES = 'กติกาการตอบ: ถ้ามีโค้ดให้ใส่ในบล็อก ``` ที่ปิดครบ และระบุภาษาหลังเปิดบล็อก ห้ามบอกว่าตัวเองเป็นโมเดลหรือผลงานของบริษัทใด';
  var FORBIDDEN_ID = /SmolLM|Hugging\s*Face|Qwen|Gemma|Llama|OpenAI|ChatGPT|Gemini|Anthropic|Claude|GPT|Google|Alibaba|Meta\s*AI/i;
  var MIN_RAM_GB = 2;
  var stallMs = 90000;

  var state = 'off'; // off | downloading | ready | error
  var wl = null, loading = null, progress = 0, lastError = '';
  var gen = 0, stallTimer = null, abandon = null; // abandon: ปฏิเสธการรอ load() ที่ค้างอยู่
  var listeners = [];
  var lastUsage = null;

  function abortErr() { var e = new Error('ยกเลิกการตอบแล้ว'); e.name = 'AbortError'; return e; }
  function mb(bytes) { return Math.round(bytes / 1000000); }

  function consented() {
    try { return localStorage.getItem(KEY_CONSENT) === MODEL.id; } catch (e) { return false; }
  }
  function setConsent(v) {
    try { if (v) localStorage.setItem(KEY_CONSENT, MODEL.id); else localStorage.removeItem(KEY_CONSENT); } catch (e) { /* ใช้ค่าในหน่วยความจำ */ }
  }

  // โหมดการใช้โมเดล: โหมด 2 (plain) เป็นค่าเริ่มต้น โหมด 1 (mim) ต้องเลือกเองเท่านั้น
  function mode() {
    try { var v = localStorage.getItem(KEY_MODE); if (MODES.indexOf(v) >= 0) return v; } catch (e) { /* ไม่มีที่เก็บ */ }
    return 'plain';
  }
  function setMode(v) {
    if (MODES.indexOf(v) < 0) return false;
    try { localStorage.setItem(KEY_MODE, v); } catch (e) { /* ใช้ค่าในหน่วยความจำไม่ได้ จึงคงค่าเดิม */ }
    emit();
    return true;
  }

  // เปลี่ยนโมเดล: ปิดตัวรันเดิม และไม่ให้เปลี่ยนระหว่างดาวน์โหลด (ยินยอมแยกตามรหัสโมเดลอยู่แล้ว)
  function setModel(id) {
    refreshNative();
    var m = findModel(id);
    if (!m) return false;
    if (m === MODEL) return true;
    // loading ค้างค่าไว้หลังโหลดสำเร็จ จึงดูจากสถานะดาวน์โหลดจริง
    if (state === 'downloading') { lastError = 'รอให้การดาวน์โหลดปัจจุบันจบหรือยกเลิกก่อนเปลี่ยนโมเดล'; emit(); return false; }
    gen++;
    clearTimeout(stallTimer); stallTimer = null;
    var old = wl;
    if (old && typeof old.exit === 'function') { try { Promise.resolve(old.exit()).catch(function () { /* ปิดไม่สำเร็จ ไม่เป็นไร */ }); } catch (e) { /* ไม่เป็นไร */ } }
    MODEL = m; wl = null; loading = null; state = 'off'; progress = 0; lastError = '';
    try { localStorage.setItem(KEY_MODEL, m.id); } catch (e) { /* ใช้ค่าในหน่วยความจำ */ }
    clearMarker(); emit();
    return true;
  }

  function ss() { try { return window.sessionStorage || null; } catch (e) { return null; } }
  function setMarker(id) { try { var s = ss(); if (s) s.setItem(KEY_LOADING, JSON.stringify({ id: id, t: Date.now() })); } catch (e) { /* ไม่มีที่เก็บ */ } }
  function clearMarker() { try { var s = ss(); if (s) s.removeItem(KEY_LOADING); } catch (e) { /* ไม่มีที่เก็บ */ } }
  function clearInterrupted() { try { var s = ss(); if (s) s.removeItem(KEY_INTERRUPTED); } catch (e) { /* ไม่มีที่เก็บ */ } }
  function interrupted() { try { var s = ss(); return !!(s && s.getItem(KEY_INTERRUPTED)); } catch (e) { return false; } }
  // ตอนโหลดไฟล์นี้: ถ้ายังมีเครื่องหมายค้างจากรอบก่อน แปลว่าโหลดไม่จบ (แอปปิดหรือรีเฟรชระหว่างโหลด)
  (function markInterruptedIfAny() {
    try {
      var s = ss(); if (!s) return;
      var raw = s.getItem(KEY_LOADING);
      if (raw) { s.removeItem(KEY_LOADING); s.setItem(KEY_INTERRUPTED, raw); }
    } catch (e) { /* ไม่มีที่เก็บ */ }
  })();

  // เหตุผลที่ไม่ควรเริ่มโหลด (ว่างหมายถึงโหลดได้)
  function memoryReason() {
    var dm = (typeof navigator !== 'undefined') ? navigator.deviceMemory : 0;
    if (dm && dm < MIN_RAM_GB) return 'เครื่องนี้มี RAM ไม่ถึง ' + MIN_RAM_GB + ' GB โมเดลนี้อาจทำให้แอปปิดตัว';
    return '';
  }
  function friendly(e) {
    var t = String((e && e.message) || e || '');
    if (/memory|OOM|allocation|RangeError|out of/i.test(t)) return 'หน่วยความจำไม่พอสำหรับโมเดลนี้';
    if (/fetch|network|Failed to|NetworkError/i.test(t)) return 'เชื่อมต่อดาวน์โหลดไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่';
    return t || 'โหลดไม่สำเร็จ';
  }

  function emit() {
    var s = status();
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](s); } catch (e) { /* ผู้ฟังพัง ไม่ลามไปยังผู้เรียก */ } }
  }
  function status() {
    refreshNative();
    return {
      state: state, progress: progress, error: lastError,
      consented: consented(), interrupted: interrupted(), model: MODEL, mode: mode(),
      models: MODELS, memoryReason: memoryReason()
    };
  }
  function isReady() { return state === 'ready' && !!wl; }
  // โหลดเองได้เฉพาะเมื่อยินยอมแล้ว ไม่มีเหตุขัดข้อง และรอบก่อนไม่ได้ค้างกลางคัน
  function canAutoLoad() { return consented() && !interrupted() && !memoryReason(); }

  function armStall(myGen) {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(function () {
      var text = 'ดาวน์โหลดค้างเกิน ' + Math.round(stallMs / 1000) + ' วินาที ลองใหม่เมื่อสัญญาณดีขึ้น';
      fail(myGen, text);
      var e = new Error(text); e.stalled = true;
      if (abandon && myGen === gen) { var f = abandon; abandon = null; f(e); }
    }, stallMs);
  }
  function fail(myGen, text) {
    if (myGen !== gen) return;
    clearTimeout(stallTimer); stallTimer = null;
    state = 'error'; wl = null; loading = null; lastError = text;
    clearMarker(); emit();
  }

  // โหลดตัวรันและไฟล์โมเดล (เรียกหลังผู้ใช้ยืนยันแล้วเท่านั้น หรือเรียกเองเมื่อ canAutoLoad)
  // โหลดผ่านแอป Android: แอปดาวน์โหลดและตรวจ sha256 เอง แล้วโหลดเข้า llama.cpp
  function loadNative() {
    var myGen = ++gen;
    state = 'downloading'; progress = 0; lastError = '';
    setMarker(MODEL.id); armStall(myGen); emit();
    loading = (async function () {
      await nativeCall('llm.download', {}, function (m) {
        if (myGen !== gen) return;
        if (typeof m.progress === 'number') progress = Math.min(99, m.progress);
        armStall(myGen); emit();
      });
      if (myGen !== gen) throw abortErr();
      await nativeCall('llm.load', {});
      if (myGen !== gen) throw abortErr();
      clearTimeout(stallTimer); stallTimer = null;
      wl = NATIVE_RUNNER; state = 'ready'; progress = 100;
      clearMarker(); clearInterrupted(); emit();
      return wl;
    })().catch(function (e) {
      if (e && e.name === 'AbortError') throw e;
      fail(myGen, nativeFriendly(e));
      throw e;
    });
    return loading;
  }

  function load() {
    if (isReady()) return Promise.resolve(wl);
    if (loading) return loading;
    refreshNative();
    if (MODEL.backend === 'native') return loadNative();
    var reason = memoryReason();
    if (reason) { state = 'error'; lastError = reason; emit(); return Promise.reject(new Error(reason)); }
    var myGen = ++gen;
    state = 'downloading'; progress = 0; lastError = '';
    var stalledP = new Promise(function (_, reject) { abandon = reject; });
    stalledP.catch(function () { /* ถูกรอในขั้นตอนโหลดอยู่แล้ว */ });
    setMarker(MODEL.id); armStall(myGen); emit();
    loading = (async function () {
      var mod = await import(CDN + 'index.js');
      var Wllama = mod.Wllama;
      if (typeof Wllama !== 'function') throw new Error('ตัวรัน wllama ไม่ถูกต้อง');
      var w = new Wllama({ default: CDN + 'wasm/wllama.wasm' }, { parallelDownloads: 1 });
      var threads = self.crossOriginIsolated ? undefined : 1;
      await Promise.race([w.loadModelFromHF({ repo: MODEL.repo, file: MODEL.file }, {
        progressCallback: function (p) {
          if (myGen !== gen) return;
          if (p && p.total > 0) progress = Math.min(100, Math.round(p.loaded / p.total * 100));
          armStall(myGen); emit();
        },
        n_ctx: 2048, n_threads: threads
      }), stalledP]);
      abandon = null;
      if (myGen !== gen) { try { await w.exit(); } catch (e) { /* ปิดไม่สำเร็จ ไม่เป็นไร */ } throw abortErr(); }
      clearTimeout(stallTimer); stallTimer = null;
      wl = w; state = 'ready'; progress = 100;
      clearMarker(); clearInterrupted(); emit();
      return w;
    })().catch(function (e) {
      abandon = null;
      if (e && e.name === 'AbortError') throw e;
      if (!(e && e.stalled)) fail(myGen, friendly(e)); // กรณีค้างได้ตั้งสถานะไว้แล้วใน armStall
      throw e;
    });
    return loading;
  }

  // แปลงรูปแบบข้อความของแอป (contents แบบ Gemini) เป็น messages ของ wllama
  // ข้อความเท่านั้น: รูปภาพถูกข้าม และตัดข้อความเก่าออกเมื่อยาวเกินบริบทของโมเดล
  function toMessages(systemInstruction, contents, maxChars) {
    var msgs = [];
    var sys = String(systemInstruction || '').trim();
    if (sys) msgs.push({ role: 'system', content: sys });
    for (var i = 0; i < (contents || []).length; i++) {
      var c = contents[i] || {};
      var text = (c.parts || []).map(function (p) { return (p && p.text) || ''; }).join('\n').trim();
      if (!text) continue;
      msgs.push({ role: c.role === 'model' ? 'assistant' : 'user', content: text });
    }
    var total = function () { return msgs.reduce(function (n, m) { return n + m.content.length; }, 0); };
    var cap = maxChars || MAX_PROMPT_CHARS;
    while (total() > cap && msgs.length > 2) msgs.splice(sys ? 1 : 0, 1);
    return msgs;
  }

  // ตรวจคำตอบก่อนส่งให้ผู้ใช้ คืนเหตุผลที่ไม่ผ่าน หรือ '' ถ้าผ่าน
  // - บอกชื่อโมเดลหรือบริษัทอื่น  - บล็อกโค้ดไม่ปิด (คำตอบถูกตัดกลางคัน)
  // - บล็อก js ที่ผิดไวยากรณ์ (ตรวจด้วย new Function เฉพาะไวยากรณ์ ไม่รันโค้ด)  - บล็อก json ที่ parse ไม่ได้
  function checkCode(text) {
    var t = String(text || '').trim();
    if (!t) return 'คำตอบว่างเปล่า';
    if (FORBIDDEN_ID.test(t)) return 'คำตอบบอกชื่อโมเดลหรือบริษัทอื่น';
    var fences = t.match(/^\s*```/gm) || [];
    if (fences.length % 2 === 1) return 'บล็อกโค้ดไม่ปิด (อาจถูกตัดความยาว)';
    var re = /```([^\n`]*)\n([\s\S]*?)```/g, m;
    while ((m = re.exec(t))) {
      var lang = m[1].trim().toLowerCase();
      if (lang === 'js' || lang === 'javascript') {
        var why = jsSyntax(m[2]);
        if (why) return why;
      } else if (lang === 'json') {
        try { JSON.parse(m[2]); } catch (e) { return 'JSON ไม่ถูกต้อง'; }
      }
    }
    return '';
  }
  function jsSyntax(body) {
    try { new Function(body); return ''; } catch (e) {
      if (e instanceof SyntaxError) return 'โค้ด JavaScript ผิดไวยากรณ์: ' + e.message;
      return 'ตรวจโค้ดไม่ได้ในสภาพแวดล้อมนี้';
    }
  }

  // ตอบผ่านแอป Android: แอปรันโมเดลและส่งข้อความกลับทีละส่วน ตรวจคำตอบด้วยกติกาเดียวกับ wllama
  async function generateNative(a) {
    if (a.signal && a.signal.aborted) throw abortErr();
    var cap = a.longOut ? LONG_PROMPT_CHARS : NATIVE_PROMPT_CHARS;
    var sysText = (a.systemInstruction ? a.systemInstruction + '\n\n' : '') + CODE_RULES;
    var raw = sysText.length + (a.contents || []).reduce(function (n, c) { return n + (c.parts || []).reduce(function (k, p) { return k + String(p.text || '').length; }, 0); }, 0);
    // longOut ไม่ตัดข้อความเงียบ ๆ: ถ้าเกินเพดานให้แจ้ง error ชัดเจนแทน
    if (a.longOut && raw > cap) throw new Error('ข้อความยาวเกินบริบทของโมเดลในเครื่อง');
    var messages = toMessages(sysText, a.contents, Math.min(a.maxPrompt || MAX_PROMPT_CHARS, cap));
    if (!messages.length) throw new Error('ไม่มีข้อความให้ตอบ');
    var text = '';
    var p = nativeCall('llm.chat', {
      messages: messages,
      maxTokens: Math.min(a.longOut ? LONG_OUT_TOKENS : MAX_OUT_TOKENS, a.maxTokens > 0 ? a.maxTokens : (a.longOut ? LONG_OUT_TOKENS : MAX_OUT_TOKENS)),
      longOut: !!a.longOut,
      temperature: a.temperature != null ? Number(a.temperature) : 0.7
    }, function (m) { if (typeof m.chunk === 'string') text += m.chunk; });
    if (a.signal) a.signal.addEventListener('abort', function () { p.cancel(); });
    try { await p; } catch (e) {
      if (a.signal && a.signal.aborted) throw abortErr();
      throw new Error(nativeFriendly(e));
    }
    if (a.signal && a.signal.aborted) throw abortErr();
    lastUsage = null; // แอปยังไม่ส่งจำนวนโทเคนกลับมาในรูปแบบที่ยืนยันแล้ว
    var why = checkCode(String(text).replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, ''));
    if (why) throw new Error('คำตอบจากโมเดลในเครื่องไม่ผ่านการตรวจ: ' + why);
    var out = typeof cleanResponse === 'function' ? cleanResponse(text) : String(text).trim();
    if (a.onChunk && out) a.onChunk(out);
    return out;
  }

  async function generate(a) {
    a = a || {};
    refreshNative();
    if (!isReady()) throw new Error('โมเดลในเครื่องยังไม่พร้อม');
    if (wl && wl.native) return generateNative(a);
    if (a.signal && a.signal.aborted) throw abortErr();
    var messages = toMessages((a.systemInstruction ? a.systemInstruction + '\n\n' : '') + CODE_RULES, a.contents, a.maxPrompt);
    if (!messages.length) throw new Error('ไม่มีข้อความให้ตอบ');
    var res = await wl.createChatCompletion({
      messages: messages,
      max_tokens: Math.min(MAX_OUT_TOKENS, a.maxTokens > 0 ? a.maxTokens : MAX_OUT_TOKENS),
      temperature: a.temperature != null ? Number(a.temperature) : 0.7,
      top_p: 0.9
    });
    if (a.signal && a.signal.aborted) throw abortErr();
    lastUsage = (res && res.usage) || null; // ถ้าตัวรันให้จำนวนโทเคนมา ใช้ค่านั้น
    var raw = (res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
    // ตรวจก่อนลบรั้วโค้ดของคำตอบ (cleanResponse ตัด ``` หุ้มทั้งคำตอบออก จึงต้องดูข้อความดิบที่ตัด <think> แล้ว)
    var why = checkCode(String(raw).replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, ''));
    if (why) throw new Error('คำตอบจากโมเดลในเครื่องไม่ผ่านการตรวจ: ' + why);
    var text = typeof cleanResponse === 'function' ? cleanResponse(raw) : String(raw).trim();
    if (a.onChunk && text) a.onChunk(text);
    return text;
  }

  // ลบโมเดลออกจากหน่วยความจำและยกเลิกการยินยอม ไฟล์ที่แคชโดยเบราว์เซอร์ยังอยู่จนกว่าจะล้างแคช
  async function forget() {
    gen++; // ทำให้การโหลดที่ค้างอยู่ไม่มีผล
    clearTimeout(stallTimer); stallTimer = null;
    try { if (wl && typeof wl.exit === 'function') await wl.exit(); } catch (e) { /* ปิดไม่สำเร็จ ไม่เป็นไร */ }
    wl = null; loading = null; state = 'off'; progress = 0; lastError = '';
    clearMarker(); clearInterrupted();
    setConsent(false);
    emit();
  }

  // เปิดแท็บ LLM ใน NINO Console (>_) ถ้ายังไม่มีคอนโซล ไม่ทำอะไร
  function panel() {
    try { if (window.ninoConsole && typeof window.ninoConsole.open === 'function') window.ninoConsole.open('llm'); } catch (e) { /* ไม่มีคอนโซล */ }
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  // วาดแผงควบคุมลงในองค์ประกอบที่กำหนด (แท็บ LLM ของคอนโซล) ทำซ้ำได้ ไม่ซ้อน
  function mount(el) {
    if (!el || el.__llmMounted) return;
    el.__llmMounted = true;
    el.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'nc-card';
    var h = document.createElement('h4');
    h.textContent = 'โมเดลภาษาในเครื่อง (ใช้แทน API เมื่อไม่มีคีย์หรือไม่มีอินเทอร์เน็ต)';
    var p = document.createElement('p');
    p.className = 'nc-muted';
    p.style.cssText = 'margin:0 0 8px;line-height:1.5';
    function infoText() {
      return MODEL.name + ' · ประมาณ ' + mb(MODEL.bytes) + ' MB · ต้นทาง ' + MODEL.origin + ' · ใบอนุญาต ' + MODEL.license + '. ' + MODEL.note + ' แนะนำให้ใช้ Wi-Fi';
    }
    p.textContent = infoText();
    var modelBtns = {};
    var modelRow = document.createElement('div');
    modelRow.className = 'nc-row';
    MODELS.forEach(function (m) {
      var mb1 = document.createElement('button');
      mb1.type = 'button';
      mb1.className = 'nc-btn';
      mb1.textContent = m.name + ' · ' + mb(m.bytes) + ' MB';
      mb1.addEventListener('click', function () { setModel(m.id); });
      modelBtns[m.id] = mb1;
      modelRow.appendChild(mb1);
    });
    var modeNote = document.createElement('p');
    modeNote.className = 'nc-muted';
    modeNote.style.cssText = 'margin:0 0 8px;line-height:1.5';
    var modeRow = document.createElement('div');
    modeRow.className = 'nc-row';
    var modeBtns = {};
    function modeBtn(id, label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nc-btn';
      b.textContent = label;
      b.addEventListener('click', function () { setMode(id); });
      modeBtns[id] = b;
      return b;
    }
    modeRow.appendChild(modeBtn('mim', 'โหมด 1: รวมกับมิ้ม'));
    modeRow.appendChild(modeBtn('plain', 'โหมด 2: ปกติ'));
    modeNote.textContent = 'โหมด 1: เมื่อมิ้มไม่รู้คำตอบ โมเดลเรียบเรียงได้เฉพาะจากความรู้ของมิ้มเท่านั้น (100%) ถ้าโมเดลตอบไม่ตรงความรู้ มิ้มจะใช้คำที่สอนไว้โดยตรงแทน หรือตอบว่ายังไม่รู้ ใช้เมื่อเลือกโหมด 1 เท่านั้น · โหมด 2: โมเดลตอบเรื่องทั่วไป แทน API เมื่อไม่มีคีย์ (มิ้มไม่ใช้โหมดนี้)';
    var msg = document.createElement('p');
    msg.className = 'nc-muted';
    msg.style.cssText = 'margin:0 0 8px;min-height:18px';
    var bar = document.createElement('div');
    bar.style.cssText = 'height:8px;border-radius:4px;background:#3A3145;overflow:hidden;margin-bottom:10px;display:none';
    var fill = document.createElement('i');
    fill.style.cssText = 'display:block;height:100%;width:0;background:#F28AB2;transition:width .3s';
    bar.appendChild(fill);
    var row = document.createElement('div');
    row.className = 'nc-row';
    function btn(label, cls, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nc-btn ' + cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    }
    var del = btn('ลบโมเดลออกจากเครื่องนี้', 'dng', function () { forget(); });
    var go = btn('ยืนยันและดาวน์โหลด', 'pri', function () {
      setConsent(true); clearInterrupted();
      load().catch(function () { /* สถานะจะแสดงผ่าน subscribe */ });
    });
    row.appendChild(del); row.appendChild(go);
    wrap.appendChild(h); wrap.appendChild(p); wrap.appendChild(modelRow); wrap.appendChild(modeNote); wrap.appendChild(modeRow); wrap.appendChild(msg); wrap.appendChild(bar); wrap.appendChild(row);
    el.appendChild(wrap);

    function render(s) {
      Object.keys(modeBtns).forEach(function (id) { modeBtns[id].classList.toggle('pri', s.mode === id); });
      Object.keys(modelBtns).forEach(function (id) {
        modelBtns[id].classList.toggle('pri', s.model.id === id);
        modelBtns[id].disabled = s.state === 'downloading';
      });
      p.textContent = infoText();
      fill.style.width = s.progress + '%';
      var busy = s.state === 'downloading';
      bar.style.display = busy || s.state === 'ready' ? 'block' : 'none';
      go.style.display = s.state === 'ready' || busy ? 'none' : '';
      go.textContent = s.state === 'error' ? 'ลองดาวน์โหลดอีกครั้ง' : 'ยืนยันและดาวน์โหลด';
      go.disabled = !!s.memoryReason;
      del.style.display = s.consented || s.state === 'ready' || s.state === 'error' ? '' : 'none';
      if (s.memoryReason) msg.textContent = s.memoryReason;
      else if (s.state === 'downloading') msg.textContent = 'กำลังดาวน์โหลด ' + s.progress + '%';
      else if (s.state === 'ready') msg.textContent = 'พร้อมใช้งานแล้ว (ใช้แทน API เมื่อไม่มีคีย์)';
      else if (s.state === 'error') msg.textContent = 'โหลดไม่สำเร็จ: ' + (s.error || '');
      else if (s.interrupted) msg.textContent = 'การโหลดครั้งก่อนไม่สำเร็จ (แอปอาจปิดระหว่างโหลด) ระบบจะไม่โหลดเองจนกว่าคุณจะกดลองอีกครั้ง';
      else msg.textContent = s.consented ? 'ยืนยันแล้ว กำลังเตรียม' : '';
    }
    var unsub = subscribe(function (s) {
      if (!el.isConnected) { unsub(); el.__llmMounted = false; return; }
      render(s);
    });
    render(status());
  }

  window.NINOLocalLLM = {
    CDN: CDN,
    status: status,
    lastUsage: function () { return lastUsage; },
    subscribe: subscribe,
    isReady: isReady,
    activeBackend: function () { return MODEL && MODEL.backend; },
    consented: consented,
    mode: mode,
    setMode: setMode,
    interrupted: interrupted,
    canAutoLoad: canAutoLoad,
    load: load,
    generate: generate,
    checkCode: checkCode,
    CODE_RULES: CODE_RULES,
    forget: forget,
    setModel: setModel,
    MODELS: MODELS,
    panel: panel,
    mount: mount,
    toMessages: toMessages
  };
  // MODEL เปลี่ยนได้ด้วย setModel จึงอ่านค่าปัจจุบันทุกครั้ง
  Object.defineProperty(window.NINOLocalLLM, 'MODEL', { get: function () { return MODEL; } });
  Object.defineProperty(window.NINOLocalLLM, 'stallMs', {
    get: function () { return stallMs; },
    set: function (v) { if (typeof v === 'number' && v > 0) stallMs = v; }
  });
})();
