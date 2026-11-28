/* NINO · ศูนย์กลาง LLM (llm-hub)
 *
 * ห่อ geminiGenerate ชั้นนอกสุด (โหลดเป็นสคริปต์สุดท้าย) จึงเห็นทุกการเรียก และตัดสินเส้นทางได้ที่จุดเดียว
 *   ทาง 'auto' (ค่าเดิม): API ก่อนถ้ามีคีย์ ไม่มีจึงใช้โมเดลในเครื่องเมื่อส่ง localOk (ส่งต่อให้ห่วงโซ่เดิมทั้งหมด)
 *   ทาง 'api'  : API หรือ Local AI เท่านั้น โมเดลในเครื่องถูกปิด ไม่มีคีย์ = ไม่ตอบ (ฝั่งมิ้มรับช่วงต่อ)
 *   ทาง 'model': โมเดลในเครื่องเท่านั้น API ถูกปิดชั่วคราว ต้องยินยอมและโหลดก่อน
 *   พี่นาเดียร์ (noLocal) ใช้ API เสมอ ตามเดิม
 * ความเร็ว: คิวอนุกรมให้โมเดลตัวเดียว · อุ่นเครื่องหลังโหลด · แคชคำตอบที่อุณหภูมิต่ำ (ในหน่วยความจำ) ·
 *   พรีเซ็ต "เร็ว" ตัดความยาวคำตอบและบริบท (มีผลกับโมเดลในเครื่อง)
 * บันทึก: ทุกการเรียกเก็บเฉพาะข้อมูลวัดผล (เวลา ทาง โทเคนโดยประมาณ ผลสำเร็จ) ไม่เก็บข้อความ ไว้ที่ nino.llm.log
 * ไม่แตะความจำของมิ้ม/นาเดียร์ และไม่ใช้คีย์เก็บความจำของแอป
 */
