/* NINO | โมเดลภาษาในเครื่อง (ทางสำรองเมื่อไม่มี API Key หรือไม่มีอินเทอร์เน็ต)
 * - ใช้เฉพาะแชตโค้ดและโรลเพลย์ของแอป ไม่ใช้กับมิ้มและพี่นาเดียร์ (mim/mim.js ส่ง noLocal ให้พี่นาเดียร์เสมอ)
 * - โมเดลเดียว: SmolLM2-135M-Instruct Q2_K (88,202,080 ไบต์ ประมาณ 88 MB) จาก Hugging Face
 * - ปุ่มโหลดอยู่ใน NINO Console (>_) แท็บ LLM ผู้ใช้ต้องกดยืนยันก่อนดาวน์โหลดทุกครั้ง ยกเลิกได้ด้วยการลบโมเดล
 * - ความปลอดภัยการโหลด (ตามแนวทางที่ใช้ได้จริงบนมือถือ):
 *     1) ตั้งเครื่องหมายก่อนโหลด ถ้าแอปปิดกลางคัน รอบถัดไปจะจำว่าโหลดไม่สำเร็จ และจะไม่โหลดเองจนกว่าผู้ใช้จะกดเอง
 *     2) ถ้าดาวน์โหลดค้างโดยไม่มีความคืบหน้านานเกิน stallMs ระบบจะยกเลิกการรอและแจ้งผู้ใช้
 *     3) เครื่องที่มี RAM น้อยกว่า 2 GB (ถ้าเบราว์เซอร์บอก) จะไม่เริ่มโหลด
 * - ตัวรัน wllama (llama.cpp WASM) ปักเวอร์ชันบน jsdelivr ไม่มี COOP/COEP จึงรันเธรดเดียว (n_threads = 1)
 * - ยังไม่ได้ทดสอบโมเดลจริงบนมือถือ: ชุดทดสอบใช้ตัวปลอมของ wllama
 */
(function () {
  'use strict';
  var WLLAMA_VERSION = '3.8.1'; // เผยแพร่ 2026-10-02 (เก่ากว่า 2 สัปดาห์)
  var CDN = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@' + WLLAMA_VERSION + '/esm/';
  var MODEL = {
    id: 'q2_k',
    name: 'SmolLM2 135M Instruct (Q2_K)',
    repo: 'bartowski/SmolLM2-135M-Instruct-GGUF',
    file: 'SmolLM2-135M-Instruct-Q2_K.gguf',
    bytes: 88202080,
    license: 'apache-2.0',
    origin: 'HuggingFaceTB/SmolLM2-135M-Instruct'
  };
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
    return {
      state: state, progress: progress, error: lastError,
      consented: consented(), interrupted: interrupted(), model: MODEL, mode: mode(),
      memoryReason: memoryReason()
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
  function load() {
    if (isReady()) return Promise.resolve(wl);
    if (loading) return loading;
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
  function toMessages(systemInstruction, contents) {
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
    while (total() > MAX_PROMPT_CHARS && msgs.length > 2) msgs.splice(sys ? 1 : 0, 1);
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

  async function generate(a) {
    a = a || {};
    if (!isReady()) throw new Error('โมเดลในเครื่องยังไม่พร้อม');
    if (a.signal && a.signal.aborted) throw abortErr();
    var messages = toMessages((a.systemInstruction ? a.systemInstruction + '\n\n' : '') + CODE_RULES, a.contents);
    if (!messages.length) throw new Error('ไม่มีข้อความให้ตอบ');
    var res = await wl.createChatCompletion({
      messages: messages,
      max_tokens: MAX_OUT_TOKENS,
      temperature: a.temperature != null ? Number(a.temperature) : 0.7,
      top_p: 0.9
    });
    if (a.signal && a.signal.aborted) throw abortErr();
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
    p.textContent = MODEL.name + ' · ประมาณ ' + mb(MODEL.bytes) + ' MB · ต้นทาง ' + MODEL.origin + ' · ใบอนุญาต ' + MODEL.license +
      '. โมเดลมีพารามิเตอร์ประมาณ 135 ล้าน จึงตอบได้จำกัดมาก โดยเฉพาะภาษาไทยและงานโค้ดที่ซับซ้อน และรันช้ากว่า API มาก. แนะนำให้ใช้ Wi-Fi';
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
    wrap.appendChild(h); wrap.appendChild(p); wrap.appendChild(modeNote); wrap.appendChild(modeRow); wrap.appendChild(msg); wrap.appendChild(bar); wrap.appendChild(row);
    el.appendChild(wrap);

    function render(s) {
      Object.keys(modeBtns).forEach(function (id) { modeBtns[id].classList.toggle('pri', s.mode === id); });
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
    MODEL: MODEL,
    CDN: CDN,
    status: status,
    subscribe: subscribe,
    isReady: isReady,
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
    panel: panel,
    mount: mount,
    toMessages: toMessages
  };
  Object.defineProperty(window.NINOLocalLLM, 'stallMs', {
    get: function () { return stallMs; },
    set: function (v) { if (typeof v === 'number' && v > 0) stallMs = v; }
  });
})();
