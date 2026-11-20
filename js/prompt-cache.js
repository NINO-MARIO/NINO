(function () {
  'use strict';
  var TAIL_HEAD = '## CURRENT STATE — ส่วนที่เปลี่ยนทุกรอบ วางท้ายสุดเพื่อให้แคชพรีฟิกซ์ของผู้ให้บริการใช้ส่วนบนซ้ำได้';
  var SEG = [
    ['facts', 'vol', /\nFACTS:\n[\s\S]*?\n\[CURRENT: [^\]\n]*\]/],
    ['repo', 'vol', /\nREPO(?: \([^)\n]*\))?: [^\n]*/],
    ['staged', 'vol', /\nSTAGED: [^\n]*/],
    ['journal', 'vol', /\n## JOURNAL \([^\n]*(?:\n(?:งาน|เสร็จแล้ว|ค้าง|โน้ต): [^\n]*){4}/],
    ['bridge', 'vol', /\n## ความทรงจำอีกฝั่ง [^\n]*(?:\n(?:facts|events|rag): [^\n]*)*/],
    ['files', 'vol', /\nFILES ตอนนี้ \(\d+\):[^\n]*/],
    ['focus', 'vol', /\n## โหมดงานปัจจุบัน \(ระบบเลือกอัตโนมัติ\)(?:\n[^\n]+)*/],
    ['codemap', 'vol', /\n## แผนที่โค้ด[\s\S]*?ทางลัด: edit_batch[^\n]*/],
    ['skillmd', 'semi', /\n## SKILL\.md \([^\n]*\n[\s\S]*?(?=\n\n## (?:JOURNAL|ความทรงจำอีกฝั่ง|TOOLS เพิ่มเติม))/],
    ['usercall', 'semi', /\n## SKILL ที่ผู้ใช้เรียกเอง \([^\n]*\n[\s\S]*?(?=\n\nlib_health |$)/]
  ];

  var S = { calls: 0, busts: [], last: null, lastT: 0, lastCfg: '', seg: {}, usage: { n: 0, prompt: 0, cached: 0, out: 0, silent: 0 }, cur: null, sizes: { head: 0, semi: 0, vol: 0 } };

  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
  function est(n) { return Math.ceil(n / 2.2); }
  function cfgKey() {
    try { var c = typeof getCfg === 'function' ? getCfg() : {}; var m = c.provider === '9arm' ? c.ninearmModel : c.provider === 'tokenme' ? c.tokenmeModel : c.model; return (c.provider || '?') + '/' + (m || '?'); } catch (e) { return '?'; }
  }

  function arrange(p) {
    p = String(p == null ? '' : p);
    if (p.indexOf(TAIL_HEAD) >= 0) return { text: p, head: p.split(TAIL_HEAD)[0], moved: {}, parts: null };
    var rest = p, semi = [], vol = [], moved = {};
    SEG.forEach(function (s) {
      rest = rest.replace(s[2], function (m) { moved[s[0]] = (moved[s[0]] || 0) + 1; (s[1] === 'semi' ? semi : vol).push(m.replace(/^\n+/, '').replace(/\s+$/, '')); return ''; });
    });
    rest = rest.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
    var text = rest;
    if (semi.length) text += '\n\n' + semi.join('\n\n');
    if (vol.length) text += '\n\n' + TAIL_HEAD + '\n' + vol.join('\n');
    return { text: text, head: rest, semiLen: semi.join('\n\n').length, volLen: vol.join('\n').length, moved: moved };
  }

  function firstDiff(a, b) { var n = Math.min(a.length, b.length), i = 0; while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++; return i; }
  function nearHeader(s, i) { var h = s.lastIndexOf('\n## ', i); return h < 0 ? '(ต้นพรอมต์)' : s.slice(h + 1, s.indexOf('\n', h + 1) < 0 ? h + 60 : s.indexOf('\n', h + 1)).slice(0, 70); }

  function flush() {
    if (S.cur) {
      var u = S.cur, p = u.promptTokenCount != null ? u.promptTokenCount : u.prompt_tokens, c = u.cachedContentTokenCount != null ? u.cachedContentTokenCount :
        (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens != null ? u.prompt_tokens_details.cached_tokens : (u.prompt_cache_hit_tokens != null ? u.prompt_cache_hit_tokens : null));
      var o = u.candidatesTokenCount != null ? u.candidatesTokenCount : u.completion_tokens;
      if (p != null) { S.usage.n++; S.usage.prompt += p; if (c != null) S.usage.cached += c; else S.usage.silent++; }
      if (o != null) S.usage.out += o;
      S.cur = null;
    }
  }

  function record(r) {
    flush();
    S.calls++;
    var now = Date.now(), ck = cfgKey(), hh = hash(r.head);
    S.sizes = { head: r.head.length, semi: r.semiLen || 0, vol: r.volLen || 0 };
    Object.keys(r.moved).forEach(function (k) { S.seg[k] = (S.seg[k] || 0) + r.moved[k]; });
    if (S.last && S.last.h !== hh) {
      var at = firstDiff(S.last.head, r.head), why = [];
      if (S.lastCfg && S.lastCfg !== ck) why.push('สลับโมเดล ' + S.lastCfg + ' → ' + ck);
      why.push('ส่วนนิ่งเปลี่ยนที่ "' + nearHeader(r.head, at) + '" (ตำแหน่ง ' + at + ', ' + (r.head.length - S.last.head.length >= 0 ? '+' : '') + (r.head.length - S.last.head.length) + ' ตัวอักษร)');
      var b = { t: now, why: why.join(' · '), at: at };
      S.busts.push(b); if (S.busts.length > 20) S.busts.shift();
      if (now - S.lastT < 600000 && typeof toast === 'function') { try { toast('แคชพรีฟิกซ์ถูกล้าง: ' + why[0], 'warn'); } catch (e) { } }
    }
    S.last = { h: hh, head: r.head }; S.lastT = now; S.lastCfg = ck;
  }

  function stats() {
    flush();
    var tot = S.sizes.head + S.sizes.semi + S.sizes.vol, stable = tot ? Math.round((S.sizes.head + S.sizes.semi) * 100 / tot) : 0;
    return { calls: S.calls, bust: S.busts.length, lastBust: S.busts.length ? S.busts[S.busts.length - 1] : null, sizes: S.sizes, stablePct: stable, seg: S.seg, usage: S.usage };
  }

  function line() {
    var s = stats();
    if (!s.calls) return 'แคชพรีฟิกซ์: ยังไม่มีการเรียกโมเดล';
    return 'แคชพรีฟิกซ์ ส่วนนิ่ง ' + s.stablePct + '% · ล้าง ' + s.bust + ' ครั้ง' + (s.usage.n && s.usage.cached ? ' · ผู้ให้บริการรายงานใช้แคช ' + Math.round(s.usage.cached * 100 / Math.max(1, s.usage.prompt)) + '%' : '');
  }

  function report(o) {
    o = o || {};
    var s = stats(), L = [];
    if (!s.calls) return 'ยังไม่มีการเรียกโมเดลในโหมดโค้ดตั้งแต่เปิดแอป — ส่งงานหนึ่งรอบแล้วดูใหม่';
    L.push('พรอมต์โหมดโค้ด (สร้าง ' + s.calls + ' ครั้งตั้งแต่เปิดแอป · โมเดลล่าสุด ' + S.lastCfg + ')');
    L.push('  ส่วนนิ่ง (แคชซ้ำได้) ~' + s.sizes.head + ' ตัวอักษร ≈ ' + est(s.sizes.head) + ' โทเคน');
    L.push('  กึ่งนิ่ง (Skill.md/สกิลที่ผู้ใช้เรียก — เปลี่ยนเมื่อแก้ไฟล์นั้น) ~' + s.sizes.semi + ' ตัวอักษร');
    L.push('  เปลี่ยนทุกรอบ (คำนวณใหม่เสมอ) ~' + s.sizes.vol + ' ตัวอักษร ≈ ' + est(s.sizes.vol) + ' โทเคน → ส่วนที่แคชได้ ' + s.stablePct + '%');
    L.push('  ตำแหน่งที่จัดเรียงสำเร็จ: ' + (Object.keys(s.seg).join(', ') || '(ไม่มี — ถ้าเป็นแบบนี้ตลอดแปลว่าจับรูปแบบบล็อกไม่เจอ)'));
    if (s.bust) {
      L.push('  ส่วนนิ่งถูกล้าง ' + s.bust + ' ครั้ง ล่าสุด: ' + s.lastBust.why);
      L.push('  (สลับโมเดล เพิ่ม/ถอดเครื่องมือ หรือสกิลเล่มใหม่เข้าสารบัญ ทำให้ส่วนนิ่งเปลี่ยน — ครั้งแรกหลังนั้นผู้ให้บริการสร้างแคชใหม่)');
    } else L.push('  ส่วนนิ่งไม่ถูกล้างเลยตั้งแต่เปิดแอป');
    var u = s.usage;
    if (u.n) L.push('ผู้ให้บริการรายงาน ' + u.n + ' ครั้ง: ส่งเข้า ' + u.prompt + ' โทเคน' + (u.cached ? ' ใช้แคช ' + u.cached + ' (' + Math.round(u.cached * 100 / Math.max(1, u.prompt)) + '%)' : ' (ไม่มีตัวเลขแคช — ผู้ให้บริการนี้ไม่รายงาน หรือยังไม่เกิดแคช)') + ' · ผลลัพธ์ ' + u.out);
    else L.push('ผู้ให้บริการไม่รายงานจำนวนโทเคน (สตรีมของ OpenAI-compatible มักไม่ส่ง usage) — ตัวเลขข้างบนเป็นการวัดโครงสร้างพรอมต์ ไม่ใช่ยอดแคชจริง');
    return L.join('\n');
  }

  var bp = window.buildSystemPrompt;
  if (typeof bp === 'function') {
    var w = function () {
      var out = bp.apply(this, arguments), r;
      try { r = arrange(out); record(r); return r.text; } catch (e) { return out; }
    };
    w._ninoSys = true;
    window.buildSystemPrompt = w;
  }

  var dt = window.dispatchTool;
  if (typeof dt === 'function') {
    window.dispatchTool = async function (c) {
      if (c && c.name === 'cache_report') return { ok: true, result: report(), error: null };
      return dt.apply(this, arguments);
    };
  }

  try {
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t && /^cfg-(provider|model|9arm-model|tm-model)$/.test(t.id) && typeof toast === 'function') toast('สลับโมเดล/ผู้ให้บริการ: แคชพรอมต์ของตัวเดิมใช้ต่อไม่ได้ ครั้งแรกหลังสลับจะช้าและกินโทเคนเต็มก้อน (ควรสลับตอนจบงาน)', 'warn');
    });
  } catch (e) { }

  window.ninoPC = { arrange: arrange, report: report, line: line, stats: stats, usage: function (u) { if (u && typeof u === 'object') S.cur = u; }, _seg: SEG, tailHead: TAIL_HEAD, _reset: function () { S.calls = 0; S.busts = []; S.last = null; S.seg = {}; S.cur = null; S.usage = { n: 0, prompt: 0, cached: 0, out: 0, silent: 0 }; } };
})();