(function () {
  'use strict';
  var KEY_ROUTE = 'nino.llm.route';
  var KEY_PRESET = 'nino.llm.preset';
  var KEY_LOG = 'nino.llm.log';
  var LOG_MAX = 80;
  var CACHE_MAX = 30, CACHE_TTL = 10 * 60 * 1000, CACHE_TEMP = 0.2;
  var ROUTES = { auto: 'อัตโนมัติ', api: 'API อย่างเดียว', model: 'โมเดลในเครื่องอย่างเดียว' };
  var ROUTE_HELP = {
    auto: 'ใช้ API ก่อนถ้ามีคีย์ ถ้าไม่มีจึงใช้โมเดลในเครื่อง (ค่าเดิมของแอป)',
    api: 'ใช้ API หรือ Local AI เท่านั้น โมเดลในเครื่องถูกปิด ถ้าไม่มีคีย์ แชตจะไม่ตอบ และส่วนที่มิ้มรองรับจะตอบแทน',
    model: 'ใช้โมเดลในเครื่องเท่านั้น API ถูกปิดชั่วคราว ต้องยินยอมและโหลดโมเดลก่อน'
  };
  var PRESETS = {
    normal: { label: 'ปกติ', maxOut: 512, maxPrompt: 6000, help: 'คำตอบยาวและบริบทเต็ม ช้ากว่า' },
    fast: { label: 'เร็ว', maxOut: 200, maxPrompt: 1800, help: 'คำตอบสั้นและบริบทสั้น ตอบไวขึ้นมาก (มีผลกับโมเดลในเครื่อง)' }
  };

  // เพดานของ longOut (ห้องเรียนบนแอป Android กับโมเดล native เท่านั้น ดู runModel)
  var LONG_MAX_OUT = 1536, LONG_MAX_PROMPT = 8000;
  var prev = window.geminiGenerate; // ห่วงโซ่เดิม: ตัวบริดจ์ Local AI และตัวกรองอื่นอยู่ข้างใน
  var queue = Promise.resolve();    // โมเดลตัวเดียว: เรียกทีละงาน
  var listeners = [];
  var cache = [];
  var ring = loadLog();
  var warmedFor = '', warmMs = 0, lastRec = null, lastCheck = null;

  function rd(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function wr(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ไม่มีที่เก็บ ใช้ค่าเดิมในหน่วยความจำ */ } }
  function L() { return window.NINOLocalLLM || null; }
  function est(t) { return Math.ceil(String(t || '').length / 2.2); }
  function short(e) { return String((e && e.message) || e || '').slice(0, 120); }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) { /* ผู้ฟังพัง ไม่ลามไปยังผู้เรียก */ } }); }

  function route() { var v = rd(KEY_ROUTE, 'auto'); return ROUTES[v] ? v : 'auto'; }
  function setRoute(v) { if (!ROUTES[v]) return false; wr(KEY_ROUTE, v); emit(); return true; }
  function preset() { var v = rd(KEY_PRESET, 'normal'); return PRESETS[v] ? v : 'normal'; }
  function setPreset(v) { if (!PRESETS[v]) return false; wr(KEY_PRESET, v); emit(); return true; }

  function hasApi() { try { return typeof providerHasKey === 'function' && !!providerHasKey(getCfg()); } catch (e) { return false; } }
  function providerKind() { try { return getCfg().provider || 'gemini'; } catch (e) { return 'gemini'; } }
  function apiName() { try { return providerLabel(getCfg().provider); } catch (e) { return 'API'; } }
  function modelReady() { var m = L(); return !!(m && m.isReady()); }
  function modelOn() { var m = L(); return !!(m && (m.isReady() || m.consented())); }

  // เลือกทางของการเรียกหนึ่งครั้ง
  function pick(a) {
    var r = route();
    if (a.noLocal) return { kind: 'prev' };
    if (r === 'model') {
      return modelOn() ? { kind: 'model' }
        : { kind: 'off', why: 'โหมดโมเดลในเครื่องยังไม่พร้อม (ยังไม่ยินยอมหรือยังไม่โหลด) เปิดแท็บ LLM ใน >_' };
    }
    if (r === 'api') {
      return hasApi() ? { kind: 'prev' }
        : { kind: 'off', why: 'โหมด API ยังไม่มี API Key (โมเดลในเครื่องถูกปิดในโหมดนี้)' };
    }
    // อัตโนมัติ: ถ้ามีคีย์ใช้ห่วงโซ่เดิม ถ้าไม่มีและโมเดลพร้อมและผู้เรียกส่ง localOk จึงใช้โมเดลผ่านคิว
    if (!hasApi() && a.localOk && modelReady()) return { kind: 'model' };
    return { kind: 'prev' };
  }

  function describeNow() {
    var r = route();
    if (r === 'model') return modelOn() ? 'โมเดลในเครื่อง (API ถูกปิด)' : 'โมเดลในเครื่องยังไม่พร้อม แชตจะไม่ตอบ';
    if (r === 'api') return hasApi() ? 'API (' + apiName() + ') · โมเดลถูกปิด' : 'ไม่มี API Key · โมเดลถูกปิด จะไม่มีคำตอบจาก LLM';
    if (hasApi()) return 'API (' + apiName() + ') · โมเดลเป็นทางสำรองเมื่อไม่มีคีย์';
    return modelReady() ? 'ไม่มีคีย์ → โมเดลในเครื่อง' : 'ไม่มีคีย์และโมเดลยังไม่พร้อม จะไม่มีคำตอบจาก LLM';
  }

  function enqueue(job) {
    var p = queue.then(function () { return job(); });
    queue = p.catch(function () { /* ความล้มเหลวของงานหนึ่งไม่ทำให้คิวค้าง */ });
    return p;
  }

  // ---- แคชคำตอบที่อุณหภูมิต่ำ (ในหน่วยความจำเท่านั้น หายเมื่อปิดแอป)
  function cacheKey(req, id, p) {
    return [id, p, req.systemInstruction || '', JSON.stringify(req.contents || []), req.temperature, req.maxTokens].join('|');
  }
  function cacheGet(k) {
    var now = Date.now();
    cache = cache.filter(function (e) { return now - e.t < CACHE_TTL; });
    for (var i = 0; i < cache.length; i++) if (cache[i].k === k) return cache[i].text;
    return null;
  }
  function cachePut(k, text) {
    cache.push({ k: k, text: text, t: Date.now() });
    if (cache.length > CACHE_MAX) cache.shift();
  }

  // ---- โมเดลในเครื่องผ่านคิว: โหลดตามต้องการ แคช อุณหภูมิต่ำ และพรีเซ็ต
  function runModel(a, meta) {
    var m = L();
    if (!m) return Promise.reject(new Error('ยังไม่ได้ต่อโมเดลในเครื่อง'));
    var P = PRESETS[preset()];
    // longOut (ห้องเรียนในแอป Android เท่านั้น): เพดานคำตอบและบริบทสูงขึ้นสำหรับโมเดล native เท่านั้น
    var longOut = !!a.longOut && typeof m.activeBackend === 'function' && m.activeBackend() === 'native';
    var maxOut = longOut ? LONG_MAX_OUT : P.maxOut;
    var req = {
      systemInstruction: a.systemInstruction,
      contents: a.contents,
      temperature: a.temperature,
      maxTokens: Math.min(a.maxTokens > 0 ? a.maxTokens : maxOut, maxOut),
      maxPrompt: longOut ? LONG_MAX_PROMPT : P.maxPrompt,
      longOut: longOut,
      onChunk: a.onChunk,
      signal: a.signal
    };
    var cacheable = req.temperature != null && Number(req.temperature) <= CACHE_TEMP;
    var key = cacheKey(req, m.MODEL.id, preset());
    if (cacheable) {
      var hit = cacheGet(key);
      if (hit != null) {
        meta.cached = true;
        meta.tokens = est(hit);
        if (req.onChunk) req.onChunk(hit);
        return Promise.resolve(hit);
      }
    }
    return enqueue(function () {
      var ready = m.isReady() ? Promise.resolve() : m.load();
      return ready.then(function () { return m.generate(req); }).then(function (text) {
        var u = m.lastUsage && m.lastUsage();
        meta.tokens = (u && u.completion_tokens) || est(text);
        if (cacheable) cachePut(key, text);
        return text;
      });
    });
  }

  // ---- อุ่นเครื่อง: ตอบสั้นหนึ่งครั้งหลังโมเดลพร้อม ทำให้คำตอบจริงครั้งแรกไม่ต้องเสียเวลาเริ่มทำงาน
  function warmup() {
    var m = L();
    if (!m || !m.isReady() || warmedFor === m.MODEL.id) return;
    warmedFor = m.MODEL.id;
    var t0 = performance.now();
    enqueue(function () {
      return m.generate({ systemInstruction: 'ตอบสั้นๆ', contents: [{ role: 'user', parts: [{ text: 'ok' }] }], temperature: 0.1, maxTokens: 4, maxPrompt: 200 });
    }).then(function () {
      warmMs = Math.round(performance.now() - t0);
      record({ kind: 'warmup', backend: 'model', route: route(), preset: preset(), ok: true, ms: warmMs, ttft: warmMs, tokens: 0, tps: 0, cached: false, err: '' });
    }, function (e) {
      warmedFor = '';
      record({ kind: 'warmup', backend: 'model', route: route(), preset: preset(), ok: false, ms: Math.round(performance.now() - t0), ttft: 0, tokens: 0, tps: 0, cached: false, err: short(e) });
    });
  }

  // ---- บันทึกและสถิติ
  function loadLog() {
    try { var a = JSON.parse(localStorage.getItem(KEY_LOG) || '[]'); return Array.isArray(a) ? a.slice(-LOG_MAX) : []; }
    catch (e) { return []; }
  }
  function saveLog() { wr(KEY_LOG, JSON.stringify(ring.slice(-LOG_MAX))); }
  function record(e) {
    e.t = Date.now();
    ring.push(e);
    if (ring.length > LOG_MAX) ring.splice(0, ring.length - LOG_MAX);
    saveLog();
    lastRec = e;
    emit();
  }
  function clearLog() { ring = []; saveLog(); emit(); }
  function stats() {
    var calls = ring.filter(function (e) { return e.kind === 'call'; });
    var ok = calls.filter(function (e) { return e.ok; });
    var ms = ok.map(function (e) { return e.ms; }).sort(function (x, y) { return x - y; });
    function pct(p) { return ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] : 0; }
    var mdl = ok.filter(function (e) { return e.backend === 'model' && !e.cached && e.tokens && e.ms; });
    var tps = mdl.length ? mdl.reduce(function (s, e) { return s + e.tokens / (e.ms / 1000); }, 0) / mdl.length : 0;
    return {
      calls: calls.length, ok: ok.length, fail: calls.length - ok.length,
      p50: pct(0.5), p95: pct(0.95), tps: Math.round(tps * 10) / 10,
      cached: calls.filter(function (e) { return e.cached; }).length, warmMs: warmMs
    };
  }

  // ---- ตัวห่อ geminiGenerate
  function wrapped(a) {
    a = a || {};
    var k = pick(a);
    var meta = { tokens: 0, cached: false };
    var backend = k.kind === 'model' ? 'model' : k.kind === 'off' ? 'none'
      : (hasApi() ? (providerKind() === 'local' ? 'local-ai' : 'api') : 'model');
    var rec = { kind: 'call', backend: backend, route: route(), preset: preset(), cached: false, ok: false, ms: 0, ttft: 0, tokens: 0, tps: 0, err: '' };
    var t0 = performance.now(), first = 0;
    // สำคัญ: ห้ามเพิ่ม onChunk ถ้าผู้เรียกไม่ได้ส่งมา เพราะห่วงโซ่ API จะเปลี่ยนไปใช้ endpoint สตรีมทันที
    var b = Object.assign({}, a);
    if (typeof a.onChunk === 'function') {
      var user = a.onChunk;
      b.onChunk = function (t) { if (!first && t) first = performance.now(); user(t); };
    }
    var p;
    if (k.kind === 'off') p = Promise.reject(new Error(k.why));
    else if (k.kind === 'model') p = runModel(b, meta);
    else p = prev.apply(window, [b]);

    function fin(text, err) {
      rec.ms = Math.round(performance.now() - t0);
      rec.ttft = first ? Math.round(first - t0) : rec.ms;
      rec.cached = meta.cached;
      rec.ok = !err;
      rec.err = err ? short(err) : '';
      rec.tokens = meta.tokens || (text ? est(text) : 0);
      rec.tps = rec.tokens && rec.ms && backend === 'model' && !meta.cached ? Math.round(rec.tokens / (rec.ms / 1000) * 10) / 10 : 0;
      record(rec);
    }
    return p.then(function (text) { fin(text, null); return text; }, function (e) { fin(null, e); throw e; });
  }
  window.geminiGenerate = wrapped;

  // ---- ตรวจระบบ: ผลจริง ไม่ใช่การเดา
  async function check() {
    var out = [];
    function add(name, ok, detail, ms) { out.push({ name: name, ok: !!ok, detail: detail || '', ms: ms || 0 }); }
    add('WebAssembly', typeof WebAssembly === 'object', typeof WebAssembly === 'object' ? 'รองรับ' : 'ไม่รองรับ รันโมเดลในเครื่องไม่ได้');
    var dm = navigator.deviceMemory;
    add('หน่วยความจำเครื่อง', !dm || dm >= 2, dm ? dm + ' GB' + (dm < 2 ? ' (ต่ำกว่า 2 GB โมเดลจะไม่เริ่ม)' : '') : 'ไม่ระบุ (เบราว์เซอร์ไม่บอก)');
    add('เธรดหลายตัว', true, self.crossOriginIsolated ? 'เปิด (เร็วกว่า)' : 'ปิด เธรดเดียว (ปกติของแอปนี้ ไม่ใช่ข้อผิดพลาด)');
    add('เครือข่าย', navigator.onLine !== false, navigator.onLine === false ? 'ออฟไลน์' : 'ออนไลน์');

    var c = getCfg();
    if (!hasApi()) add('API', false, 'ไม่มี API Key (ผู้ให้บริการ: ' + apiName() + ')');
    else if (c.provider === 'gemini' && typeof testModel === 'function') {
      var t1 = performance.now();
      var r = await testModel(c.apiKey, c.model).catch(function () { return { ok: false }; });
      add('API Gemini', r && r.ok, r && r.ok ? 'คีย์ใช้ได้ · ' + c.model : 'คีย์ไม่ได้ผลหรือเครือข่ายขัดข้อง', Math.round(performance.now() - t1));
    } else if (c.provider === 'local' && window.ninoLocal && window.ninoLocal.endpoint) {
      var t2 = performance.now();
      try { var pg = await window.ninoLocal.endpoint.ping(); add('Local AI', true, 'ตอบกลับ · ' + (pg.ids || []).length + ' โมเดล', Math.round(performance.now() - t2)); }
      catch (e) { add('Local AI', false, short(e), Math.round(performance.now() - t2)); }
    } else add('API', true, apiName() + ' · ยังไม่ทดสอบเครือข่ายสำหรับผู้ให้บริการนี้');

    var m = L();
    if (!m) add('โมเดลในเครื่อง', false, 'ไม่ได้โหลดโมดูล');
    else {
      var s = m.status();
      add('ยินยอมโหลดโมเดล', s.consented, s.consented ? 'ยินยอมแล้ว: ' + s.model.name : 'ยังไม่ยินยอม (กดยืนยันในแท็บ LLM)');
      var mem = s.memoryReason ? ' · ' + s.memoryReason : '';
      add('โมเดลพร้อม', s.state === 'ready', 'สถานะ: ' + s.state + (s.error ? ' · ' + s.error : '') + mem);
      if (s.state === 'ready') {
        var t3 = performance.now();
        var res = await enqueue(function () {
          return m.generate({ systemInstruction: 'ตอบสั้นๆ', contents: [{ role: 'user', parts: [{ text: 'ตอบคำเดียวว่า พร้อม' }] }], temperature: 0.1, maxTokens: 8, maxPrompt: 300 });
        }).then(function (t) { return { ok: !!t, text: t }; }, function (e) { return { ok: false, text: short(e) }; });
        add('ทดสอบตอบจริง (โมเดล)', res.ok, res.ok ? 'ตอบได้: ' + String(res.text).slice(0, 40) : 'ไม่ตอบ: ' + res.text, Math.round(performance.now() - t3));
      } else add('ทดสอบตอบจริง (โมเดล)', false, 'ข้าม: โมเดลยังไม่พร้อม');
    }

    add('เส้นทางตอนนี้', true, describeNow());
    var st = stats();
    add('สถิติ log', true, st.calls + ' ครั้ง · สำเร็จ ' + st.ok + ' · ค่ากลาง ' + st.p50 + ' ms · p95 ' + st.p95 + ' ms');
    lastCheck = { t: Date.now(), items: out };
    emit();
    return out;
  }

  // ---- หน้าจอ (วาดในแท็บ LLM ของคอนโซล)
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function timeOf(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); }
  function mount(host) {
    if (!host || host.__hubMounted) return;
    host.__hubMounted = true;

    var card1 = el('div', 'nc-card');
    card1.appendChild(el('h4', null, 'เส้นทาง LLM (API กับโมเดลในเครื่อง)'));
    var nowLine = el('p', 'nc-muted', '');
    nowLine.style.cssText = 'margin:0 0 6px;line-height:1.5';
    var routeRow = el('div', 'nc-row');
    var routeBtns = {};
    Object.keys(ROUTES).forEach(function (id) {
      var b = el('button', 'nc-btn', ROUTES[id]);
      b.type = 'button';
      b.addEventListener('click', function () { setRoute(id); });
      routeBtns[id] = b;
      routeRow.appendChild(b);
    });
    var routeHelp = el('p', 'nc-muted', '');
    routeHelp.style.cssText = 'margin:6px 0 0;line-height:1.5';
    card1.appendChild(nowLine); card1.appendChild(routeRow); card1.appendChild(routeHelp);

    var card2 = el('div', 'nc-card');
    card2.appendChild(el('h4', null, 'ความเร็ว'));
    var presetRow = el('div', 'nc-row');
    var presetBtns = {};
    Object.keys(PRESETS).forEach(function (id) {
      var b = el('button', 'nc-btn', PRESETS[id].label);
      b.type = 'button';
      b.addEventListener('click', function () { setPreset(id); });
      presetBtns[id] = b;
      presetRow.appendChild(b);
    });
    var presetHelp = el('p', 'nc-muted', '');
    presetHelp.style.cssText = 'margin:6px 0 0;line-height:1.5';
    card2.appendChild(presetRow); card2.appendChild(presetHelp);

    var card3 = el('div', 'nc-card');
    card3.appendChild(el('h4', null, 'ทดลองถาม'));
    var input = el('textarea', null, '');
    input.rows = 2;
    input.placeholder = 'พิมพ์คำถามทดสอบ แล้วกดส่ง';
    input.style.cssText = 'width:100%;box-sizing:border-box;font-size:16px;border-radius:8px;padding:8px;background:#14111A;color:#FBF7FD;border:1px solid #3A3145';
    var sendBtn = el('button', 'nc-btn pri', 'ส่งทดลอง');
    sendBtn.type = 'button';
    var answer = el('div', null, '');
    answer.style.cssText = 'white-space:pre-wrap;margin-top:8px;line-height:1.5';
    var metric = el('p', 'nc-muted', '');
    metric.style.cssText = 'margin:6px 0 0';
    card3.appendChild(input); card3.appendChild(sendBtn); card3.appendChild(answer); card3.appendChild(metric);
    sendBtn.addEventListener('click', async function () {
      var text = input.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      answer.textContent = '...กำลังตอบ';
      metric.textContent = '';
      try {
        var out = await window.geminiGenerate({
          systemInstruction: 'ตอบเป็นภาษาไทย กระชับ', contents: [{ role: 'user', parts: [{ text: text }] }],
          localOk: true, temperature: 0.7
        });
        answer.textContent = out;
      } catch (e) {
        answer.textContent = 'ตอบไม่ได้: ' + short(e);
      } finally {
        sendBtn.disabled = false;
        var r = lastRec || {};
        metric.textContent = 'ทาง ' + (r.backend || '-') + ' · ' + (r.ms || 0) + ' ms' +
          (r.cached ? ' · จากแคช' : '') + (r.tokens ? ' · ~' + r.tokens + ' โทเคน' : '') + (r.backend === 'model' && !r.cached ? ' · โมเดลในเครื่องแสดงผลตอนจบ' : '');
      }
    });

    var card4 = el('div', 'nc-card');
    card4.appendChild(el('h4', null, 'ตรวจระบบ'));
    var checkBtn = el('button', 'nc-btn pri', 'ตรวจระบบ');
    checkBtn.type = 'button';
    var checkOut = el('div', null, '');
    checkOut.style.cssText = 'margin-top:8px;line-height:1.6;font-size:13px';
    checkBtn.addEventListener('click', async function () {
      checkBtn.disabled = true;
      checkOut.textContent = '...กำลังตรวจ';
      try { await check(); } catch (e) { checkOut.textContent = 'ตรวจไม่สำเร็จ: ' + short(e); }
      checkBtn.disabled = false;
      paintCheck();
    });
    card4.appendChild(checkBtn); card4.appendChild(checkOut);

    var card5 = el('div', 'nc-card');
    card5.appendChild(el('h4', null, 'ความเร็วและ log'));
    var statLine = el('p', 'nc-muted', '');
    statLine.style.cssText = 'margin:0 0 6px;line-height:1.5';
    var logBox = el('div', null, '');
    logBox.style.cssText = 'font-size:12px;line-height:1.6;font-family:ui-monospace,Menlo,Consolas,monospace;max-height:260px;overflow:auto;white-space:pre-wrap';
    var logRow = el('div', 'nc-row');
    var clearBtn = el('button', 'nc-btn dng', 'ล้าง log');
    clearBtn.type = 'button';
    clearBtn.addEventListener('click', function () { clearLog(); });
    var copyBtn = el('button', 'nc-btn', 'คัดลอก log (JSON)');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', function () {
      var txt = JSON.stringify(ring, null, 1);
      try { navigator.clipboard.writeText(txt); copyBtn.textContent = 'คัดลอกแล้ว'; }
      catch (e) { copyBtn.textContent = 'คัดลอกไม่ได้ เลือกข้อความจาก log แทน'; }
    });
    logRow.appendChild(clearBtn); logRow.appendChild(copyBtn);
    card5.appendChild(statLine); card5.appendChild(logBox); card5.appendChild(logRow);

    host.appendChild(card1); host.appendChild(card2); host.appendChild(card3); host.appendChild(card4); host.appendChild(card5);
    if (window.ninoRosterUI) ninoRosterUI.mount(host); // โมเดลที่เปิดพร้อมกัน (js/llm-roster-ui.js)

    function paintCheck() {
      if (!lastCheck) return;
      checkOut.innerHTML = '';
      lastCheck.items.forEach(function (it) {
        var row = el('div', null, (it.ok ? '✓ ' : '✗ ') + it.name + (it.ms ? ' (' + it.ms + ' ms)' : '') + ' · ' + it.detail);
        row.style.color = it.ok ? '#8FD3B0' : '#F26D78';
        checkOut.appendChild(row);
      });
      checkOut.appendChild(el('div', 'nc-muted', 'ตรวจเมื่อ ' + timeOf(lastCheck.t)));
    }
    function paint() {
      if (!host.isConnected) { unsub(); host.__hubMounted = false; return; }
      var r = route(), p = preset();
      nowLine.textContent = 'ตอนนี้จะใช้: ' + describeNow();
      Object.keys(routeBtns).forEach(function (id) { routeBtns[id].classList.toggle('pri', r === id); });
      routeHelp.textContent = ROUTE_HELP[r];
      Object.keys(presetBtns).forEach(function (id) { presetBtns[id].classList.toggle('pri', p === id); });
      presetHelp.textContent = PRESETS[p].label + ': ' + PRESETS[p].help + ' · ตอบสูงสุด ' + PRESETS[p].maxOut + ' โทเคน · บริบท ' + PRESETS[p].maxPrompt + ' ตัวอักษร';
      var st = stats();
      statLine.textContent = 'เรียก ' + st.calls + ' ครั้ง · สำเร็จ ' + st.ok + ' · ล้มเหลว ' + st.fail +
        ' · ค่ากลาง ' + st.p50 + ' ms · p95 ' + st.p95 + ' ms' +
        (st.tps ? ' · โมเดลในเครื่อง ~' + st.tps + ' โทเคน/วินาที (ประมาณ)' : '') +
        ' · จากแคช ' + st.cached + (st.warmMs ? ' · อุ่นเครื่อง ' + st.warmMs + ' ms' : '');
      logBox.textContent = ring.length ? ring.slice().reverse().slice(0, 40).map(function (e) {
        return timeOf(e.t) + ' ' + (e.kind === 'warmup' ? 'อุ่นเครื่อง' : e.backend) + ' · ' + e.route + ' · ' +
          (e.ok ? 'สำเร็จ' : 'ล้มเหลว') + ' · ' + e.ms + ' ms' + (e.ttft && e.ttft !== e.ms ? ' (แรก ' + e.ttft + ')' : '') +
          (e.tokens ? ' · ~' + e.tokens + ' โทเคน' : '') + (e.cached ? ' · แคช' : '') + (e.err ? ' · ' + e.err : '');
      }).join('\n') : 'ยังไม่มีการเรียก';
    }
    var unsub = subscribe(paint);
    paint();
    paintCheck();
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  // โมเดลพร้อมเมื่อไรให้อุ่นเครื่อง
  (function hookModel() {
    var m = L();
    if (m && typeof m.subscribe === 'function') m.subscribe(function (s) { if (s.state === 'ready') warmup(); emit(); });
  })();

  window.ninoLLMHub = {
    route: route, setRoute: setRoute, ROUTES: ROUTES,
    preset: preset, setPreset: setPreset, PRESETS: PRESETS,
    pick: pick, describeNow: describeNow,
    check: check, stats: stats, log: function () { return ring.slice(); }, clearLog: clearLog,
    warmup: warmup, mount: mount,
    cacheSize: function () { return cache.length; }
  };
})();
