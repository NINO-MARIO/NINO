/* หน้าตั้งค่า "โมเดลที่เปิดพร้อมกัน" ใต้การ์ดเส้นทาง LLM (ดู llm-hub.js mount)
   แสดงและแก้ได้เฉพาะสิ่งที่ js/llm-roster.js เก็บไว้ คีย์ไม่ถูกแสดงกลับมาบนหน้าจอ
   ข้อมูลทุกอย่างใส่ด้วย textContent (ไม่ใช้ innerHTML) */
(function (root) {
  'use strict';
  var ROLE_LABEL = { chat: 'แชต', summary: 'สรุปความจำ', memory: 'ความจำ', worker: 'งานรอง' };
  // URL ของผู้ให้บริการ: ผู้ใช้ควรตรวจกับเอกสารของผู้ให้บริการก่อนใช้จริง (ตอนสร้างไม่สามารถเข้าถึงเอกสารได้)
  var PRESETS = [
    { n: 'DeepSeek', kind: 'compat', url: 'https://api.deepseek.com' }, // แหล่ง: https://api-docs.deepseek.com/ (base_url OpenAI)
    { n: 'Qwen (DashScope)', kind: 'compat', url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' }, // แหล่ง: ยังไม่ได้ตรวจ (เอกสารระบุว่าโดเมนนี้เป็นโดเมนเดิม และให้ใช้โดเมนของ workspace)
    { n: 'Gemini (OpenAI)', kind: 'compat', url: 'https://generativelanguage.googleapis.com/v1beta/openai' }, // แหล่ง: https://aistudio.google.com/docs/openai (base_url ตรงกับเอกสาร)
    { n: 'Claude', kind: 'anthropic', url: 'https://api.anthropic.com' }, // แหล่ง: https://platform.claude.com/docs/en/api/overview (base URL ตรงกับเอกสาร)
    { n: 'Ollama Cloud', kind: 'compat', url: 'https://ollama.com/v1' }, // แหล่ง: https://docs.ollama.com/API/openai-compatibility
    { n: 'Pollinations (สาธารณะ)', kind: 'compat', url: 'https://text.pollinations.ai/openai', pub: true }, // แหล่ง: ยังไม่ได้ตรวจ (โดเมนยืนยันจาก github.com/pollinations/pollinations APIDOCS.md แต่เส้นทาง /openai ยังไม่ได้ตรวจ)
  ];
  var KIND_LABEL = { active: 'แอปเดิม', compat: 'OpenAI-compatible', anthropic: 'Claude', 'on-device': 'ในเครื่อง' };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function check(label, on, onChange) {
    var l = el('label', 'nc-muted');
    var c = el('input'); c.type = 'checkbox'; c.checked = !!on;
    c.addEventListener('change', function () { onChange(c.checked); });
    l.appendChild(c); l.appendChild(document.createTextNode(' ' + label));
    return l;
  }

  // การ์ดมิ้ม: สถานะ ความคืบหน้า นิสัย และช่องความจำ (ทั้งหมดเก็บในเครื่องและตั้งค่าได้เอง)
  function mountNpc(host) {
    var N = root.ninoRoster.npc;
    var card = el('div', 'nc-card');
    card.appendChild(el('h4', null, 'มิ้ม: สถานะและความจำ'));
    var st = el('p', 'nc-muted', ''); st.style.cssText = 'margin:6px 0;line-height:1.5';
    var modes = el('div', 'nc-row');
    var slotBox = el('div');
    var hint = el('p', 'nc-muted', 'ช่องความจำเก็บเฉพาะที่คุณเขียนเอง ใช้ได้เฉพาะโมเดลในเครื่อง ไม่ส่งไปผู้ให้บริการใด ล้างได้ทั้งหมดด้วยปุ่มล่าง');
    var inp = el('input'); inp.placeholder = 'เช่น ชื่อที่อยากให้เรียก (ไม่เกิน 120 ตัวอักษร)'; inp.maxLength = 120; inp.style.cssText = 'display:block;width:100%;margin:4px 0';
    var addB = el('button', 'nc-btn pri', 'เพิ่มช่องความจำ'); addB.type = 'button';
    var clrB = el('button', 'nc-btn', 'ล้างสถานะทั้งหมด'); clrB.type = 'button';
    var msg = el('p', 'nc-muted', '');
    function say(t, bad) { msg.textContent = t; msg.style.color = bad ? '#c0392b' : ''; }
    function npcHead(s, snap) { return 'มิ้ม: ' + s.text + ' · ใช้งานมาแล้ว ' + snap.counters.days + ' วัน · ต่อเนื่อง ' + snap.counters.streak + ' วัน'; }
    /* ตัวนับเวลารอ: ขณะรอ นับถอยหลังเองทุกวินาทีในบรรทัดสถานะ ไม่สร้างปุ่มใหม่ และหยุดเมื่อการ์ดถูกถอดออก */
    var waitTimer = 0;
    function watchWait() {
      if (waitTimer || N.status().state !== 'รอเวลา') return;
      waitTimer = setInterval(function () {
        if (!st.isConnected) { clearInterval(waitTimer); waitTimer = 0; return; }
        var s = N.status();
        if (s.state !== 'รอเวลา') { clearInterval(waitTimer); waitTimer = 0; paintNpc(); return; }
        st.textContent = npcHead(s, N.snapshot());
      }, 1000);
    }
    function paintNpc() {
      var s = N.status(), snap = N.snapshot();
      st.textContent = npcHead(s, snap);
      watchWait();
      modes.textContent = '';
      N.modes().forEach(function (m) {
        var b = el('button', 'nc-btn', m.name + (m.unlocked ? '' : ' (ปลดล็อกที่ 7 วัน)')); b.type = 'button';
        b.disabled = !m.unlocked;
        if (snap.mode === m.name) b.className = 'nc-btn pri';
        b.addEventListener('click', function () { var r = N.setMode(m.name); say(r.ok ? 'ตั้งนิสัยเป็น ' + m.name : r.problems.join(' · '), !r.ok); paintNpc(); });
        modes.appendChild(b);
      });
      slotBox.textContent = '';
      if (!snap.slots.length) slotBox.appendChild(el('p', 'nc-muted', 'ยังไม่มีช่องความจำ'));
      snap.slots.forEach(function (x, i) {
        var row = el('div'); row.style.cssText = 'border:1px solid #8884;border-radius:8px;padding:6px;margin:4px 0';
        row.appendChild(el('span', null, x.text));
        if (x.faded) row.appendChild(el('span', 'nc-muted', '  · เลือนไปแล้ว'));
        var rm = el('button', 'nc-btn', 'ลบ'); rm.type = 'button'; rm.style.marginLeft = '6px';
        rm.addEventListener('click', function () { N.removeSlot(i); paintNpc(); });
        row.appendChild(rm); slotBox.appendChild(row);
      });
    }
    addB.addEventListener('click', function () { var r = N.addSlot(inp.value); if (!r.ok) return say(r.problems.join(' · '), true); inp.value = ''; say('เพิ่มช่องความจำแล้ว', false); paintNpc(); });
    clrB.addEventListener('click', function () { if (root.confirm && !root.confirm('ล้างสถานะ ตัวนับ ช่องความจำ และนิสัยของมิ้มทั้งหมด?')) return; N.clear(); say('ล้างแล้ว', false); paintNpc(); });
    /* คำถามสำเร็จรูป (ออกแบบโดยใบเตย): กดแล้วใส่ข้อความลงช่องพิมพ์ของแชท ไม่ส่งเอง ให้ผู้ใช้ตรวจก่อนส่ง */
    var QUICK = ['สรุปสิ่งที่เราคุยกันไว้ให้หน่อย', 'อธิบายเรื่องนี้แบบสั้นๆ', 'ช่วยตั้งคำถามทบทวนให้หน่อย'];
    var quick = el('div', 'nc-row');
    QUICK.forEach(function (q) {
      var qb = el('button', 'nc-btn', q); qb.type = 'button';
      qb.addEventListener('click', function () {
        var ta = document.getElementById('prompt-input');
        if (!ta) return say('ยังไม่มีช่องพิมพ์ในหน้าแชท', true);
        ta.value = q; try { ta.focus(); } catch (e) {}
        say('ใส่คำถามในช่องพิมพ์แล้ว ตรวจก่อนส่ง', false);
      });
      quick.appendChild(qb);
    });
    card.appendChild(st); card.appendChild(modes); card.appendChild(quick); card.appendChild(slotBox); card.appendChild(inp); card.appendChild(addB); card.appendChild(hint); card.appendChild(clrB); card.appendChild(msg);
    // ให้มิ้มอ่านสกิลจากห้องสมุด (อ่านอย่างเดียว ไม่แก้ไขไฟล์ใด) สกิลส่วนตัวจะรีวิวในเครื่องเท่านั้น
    var sk = el('div'); sk.style.cssText = 'margin-top:10px;border-top:1px solid #8884;padding-top:8px';
    sk.appendChild(el('p', 'nc-muted', 'ให้มิ้มอ่านสกิลจากห้องสมุดแล้วรีวิวสั้นๆ สกิลส่วนตัวจะรีวิวในเครื่องเท่านั้น'));
    var skillItems = [];
    var sel = el('select'); sel.style.cssText = 'display:block;width:100%;margin:4px 0';
    var rvBtn = el('button', 'nc-btn pri', 'ให้มิ้มอ่านสกิลนี้'); rvBtn.type = 'button';
    var rvOut = el('div', null, ''); rvOut.style.cssText = 'white-space:pre-wrap;margin:6px 0;line-height:1.5';
    function libSkills() {
      var F = root.ninoLib && root.ninoLib.fs;
      if (!F || typeof F.keys !== 'function') return [];
      return F.keys().filter(function (k) { return /^skills\/.+\/Skill\.md$/.test(k); }).slice(0, 30).map(function (k) {
        var tx = String(F.read(k) || '');
        var nm = (tx.split('\n')[0] || '').replace(/^#\s*/, '').slice(0, 80) || k;
        return { key: k, name: nm, body: tx };
      });
    }
    function paintSkills() {
      skillItems = libSkills();
      sel.textContent = '';
      if (!skillItems.length) sel.appendChild(el('option', null, 'ไม่มีสกิลในห้องสมุด'));
      skillItems.forEach(function (x, i) { var o = el('option', null, x.name); o.value = String(i); sel.appendChild(o); });
    }
    sel.addEventListener('focus', paintSkills);
    rvBtn.addEventListener('click', async function () {
      var it = skillItems[Number(sel.value)];
      if (!it) { rvOut.style.color = ''; rvOut.textContent = 'ยังไม่มีสกิลให้รีวิว'; return; }
      rvBtn.disabled = true; rvOut.style.color = ''; rvOut.textContent = 'มิ้มกำลังอ่าน…';
      try {
        var r = await root.ninoRoster.reviewSkill({ name: it.name, body: it.body });
        rvOut.textContent = r.text + '\n— ตอบโดย ' + r.label;
      } catch (err) {
        rvOut.style.color = '#c0392b';
        rvOut.textContent = 'รีวิวไม่ได้: ' + ((err && err.message) || err);
      }
      rvBtn.disabled = false;
    });
    sk.appendChild(sel); sk.appendChild(rvBtn); sk.appendChild(rvOut);
    card.appendChild(sk);
    paintSkills();

    host.appendChild(card);
    paintNpc();
  }

  function mount(host) {
    if (!host || host.__rosterMounted || !root.ninoRoster) return;
    host.__rosterMounted = true;
    var R = root.ninoRoster;
    var card = el('div', 'nc-card');
    card.appendChild(el('h4', null, 'โมเดลที่เปิดพร้อมกัน'));
    card.appendChild(el('p', 'nc-muted', 'เปิดได้หลายตัวพร้อมกัน แต่ละตัวรับบทบาทที่ติ๊กไว้ งานจะไปตัวที่มีลำดับน้อยที่สุดก่อน ถ้าพลาดจะลองตัวถัดไป ถ้าไม่มีตัวไหนเปิดไว้ บทบาทนั้นจะใช้ทางเดิมของแอป'));
    var list = el('div');
    var status = el('p', 'nc-muted', '');
    status.style.cssText = 'margin:6px 0;line-height:1.5';
    card.appendChild(list);
    var clr = el('button', 'nc-btn', 'ล้างประวัติทั้งหมด'); clr.type = 'button';
    clr.addEventListener('click', function () { if (root.confirm && !root.confirm('ล้างประวัติการเรียกทั้งหมด?')) return; R.clearLog(); paint(); setStatus('ล้างประวัติแล้ว', false); });
    card.appendChild(clr);


    // ฟอร์มเพิ่มโมเดล
    var form = el('div'); form.style.cssText = 'margin-top:10px;border-top:1px solid #8884;padding-top:8px';
    form.appendChild(el('p', 'nc-muted', 'เพิ่มโมเดลใหม่'));
    var presetRow = el('div', 'nc-row');
    var f = { kind: el('select'), label: el('input'), url: el('input'), model: el('input'), key: el('input'), priority: el('input') };
    Object.keys(R.KINDS).forEach(function (k) { var o = el('option', null, KIND_LABEL[k] || k); o.value = k; f.kind.appendChild(o); });
    f.label.placeholder = 'ชื่อที่แสดง'; f.url.placeholder = 'URL (https://…/v1)'; f.model.placeholder = 'ชื่อโมเดล ตามเอกสารผู้ให้บริการ';
    f.key.placeholder = 'API key'; f.key.type = 'password'; f.priority.placeholder = 'ลำดับ (น้อยก่อน)'; f.priority.type = 'number'; f.priority.value = '100';
    var pub = false;
    var roleBox = {}, roleRow = el('div', 'nc-row');
    R.ROLES.forEach(function (r) { roleBox[r] = check(ROLE_LABEL[r] || r, r === 'chat', function () {}); roleRow.appendChild(roleBox[r]); });
    PRESETS.forEach(function (p) {
      var b = el('button', 'nc-btn', p.n); b.type = 'button';
      b.addEventListener('click', function () {
        f.kind.value = p.kind; f.url.value = p.url; f.label.value = p.n;
        pub = !!p.pub;
        if (pub) { R.ROLES.forEach(function (r) { roleBox[r].querySelector('input').checked = r === 'worker'; }); }
        setStatus(pub ? 'เติม URL ของ ' + p.n + ' แล้ว ใส่ชื่อโมเดลเอง (ดูรายการที่ /models) ระบบเก็บไว้เฉพาะงานสาธารณะและปิดอยู่จนกว่าคุณจะเปิดเอง' : 'เติม URL ของ ' + p.n + ' แล้ว ใส่ชื่อโมเดลและคีย์เอง', false);
      });

      presetRow.appendChild(b);
    });
    var addBtn = el('button', 'nc-btn pri', 'เพิ่ม'); addBtn.type = 'button';
    addBtn.addEventListener('click', function () {
      var roles = R.ROLES.filter(function (r) { return roleBox[r].querySelector('input').checked; });
      var res = R.add({ label: f.label.value, kind: f.kind.value, url: f.url.value, model: f.model.value, key: f.key.value, roles: roles, enabled: !pub, publicOnly: pub, priority: pub ? 900 : Number(f.priority.value) });
      if (!res.ok) return setStatus('เพิ่มไม่ได้: ' + res.problems.join(' · '), true);
      f.key.value = ''; f.model.value = '';
      setStatus(pub ? 'เพิ่ม "' + res.entry.label + '" แล้ว และปิดไว้ (ส่งเฉพาะงานสาธารณะ เปิดเองเมื่อพร้อม)' : 'เพิ่ม "' + res.entry.label + '" แล้ว และเปิดไว้', false);
      pub = false;

      paint();
    });
    [f.kind, f.label, f.url, f.model, f.key, f.priority].forEach(function (x) { form.appendChild(x); x.style.cssText = 'display:block;width:100%;margin:4px 0'; });
    form.appendChild(roleRow); form.appendChild(presetRow); form.appendChild(addBtn);
    card.appendChild(form); card.appendChild(status);
    host.appendChild(card);
    mountNpc(host);

    function setStatus(t, bad) { status.textContent = t; status.style.color = bad ? '#c0392b' : ''; }

    // ประวัติการเรียกล่าสุด 10 ครั้งของโมเดลนี้ (มาจากบันทึกในความจำของทะเบียน ไม่บันทึกลงเครื่อง)
    function fillHist(box, id) {
      box.textContent = '';
      var hist = R.log().filter(function (x) { return x.id === id; }).slice(-10).reverse();
      if (!hist.length) { box.textContent = 'ยังไม่มีการเรียกในรอบนี้'; return; }
      hist.forEach(function (x) {
        var line = el('div', null, (x.ok ? '✓ ' : '✗ ') + new Date(x.t).toLocaleTimeString('th-TH') + ' · ' + x.ms + ' ms' + (x.ok ? '' : ' · ' + (R.CAT_LABEL[x.cat] || R.CAT_LABEL.other) + ' · ' + x.error));
        line.style.color = x.ok ? '' : '#c0392b';
        line.style.wordBreak = 'break-word';
        box.appendChild(line);
      });
    }

    function row(e) {
      var r = el('div'); r.style.cssText = 'border:1px solid #8884;border-radius:8px;padding:8px;margin:6px 0';
      var head = el('div'); head.appendChild(el('strong', null, e.label));
      head.appendChild(el('span', 'nc-muted', '  · ' + (KIND_LABEL[e.kind] || e.kind) + (e.model ? ' · ' + e.model : '')));
      r.appendChild(head);
      var line = el('div', 'nc-row');
      line.appendChild(check('เปิด', e.enabled, function (on) { R.setEnabled(e.id, on); paint(); }));
      R.ROLES.forEach(function (role) {
        line.appendChild(check(ROLE_LABEL[role] || role, e.roles.indexOf(role) >= 0, function (on) {
          var roles = e.roles.filter(function (x) { return x !== role; });
          if (on) roles.push(role);
          R.update(e.id, { roles: roles }); paint();
        }));
      });
      r.appendChild(line);
      var act = el('div', 'nc-row');
      var pr = el('input'); pr.type = 'number'; pr.value = String(e.priority); pr.style.width = '80px'; pr.title = 'ลำดับ (น้อยก่อน)';
      pr.addEventListener('change', function () { var res = R.update(e.id, { priority: Number(pr.value) }); if (!res.ok) setStatus(res.problems.join(' · '), true); else paint(); });
      act.appendChild(el('span', 'nc-muted', 'ลำดับ')); act.appendChild(pr);
      var tb = el('button', 'nc-btn', 'ทดสอบ'); tb.type = 'button';
      var out = el('span', 'nc-muted', '');
      tb.addEventListener('click', async function () {
        out.textContent = 'กำลังทดสอบ…'; tb.disabled = true;
        var p = await R.ping(e.id);
        tb.disabled = false;
        out.textContent = p.ok ? 'ใช้ได้ (' + p.ms + ' ms): ' + p.text.slice(0, 40) : 'ไม่ผ่าน: ' + p.error;
        out.style.color = p.ok ? '' : '#c0392b';
        fillHist(r.querySelector('[data-hist="' + e.id + '"]'), e.id);
      });
      var rm = el('button', 'nc-btn', 'ลบ'); rm.type = 'button';
      rm.addEventListener('click', function () { if (root.confirm && !root.confirm('ลบ "' + e.label + '"?')) return; R.remove(e.id); paint(); });
      act.appendChild(tb); act.appendChild(rm); act.appendChild(out);
      r.appendChild(act);
      var hist = el('div', 'nc-muted'); hist.style.cssText = 'font-size:12px;margin-top:6px';
      hist.setAttribute('data-hist', e.id);
      fillHist(hist, e.id);
      r.appendChild(hist);
      tb.addEventListener('click', function () { setTimeout(function () { fillHist(hist, e.id); }, 0); });
      return r;
    }

    function paint() {
      list.textContent = '';
      var items = R.list();
      if (!items.length) list.appendChild(el('p', 'nc-muted', 'ยังไม่มีโมเดลที่เพิ่มไว้ ทางเดิมของแอปจะทำงานตามปกติ'));
      items.forEach(function (e) { list.appendChild(row(e)); });
    }
    paint();
  }

  root.ninoRosterUI = { mount: mount, PRESETS: PRESETS };
})(typeof window !== 'undefined' ? window : globalThis);
