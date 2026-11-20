(function () {
  'use strict';
  var T = { redLines: 500, yelLines: 200, nbRed: 500, nbYel: 300, rootCap: 6000, ptrMin: 25, ptrMax: 140, lateAt: 45 };
  var VAGUE = /ทั่วไป|ต่างๆ|ฯลฯ|ที่เกี่ยวข้อง|ตามสมควร|เมื่อเหมาะสม|ถ้าจำเป็น|หลายอย่าง|ทุกอย่าง|ช่วยเหลือ/;
  var BROAD = /^(วิธี|ปัญหา|กฎ|เรื่อง|ข้อมูล|ความรู้|คู่มือ|แนวทาง|หลักการ|ภาพรวม)/;
  var TRIG = /เมื่อ|ก่อน|หลัง|ถ้า|ตอน|ใช้ใน|เรียกเครื่องมือ/;
  var ROOT_VAGUE = /ตรงเรื่อง|ไม่ตรงไปตรงมา|ขอบเขตชัด|สำคัญ|ที่เกี่ยวข้อง|ถ้าจำเป็น|เมื่อเหมาะสม|ตามสมควร|ตามต้องการ/;
  var COL = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[90m', off: '\x1b[0m' };
  var WORD = { red: 'สีแดง', yellow: 'สีเหลือง', green: 'สีเขียว' };

  function lines(t) { return String(t == null ? '' : t).replace(/\n+$/, '').split('\n').length; }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function mentions(text, name) { return new RegExp('(^|[^a-z0-9-])' + esc(name) + '($|[^a-z0-9-])').test(text); }

  function pointerIssues(d) {
    var o = [];
    d = String(d == null ? '' : d).trim();
    if (!d) return [['red', 'บรรทัดที่ 2 (pointer ที่ขึ้นสารบัญ) ว่าง — โมเดลไม่มีทางรู้ว่าเมื่อไหร่ควรเปิดเล่มนี้', 'เขียนบรรทัดที่ 2 ให้ขึ้นต้นด้วยเงื่อนไขหรือการกระทำที่สังเกตได้']];
    if (d.length < T.ptrMin) o.push(['yellow', 'pointer สั้นเกินไป (' + d.length + ' ตัวอักษร)', 'เติมเงื่อนไขที่ต้องใช้เล่มนี้']);
    if (d.length > T.ptrMax) o.push(['yellow', 'pointer ยาว ' + d.length + ' ตัวอักษร (เกิน ' + T.ptrMax + ') กินพรอมต์ทุกรอบ', 'เหลือเงื่อนไข + ผลลัพธ์ ย้ายรายละเอียดไป Skill.md/docs.md']);
    if (BROAD.test(d)) o.push(['yellow', 'pointer ขึ้นต้นด้วยคำนามกว้าง "' + d.slice(0, 8) + '…" ไม่ใช่เงื่อนไข/การกระทำ', 'ย้ายตัวกระตุ้นไปไว้หน้าสุด เช่น "ก่อน…", "เมื่อ…", "แก้…", "ตรวจ…"']);
    var v = VAGUE.exec(d);
    if (v) o.push(['yellow', 'pointer มีคำคลุมเครือ "' + v[0] + '"', 'ระบุสิ่งที่สังเกตได้แทน เช่น ชื่อเครื่องมือ ข้อความ error จำนวนไฟล์']);
    var ti = d.search(TRIG);
    if (ti > T.lateAt) o.push(['yellow', 'ตัวกระตุ้นอยู่ท้ายประโยค (ตำแหน่ง ' + ti + ') โมเดลอ่านต้นประโยคก่อน', 'ย้ายเงื่อนไขขึ้นหน้า']);
    if (/\(ที่มา/.test(d)) o.push(['yellow', 'pointer มีป้ายที่มาในวงเล็บ (ไม่ใช่ตัวกระตุ้น)', 'ย้ายไปสมุดจดของเล่ม']);
    return o;
  }

  function audit(fs, opts) {
    opts = opts || {};
    var keys = fs.keys(), rd = function (k) { var v = fs.read(k); return v == null ? null : String(v); };
    var out = [], touched = {};
    function add(level, where, msg, fix) { out.push({ level: level, where: where, msg: msg, fix: fix || '' }); touched[where] = 1; }
    var books = keys.filter(function (k) { return /^skills\/[^\/]+\/[^\/]+\/[^\/]+\/Skill\.md$/.test(k); }).sort().map(function (k) {
      var p = k.split('/'); return { file: k, path: k.slice(0, -8), cat: p[1], shelf: p[2], name: p[3], where: p[1] + '/' + p[2] + '/' + p[3] };
    });
    var names = {};
    books.forEach(function (b) { names[b.name] = 1; });
    keys.filter(function (k) { return /^skills\/.+\/Skill\.md$/.test(k) && !/^skills\/[^\/]+\/[^\/]+\/[^\/]+\/Skill\.md$/.test(k); }).forEach(function (k) {
      add('red', k.slice(0, -9), 'เล่มไม่อยู่ในชั้น (ต้อง skills/หมวด/ชั้น/ชื่อ)', 'sh mv ไปที่ชั้นที่ถูกต้อง');
    });

    books.forEach(function (b) {
      var t = rd(b.file) || '', L = t.split('\n'), n = lines(t), nb = rd(b.path + 'notebook.md');
      if (n > T.redLines) add('red', b.where, 'Skill.md ยาว ' + n + ' บรรทัด (เกิน ' + T.redLines + ')', 'ย้ายรายละเอียดไป docs.md เหลือเฉพาะขั้นตอนที่ต้องทำ แล้วชี้ไป docs.md');
      else if (n > T.yelLines) add('yellow', b.where, 'Skill.md ยาว ' + n + ' บรรทัด (เกิน ' + T.yelLines + ')', 'เริ่มย้ายส่วนอ้างอิงไป docs.md');
      if (nb == null) add('red', b.where, 'ไม่มีสมุดจด notebook.md คู่เล่ม', 'เขียน ' + b.path + 'notebook.md');
      else {
        var nn = lines(nb);
        if (nn > T.nbRed) add('red', b.where, 'สมุดจดยาว ' + nn + ' บรรทัด (เกิน ' + T.nbRed + ') skill_read โหลดพร้อมเล่ม', 'ยกบทเรียนที่ซ้ำขึ้นไปเขียนในขั้นตอน แล้วลบบันทึกซ้ำ (notebook-keeping)');
        else if (nn > T.nbYel) add('yellow', b.where, 'สมุดจดยาว ' + nn + ' บรรทัด (เกิน ' + T.nbYel + ')', 'บีบสมุดจดตาม notebook-keeping');
      }
      if ((L[0] || '').trim() !== '# ' + b.name) add('yellow', b.where, 'บรรทัดที่ 1 ควรเป็น "# ' + b.name + '"', 'แก้บรรทัดแรกให้ตรงชื่อเล่ม');
      pointerIssues(L[1]).forEach(function (i) { add(i[0], b.where, i[1], i[2]); });
      var seen = {};
      (t.match(/skills\/[A-Za-z0-9_\-\/]+\.(?:js|md|json)/g) || []).forEach(function (r) {
        if (!seen[r] && keys.indexOf(r) < 0) { seen[r] = 1; add('red', b.where, 'ชี้ไฟล์ที่ไม่มีจริง: ' + r, 'แก้ path หรือสร้างไฟล์'); }
      });
      var re = /(?:skill_read\s+\{?|สกิล\s+)([a-z][a-z0-9-]*)/g, m;
      while ((m = re.exec(t))) {
        if (m[1] !== 'name' && !names[m[1]] && !seen[m[1]]) { seen[m[1]] = 1; add('red', b.where, 'ชี้ไปเล่มที่ไม่มี: ' + m[1], 'แก้ชื่อเล่ม หรือสร้างเล่มนั้น (skill-writer)'); }
      }
    });

    var gates = (rd('skills/_gates.md') || '').split('\n').filter(function (l) { return l.trim() && l.charAt(0) !== '#' && l.indexOf('|') > 0; });
    gates.forEach(function (g) {
      var parts = g.split('|'), topic = parts[0].trim(), brs = parts.slice(1).join('|').split(';').map(function (s) { return s.trim(); }).filter(Boolean);
      if (brs.length < 2) add('yellow', 'skills/_gates.md', 'ประตู "' + topic + '" มีทางเลือกไม่ถึง 2', 'แยกทางเลือกด้วย ; ให้ครบทุกกรณี');
      brs.forEach(function (br) {
        var m = br.split('→');
        if (m.length < 2 || m[0].trim().length < 6) { add('yellow', 'skills/_gates.md', 'ประตู "' + topic + '": ทางเลือกไม่มีเงื่อนไขที่ชัด "' + br.slice(0, 40) + '"', 'เขียนเป็น "เงื่อนไขที่สังเกตได้ → ชื่อเล่ม"'); return; }
        m[1].split('+').forEach(function (s) {
          var nm = s.trim().split(/\s/)[0];
          if (nm && !names[nm]) add('red', 'skills/_gates.md', 'ประตู "' + topic + '" ชี้เล่มที่ไม่มี: ' + nm, 'แก้ชื่อเล่มในประตู');
        });
      });
    });
    var shelves = {};
    books.forEach(function (b) { (shelves[b.cat + '/' + b.shelf] = shelves[b.cat + '/' + b.shelf] || []).push(b.name); });
    Object.keys(shelves).forEach(function (sh) {
      var ns = shelves[sh];
      if (ns.length < 2) return;
      var ok = gates.some(function (g) { return ns.every(function (n) { return mentions(g, n); }); });
      if (!ok) add('yellow', sh, 'ชั้นนี้มี ' + ns.length + ' เล่ม (' + ns.join(', ') + ') แต่ไม่มีประตูตัดสินใจครบทุกเล่มใน skills/_gates.md', 'เพิ่ม 1 บรรทัด: หัวข้อ | เงื่อนไข → เล่ม ; เงื่อนไข → เล่ม');
    });

    if (opts.root != null) {
      var rt = String(opts.root);
      if (rt.length > T.rootCap) add('red', 'Skill.md (ราก)', 'ยาว ' + rt.length + ' ตัวอักษร เกิน ' + T.rootCap + ' — ถูกตัดตอนแนบพรอมต์ทุกรอบ', 'ย้ายข้อเท็จจริงไป NOW.md เหลือแต่กติกา');
      else if (rt.length > T.rootCap * 0.85) add('yellow', 'Skill.md (ราก)', 'ยาว ' + rt.length + ' ตัวอักษร ใกล้เพดาน ' + T.rootCap, 'เริ่มตัดส่วนที่ไม่ใช่กติกา');
      rt.split('\n').forEach(function (l, i) {
        var points = /skill_read|สกิล\s/.test(l) || Object.keys(names).some(function (n) { return mentions(l, n); });
        var v = points && ROOT_VAGUE.exec(l);
        if (v) add('yellow', 'Skill.md (ราก)', 'บรรทัด ' + (i + 1) + ' ชี้ไปสกิลด้วยคำคลุมเครือ "' + v[0] + '": ' + l.trim().slice(0, 60), 'เปลี่ยนเป็นเงื่อนไขที่สังเกตได้ เช่น ผลเครื่องมือขึ้น , diff แตะไฟล์ [ล็อก]');
      });
    }

    var red = 0, yellow = 0;
    out.forEach(function (x) { if (x.level === 'red') red++; else yellow++; });
    var green = books.filter(function (b) { return !touched[b.where]; }).length;
    return { books: books.length, red: red, yellow: yellow, green: green, issues: out, greenList: books.filter(function (b) { return !touched[b.where]; }).map(function (b) { return b.where; }) };
  }

  function format(res, o) {
    o = o || {};
    var a = !!o.ansi, L = [], c = function (k, s) { return a ? COL[k] + s + COL.off : s; };
    L.push('หอสมุดสกิล ' + res.books + ' เล่ม · ' + c('red', WORD.red + ' ' + res.red) + ' · ' + c('yellow', WORD.yellow + ' ' + res.yellow) + ' · ' + c('green', WORD.green + ' ' + res.green));
    var order = { red: 0, yellow: 1 };
    res.issues.slice().sort(function (x, y) { return order[x.level] - order[y.level] || (x.where < y.where ? -1 : x.where > y.where ? 1 : 0); }).forEach(function (x) {
      L.push(c(x.level, '● ' + WORD[x.level]) + '  ' + x.where + ' — ' + x.msg);
      if (x.fix) L.push((a ? COL.dim : '') + '   แก้: ' + x.fix + (a ? COL.off : ''));
    });
    if (o.all) res.greenList.forEach(function (w) { L.push(c('green', '● ' + WORD.green) + '  ' + w); });
    if (!res.red && !res.yellow) L.push(c('green', '✓ ทุกเล่มสีเขียว'));
    else L.push((a ? COL.dim : '') + 'แก้ที่ pointer (บรรทัดที่ 2 ของ Skill.md · ประตูใน skills/_gates.md) ไม่ใช่เนื้อสกิล แล้วตรวจซ้ำ' + (a ? COL.off : ''));
    return L.join('\n');
  }

  function current() {
    var lib = window.ninoLib, ag = window.ninoAgent;
    if (!lib || !lib.fs) return null;
    var root = null;
    try { root = ag && ag.skill ? ag.skill.get() : null; } catch (e) { }
    return audit(lib.fs, { root: root });
  }
  function report(o) {
    var r = current();
    return r ? format(r, o) : 'หอสมุดยังไม่พร้อม (ninoLib)';
  }

  var call = null;
  function findBook(n) {
    var lib = window.ninoLib;
    if (!lib || !lib.fs) return null;
    var k = lib.fs.keys().filter(function (x) { var p = x.split('/'); return p.length === 5 && p[4] === 'Skill.md' && p[3] === n; })[0];
    return k ? { name: n, path: k, text: lib.fs.read(k) } : null;
  }

  var dt = window.dispatchTool;
  if (typeof dt === 'function') {
    window.dispatchTool = async function (c) {
      if (c && c.name === 'lib_health') {
        try { return { ok: true, result: report({ ansi: false, all: !!(c.args && c.args.all) }), error: null }; }
        catch (e) { return { ok: false, result: null, error: String(e && e.message || e) }; }
      }
      return dt.apply(this, arguments);
    };
  }

  var hs = window.handleUserSend;
  if (typeof hs === 'function') {
    window.handleUserSend = function () {
      try {
        call = null;
        var inp = document.getElementById('prompt-input'), rp = typeof currentCharacter !== 'undefined' && currentCharacter && currentCharacter.mode === 'roleplay';
        var m = inp && !rp && /^\/([a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/.exec(inp.value.trim());
        var b = m && findBook(m[1]);
        if (b) {
          call = b;
          inp.value = (m[2] || '').trim() || '(ใช้สกิล ' + b.name + ')';
          if (typeof toast === 'function') toast('ผู้ใช้เรียกสกิล ' + b.name + ' — แนบเข้าพรอมต์ของงานนี้', 'ok');
        }
      } catch (e) { call = null; }
      return hs.apply(this, arguments);
    };
  }

  var bp = window.buildSystemPrompt;
  if (typeof bp === 'function') {
    window.buildSystemPrompt = function () {
      var out = bp.apply(this, arguments);
      try {
        if (call) out += '\n\n## SKILL ที่ผู้ใช้เรียกเอง (/' + call.name + ') — ปฏิบัติตามเล่มนี้ในงานนี้ ไม่ต้องเลือกเอง\n' + String(call.text || '').slice(0, 6000);
        out += '\n\nlib_health {all?} ตรวจสุขภาพหอสมุด (สีแดง/เหลือง/เขียว) · ผู้ใช้เรียกสกิลเองได้ด้วย /ชื่อเล่ม ในช่องแชท';
      } catch (e) { }
      return out;
    };
  }

  window.ninoLibHealth = { audit: audit, format: format, report: report, current: current, pointerIssues: pointerIssues, findBook: findBook, limits: T, activeCall: function () { return call; } };
})();
