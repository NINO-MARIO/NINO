(function () {
  'use strict';
  var K = 'nino.delegate.stats', WIN = 128000, PROMPT_CAP = 96000, MAX_FILES = 8, TIMEOUT = 120000;
  var SECRET = /ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_\-]{35}|sk-[A-Za-z0-9]{32,}|tm_(?:test|live)_[A-Za-z0-9_\-]{20,}/;
  var SYS = 'You are a careful assistant doing one small, self-contained job. You know nothing beyond this message. ' +
    'Do exactly what the task says and nothing more. Never invent file contents. ' +
    'If information is missing, reply with one line starting with NEED_INFO: and say what is missing. ' +
    'Reply in the language of the task. Put code in fenced blocks.';

  function S() { return typeof session !== 'undefined' ? session : null; }
  function ok(r) { return { ok: true, result: r, error: null }; }
  function bad(e) { return { ok: false, result: null, error: e }; }

  function est(s) {
    s = String(s || '');
    var ascii = 0, other = 0, i;
    for (i = 0; i < s.length; i++) { if (s.charCodeAt(i) < 128) ascii++; else other++; }
    return Math.ceil(ascii / 4 + other / 1.5);
  }

  function stats(add) {
    var o = { n: 0, inTok: 0, outTok: 0 };
    try { o = Object.assign(o, JSON.parse(localStorage.getItem(K) || '{}')); } catch (e) { }
    if (add) {
      o.n += 1; o.inTok += add.inTok || 0; o.outTok += add.outTok || 0;
      try { localStorage.setItem(K, JSON.stringify(o)); } catch (e) { }
    }
    return o;
  }

  function pick(a) {
    var c = typeof getCfg === 'function' ? getCfg() : {};
    var want = String(a.provider || '').toLowerCase();
    var order = want === 'tokenme' ? ['tokenme', '9arm'] : ['9arm', 'tokenme'];
    for (var i = 0; i < order.length; i++) {
      var p = order[i];
      if ((p === '9arm' && c.ninearmApiKey) || (p === 'tokenme' && c.tokenmeApiKey)) {
        return compatProfile(Object.assign({}, c, { provider: p }));
      }
    }
    return null;
  }

  function clean(t) {
    return String(t || '').replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
  }

  function build(a) {
    var task = String(a.task || a.prompt || '').trim();
    if (!task) return { error: 'ต้องมี task (ข้อความงานที่จบในตัว: ทำอะไร กับอะไร ผลลัพธ์รูปแบบไหน เสร็จดูจากอะไร)' };
    var s = S(), names = [].concat(a.files || []).map(String).filter(Boolean), parts = [], miss = [];
    if (names.length > MAX_FILES) return { error: 'แนบไฟล์ได้ไม่เกิน ' + MAX_FILES + ' ไฟล์ต่อครั้ง แบ่งงานเป็นก้อนเล็กลง' };
    names.forEach(function (p) {
      var key = p.replace(/^\.?\/+/, ''), t = s && s.files ? s.files[key] : undefined;
      if (t === undefined) miss.push(p); else parts.push('=== FILE: ' + key + ' ===\n' + t + '\n=== END FILE ===');
    });
    if (miss.length) return { error: 'ไม่พบไฟล์ในแท็บ Files: ' + miss.join(', ') + ' (ไฟล์ในรีโปให้ gh_read แล้วส่งเนื้อหาใน task)' };
    var prompt = task + (parts.length ? '\n\n' + parts.join('\n\n') : '');
    return { prompt: prompt, files: names.length };
  }

  async function delegate(a) {
    a = a || {};
    var b = build(a);
    if (b.error) return bad(b.error);
    if (SECRET.test(b.prompt)) return bad('พบรูปแบบ token/API key ในงานหรือไฟล์ที่แนบ — ไม่ส่งออกนอกเครื่อง ตัดออกแล้วลองใหม่');
    var tok = est(SYS) + est(b.prompt);
    if (tok > PROMPT_CAP) {
      return bad('งานนี้ใหญ่เกินบริบทโมเดลถูก (~' + tok + ' โทเคน เพดานที่ใช้ ' + PROMPT_CAP + ' จาก ' + WIN + ') — แบ่งเป็นก้อนเล็ก ทีละไฟล์/ทีละช่วง หรือทำเอง');
    }
    var pf = pick(a);
    if (!pf) return bad('ยังไม่ได้ตั้งคีย์ 9arm หรือ TokenMe ในตั้งค่า — delegate ใช้ไม่ได้ ทำงานนี้เอง');
    var model = /^[\w.\-\/:]+$/.test(String(a.model || '')) ? String(a.model) : pf.models[0];
    var maxTok = Math.min(16000, Math.max(256, Number(a.max_tokens) || 4096));
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, TIMEOUT), res;
    try {
      res = await fetch(pf.base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + pf.key },
        body: JSON.stringify({ model: model, temperature: 0.2, max_tokens: maxTok, stream: false, messages: [{ role: 'system', content: SYS }, { role: 'user', content: b.prompt }] }),
        signal: ctl.signal
      });
    } catch (e) {
      clearTimeout(timer);
      return bad(e && e.name === 'AbortError' ? pf.label + ': หมดเวลา ' + (TIMEOUT / 1000) + ' วินาที' : pf.label + ': ต่อเครือข่ายไม่ได้ (' + String(e && e.message || e).slice(0, 100) + ')');
    }
    clearTimeout(timer);
    if (!res.ok) {
      var ed = {};
      try { ed = await res.json(); } catch (e) { }
      var msg = (ed.error && (ed.error.message || ed.error)) || ('HTTP ' + res.status);
      if (res.status === 401 || res.status === 403) return bad(pf.label + ': คีย์ไม่ผ่าน/ถูกปฏิเสธ (' + res.status + ') ตรวจคีย์ในตั้งค่า — ' + String(msg).slice(0, 120));
      if (res.status === 429) return bad(pf.label + ': ติดโควต้า/เรียกถี่เกินไป (429) รอสักครู่หรือทำเอง');
      return bad(pf.label + ' (' + model + '): ' + String(msg).slice(0, 160));
    }
    var data = {};
    try { data = await res.json(); } catch (e) { return bad(pf.label + ': ตอบกลับที่อ่านไม่ได้'); }
    var ch = data.choices && data.choices[0], text = clean(ch && ch.message && ch.message.content);
    if (!text) return bad(pf.label + ' (' + model + '): ตอบว่างเปล่า — ลองแบ่งงานให้เล็กลงหรือทำเอง');
    var outTok = (data.usage && data.usage.completion_tokens) || est(text);
    var st = stats({ inTok: tok, outTok: outTok });
    var cut = ch.finish_reason === 'length' ? '\n[ถูกตัดเพราะเต็ม max_tokens — ผลไม่ครบ ให้แบ่งงานหรือเพิ่ม max_tokens]' : '';
    return ok('[delegate · ' + pf.label + ' · ' + model + ' · ส่ง ~' + tok + ' โทเคน (' + b.files + ' ไฟล์) · ครั้งที่ ' + st.n + ']\n' + text + cut +
      '\n[ตรวจผลเองตามเกณฑ์ใน task ก่อนใช้หรือรายงานผู้ใช้ — โมเดลถูกพลาดได้ และ delegate ไม่แก้ไฟล์ให้]');
  }

  var dt = window.dispatchTool;
  if (typeof dt === 'function') {
    window.dispatchTool = async function (call) {
      if (call && call.name === 'delegate') {
        try { return await delegate(call.args || {}); } catch (e) { return bad(String(e && e.message || e)); }
      }
      return dt.apply(this, arguments);
    };
  }

  var bp = window.buildSystemPrompt;
  if (typeof bp === 'function') {
    window.buildSystemPrompt = function () {
      var out = bp.apply(this, arguments), add = '';
      try {
        if (pick({})) {
          add = '\n\ndelegate {task,files?:["ไฟล์ในแท็บ Files"],max_tokens?} ฝากงานเล็กที่ขอบเขตชัด (สรุป log ยาว เปลี่ยนชื่อจำนวนมาก ร่างเทสต์) ให้โมเดลถูก ตอบเป็นข้อความ ไม่แก้ไฟล์ — task ต้องจบในตัว (ไม่รู้บริบทแชท) ตรวจผลเองก่อนใช้ · ห้ามฝากงานออกแบบ/ดีบัก/ไฟล์ป้องกัน · อ่านสกิล qwen-agent';
        }
      } catch (e) { }
      return out + add;
    };
  }

  window.ninoDelegate = { run: delegate, estimate: est, stats: stats, _build: build, _pick: pick, cap: PROMPT_CAP };
})();
