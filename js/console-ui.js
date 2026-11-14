/* NINO Console: one full-screen sheet with Terminal · Versions (Build/OTA) · Godview · Logs.
   Everything coming from the repo (commit messages, bundle names) is rendered with textContent, never innerHTML. */
(function () {
  'use strict';
  var N = window.NINO_NATIVE && window.ninoNative && window.ninoNative.call ? window.ninoNative : null;
  var root = null, panes = {}, tabs = {}, cur = 'versions', pushed = false, ignorePop = false, termView = null, logTimer = null, scheduled = false;
  var gv = { a: '', b: '', cmp: null, heat: false };
  function O() { return window.ninoOta; }
  function S() { return window.ninoSys; }
  function G() { return window.ninoGodview; }
  function say(m, t) { if (typeof toast === 'function') toast(m, t || 'ok'); }

  var CSS = '#nino-console{position:fixed;inset:0;z-index:100000;display:none;flex-direction:column;background:#14111A;color:#E9E2EE;font:14px/1.45 system-ui,-apple-system,"Noto Sans Thai",sans-serif;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}' +
    '#nino-console.on{display:flex}#nino-console.peek{visibility:hidden}' +
    '#nino-console *{box-sizing:border-box}' +
    '.nc-top{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #3A3145;background:#1D1824}' +
    '.nc-top b{font-size:15px}.nc-chip{font-size:11px;padding:2px 8px;border-radius:99px;border:1px solid #3A3145;color:#A79BB3;margin-left:auto;max-width:48vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.nc-x{background:#272030;color:#E9E2EE;border:1px solid #3A3145;border-radius:8px;padding:6px 12px;font-size:14px}' +
    '.nc-tabs{display:flex;background:#1D1824;border-bottom:1px solid #3A3145}' +
    '.nc-tabs button{flex:1;padding:10px 4px;background:none;border:0;border-bottom:2px solid transparent;color:#A79BB3;font-size:13px}' +
    '.nc-tabs button.on{color:#FBF7FD;border-bottom-color:#F28AB2}' +
    '.nc-body{flex:1;min-height:0;position:relative}.nc-pane{position:absolute;inset:0;overflow:auto;padding:10px;display:none;-webkit-overflow-scrolling:touch}.nc-pane.on{display:block}' +
    '.nc-card{background:#1D1824;border:1px solid #3A3145;border-radius:10px;padding:10px;margin-bottom:10px}.nc-card h4{margin:0 0 6px;font-size:13px;color:#A79BB3;font-weight:600}' +
    '.nc-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.nc-row>*{flex:1 1 auto}' +
    '.nc-btn{padding:10px 12px;border-radius:8px;border:1px solid #3A3145;background:#272030;color:#E9E2EE;font-size:14px;min-height:40px}.nc-btn:disabled{opacity:.45}' +
    '.nc-btn.pri{background:#D9558A;border-color:#E8689C;color:#fff;font-weight:600}.nc-btn.warn{background:#9a6700;border-color:#bb8009;color:#fff}.nc-btn.dng{background:#da3633;border-color:#F26D78;color:#fff}.nc-btn.sm{padding:5px 9px;min-height:30px;font-size:12px}' +
    '.nc-big{width:100%;padding:14px;font-size:16px}' +
    '.nc-muted{color:#A79BB3;font-size:12px}.nc-pre{white-space:pre-wrap;word-break:break-word;font:12px/1.5 ui-monospace,Menlo,monospace;background:#14111A;border:1px solid #3A3145;border-radius:8px;padding:8px;margin:6px 0 0}' +
    '.nc-badge{display:inline-block;font-size:10px;padding:1px 6px;border-radius:99px;border:1px solid #3A3145;margin-left:4px;color:#A79BB3}.nc-badge.ok{color:#8FD3B0;border-color:#D9558A}.nc-badge.bad{color:#ff7b72;border-color:#da3633}.nc-badge.pin{color:#d29922;border-color:#9a6700}' +
    '.nc-ver{border:1px solid #3A3145;border-radius:8px;padding:8px;margin-bottom:6px;background:#14111A}.nc-ver.act{border-color:#E8689C;background:#0f1f14}.nc-ver .t{display:flex;gap:6px;align-items:center;flex-wrap:wrap}' +
    '.nc-st{display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #272030;font-size:13px}.nc-st .i{width:18px;text-align:center}.nc-st .d{color:#A79BB3;font-size:12px}' +
    '.nc-term{display:flex;flex-direction:column;height:100%}.nc-out{flex:1;min-height:0;overflow:auto;background:#010409;padding:8px;font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all}' +
    '.nc-l.nc-cmd{color:#79c0ff}.nc-l.nc-note{color:#A79BB3}.nc-keys{display:flex;gap:6px;padding:6px;background:#1D1824;overflow-x:auto}.nc-keys button{padding:7px 12px;border-radius:6px;border:1px solid #3A3145;background:#272030;color:#E9E2EE;flex:0 0 auto}' +
    '.nc-in{display:flex;gap:6px;padding:6px;background:#1D1824;border-top:1px solid #3A3145}.nc-in .nc-ps{align-self:center;color:#8FD3B0;font:14px ui-monospace,monospace}.nc-in input{flex:1;min-width:0;background:#14111A;border:1px solid #3A3145;border-radius:6px;color:#FBF7FD;padding:9px;font:14px ui-monospace,Menlo,monospace}.nc-in button{padding:0 14px;border-radius:6px;border:1px solid #E8689C;background:#D9558A;color:#fff}' +
    '.nc-thumbs{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px}.nc-th{flex:0 0 92px;border:2px solid #3A3145;border-radius:8px;overflow:hidden;background:#14111A;position:relative}.nc-th img{display:block;width:100%;height:150px;object-fit:cover;object-position:top}.nc-th.a{border-color:#F28AB2}.nc-th.b{border-color:#8FD3B0}.nc-th .c{font-size:10px;padding:3px;color:#A79BB3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nc-th .tag{position:absolute;top:2px;left:2px;font-size:10px;padding:1px 5px;border-radius:99px;background:#F28AB2;color:#000}.nc-th.b .tag{background:#8FD3B0}' +
    '.nc-cmp{display:flex;gap:8px}.nc-cmp .p{flex:1;min-width:0;position:relative}.nc-cmp img{width:100%;display:block;border-radius:6px;border:1px solid #3A3145}.nc-cmp canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;border-radius:6px}' +
    '.nc-lg{font:11px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word}.nc-lg .E{color:#ff7b72}.nc-lg .W{color:#d29922}.nc-lg .I{color:#E9E2EE}.nc-lg .D{color:#6e7681}' +
    '.nc-sel{background:#14111A;color:#E9E2EE;border:1px solid #3A3145;border-radius:6px;padding:6px}';

  function h(tag, props, kids) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c == null || c === false) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function card(title, kids) { return h('div', { class: 'nc-card' }, [title ? h('h4', { text: title }) : null].concat(kids || [])); }
  function when(ts) { try { return new Date(ts).toLocaleString('th-TH', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function mb(n) { return (n / 1048576).toFixed(1) + ' MB'; }
  /* disables a button while its async handler runs; failures become toasts instead of silent no-ops */
  function act(btn, fn, label) {
    return function () {
      if (btn.disabled) return;
      var old = btn.textContent; btn.disabled = true; if (label) btn.textContent = label;
      Promise.resolve().then(fn).catch(function (e) { say('✗ ' + (e && e.message || e), 'err'); }).then(function () { btn.disabled = false; btn.textContent = old; });
    };
  }
  function button(text, cls, fn, label) { var b = h('button', { type: 'button', class: 'nc-btn ' + (cls || ''), text: text }); b.addEventListener('click', act(b, fn, label)); return b; }

  /* ---------- Versions ---------- */
  var remoteList = null, apkInfo = null, checkInfo = null;
  function stepIcon(s) { return { todo: '○', doing: '◐', done: '●', skip: '–', fail: '✗' }[s] || '○'; }

  async function renderVersions() {
    var P = panes.versions; P.textContent = '';
    if (!O() || !O().native) {
      P.appendChild(card('OTA / Build', [h('div', { text: 'ฟีเจอร์นี้ใช้ได้ในแอป NINO.apk (มีสะพานเนทีฟ). ในเบราว์เซอร์ ให้ commit แล้วรอ GitHub Pages deploy ตามเดิม — แต่ Terminal คำสั่ง nino, Godview (ไม่มีภาพจริง) และ Logs ใช้ได้' })]));
      return;
    }
    var s = O().state(); if (!s) { try { s = await O().refresh(); } catch (e) { P.appendChild(card('ข้อผิดพลาด', [h('div', { text: e.message })])); return; } }
    await O().buildInfo();
    var run = O().running(), sys = S(), st = sys.state();

    /* NINO asked for something */
    var rq = sys.pendingRequest();
    if (rq) P.appendChild(card('NINO ขอ ' + (rq.kind === 'build' ? 'Build' : 'ย้อนเวอร์ชัน'), [
      h('div', { text: rq.message || (rq.kind === 'build' ? 'AI ทำงานเสร็จแล้วและขอสร้างเวอร์ชันใหม่ทั้งแอป' : 'AI ขอย้อนกลับเวอร์ชันก่อนหน้า') }),
      h('div', { class: 'nc-row', style: 'margin-top:8px' }, [
        button(rq.kind === 'build' ? '✓ ยืนยัน Build' : '✓ ยืนยันย้อน', 'pri', function () { sys.clearRequest(); return rq.kind === 'build' ? sys.build({ message: rq.message }) : sys.step(-1); }),
        button('ปฏิเสธ', '', function () { sys.clearRequest(); })])]));

    /* now running */
    P.appendChild(card('กำลังใช้งาน', [
      h('div', {}, [h('b', { text: run.builtin ? 'builtin (ติดมากับ APK)' : run.id }), s.pending ? h('span', { class: 'nc-badge pin', text: 'รอยืนยันสุขภาพ' }) : h('span', { class: 'nc-badge ok', text: 'ปกติ' })]),
      h('div', { class: 'nc-muted', text: 'v' + (run.version || '?') + ' · run ' + (run.run || '-') + (run.commit ? ' · ' + run.commit.slice(0, 7) : '') + ' · เก็บไว้ ' + s.history.length + ' เวอร์ชัน (' + mb(s.bytes) + ') · ' + (s.requireSignature ? 'บังคับลายเซ็น' : 'โหมด debug: ไม่บังคับลายเซ็น') }),
      s.lastRollback ? h('div', { class: 'nc-muted', style: 'color:#d29922', text: 'ถอยกลับอัตโนมัติล่าสุด: ' + s.lastRollback }) : null,
      h('div', { class: 'nc-row', style: 'margin-top:8px' }, [
        (function () { var b = button('ย้อนกลับ' + (s.back ? ' (' + s.back + ')' : ''), '', function () { return sys.step(-1, say); }); if (!s.back) b.disabled = true; return b; })(),
        (function () { var b = button('ถัดไป ', '', function () { return sys.step(1, say); }); if (!s.next) b.disabled = true; return b; })()])]));

    /* build */
    var buildKids = [];
    var bb = button(st.running ? (st.armed ? 'รอ NINO ทำงานเสร็จ…' : 'กำลัง Build…') : 'Build & รีบูตทั้งแอป', 'pri nc-big', function () { return sys.build({ log: say }); });
    if (st.running) bb.disabled = true;
    buildKids.push(bb);
    buildKids.push(h('div', { class: 'nc-muted', style: 'margin-top:6px', text: 'กดแล้วรอ NINO ทำงานเสร็จ → จับภาพก่อน → commit งานค้าง → รอ CI → ดาวน์โหลด+ตรวจลายเซ็น → รีบูตทั้งแอป → จับภาพหลังแล้วเทียบ' }));
    if (st.running) buildKids.push(button('ยกเลิก', 'dng sm', function () { sys.cancelBuild(); }));
    if (st.steps.length) {
      var list = h('div', { style: 'margin-top:8px' });
      st.steps.forEach(function (x) { list.appendChild(h('div', { class: 'nc-st' }, [h('span', { class: 'i', text: stepIcon(x.status) }), h('div', {}, [h('div', { text: x.label }), x.detail ? h('div', { class: 'd', text: x.detail }) : null])])); });
      buildKids.push(list);
    }
    if (st.error) buildKids.push(h('div', { style: 'color:#ff7b72;margin-top:6px', text: '✗ ' + st.error }));
    var auto = h('label', { class: 'nc-muted', style: 'display:flex;gap:8px;margin-top:8px;align-items:center' }, [h('input', { type: 'checkbox' }), 'ให้ NINO สั่ง Build/ย้อนเวอร์ชันและรีบูตเองได้ (ปกติปิด: ต้องกดยืนยัน)']);
    auto.firstChild.checked = sys.autoOn();
    auto.firstChild.addEventListener('change', function (e) { sys.setAuto(e.target.checked); });
    buildKids.push(auto);
    P.appendChild(card('Build', buildKids));

    /* result of the last build */
    var res = sys.lastResult();
    if (res) P.appendChild(card(res.ok ? '✓ ผลหลังอัปเดต' : 'ผลหลังอัปเดต', [
      h('pre', { class: 'nc-pre', text: res.text || '(ไม่มีรายละเอียด)' }),
      h('div', { class: 'nc-row', style: 'margin-top:8px' }, [
        button('ใช้ต่อ', 'pri', function () { sys.dismissResult(); }),
        button('ย้อนกลับ', 'warn', function () { sys.dismissResult(); return sys.step(-1, say); }),
        res.after ? button('ดูใน Godview', '', function () { gv.a = res.before || ''; gv.b = res.after; gv.cmp = null; open('godview'); }) : null])]));

    /* update check */
    var upKids = [];
    upKids.push(button('ตรวจเวอร์ชันใหม่', '', async function () { checkInfo = await O().check(); render(); }));
    if (checkInfo) {
      upKids.push(h('div', { class: 'nc-muted', style: 'margin-top:6px', text: checkInfo.pointer ? 'ล่าสุด: ' + checkInfo.pointer.tag + ' (v' + (checkInfo.pointer.version || '?') + ', run ' + (checkInfo.pointer.run || '-') + ')' : 'ยังไม่มีเวอร์ชัน OTA ใน GitHub (ต้อง commit/รัน CI ก่อน)' }));
      if (checkInfo.available) upKids.push(button('ติดตั้งและรีบูต', 'pri', function () { return sys.updateLatest(say); }));
      else if (checkInfo.pointer) upKids.push(h('div', { class: 'nc-muted', text: 'คุณใช้เวอร์ชันล่าสุดอยู่แล้ว' }));
    }
    P.appendChild(card('อัปเดตจาก GitHub', upKids));

    /* history */
    var hist = h('div');
    var rows = [{ id: 'builtin', version: run.builtin ? run.version : (self.NINO_VERSION || ''), message: 'ติดมากับ APK', builtin: true }].concat(s.history.slice().reverse());
    rows.forEach(function (m) {
      var isAct = s.active === m.id;
      var t = h('div', { class: 't' }, [h('b', { text: m.builtin ? 'builtin' : m.id }), m.version ? h('span', { class: 'nc-muted', text: 'v' + m.version }) : null,
        isAct ? h('span', { class: 'nc-badge ok', text: 'ใช้อยู่' }) : null, m.bad ? h('span', { class: 'nc-badge bad', text: 'เปิดไม่ผ่าน' }) : null,
        m.pinned ? h('span', { class: 'nc-badge pin', text: 'ปักหมุด' }) : null, !m.builtin ? h('span', { class: 'nc-badge' + (m.signed ? ' ok' : ''), text: m.signed ? 'signed' : 'unsigned' }) : null]);
      var el = h('div', { class: 'nc-ver' + (isAct ? ' act' : '') }, [t,
        h('div', { class: 'nc-muted', text: (m.run ? 'run ' + m.run + ' · ' : '') + (m.installedAt ? when(m.installedAt) + ' · ' : '') + (m.size ? mb(m.size) + ' · ' : '') + String(m.message || '').slice(0, 90) })]);
      if (!isAct) {
        var r = h('div', { class: 'nc-row', style: 'margin-top:6px' });
        r.appendChild(button('ใช้เวอร์ชันนี้', 'sm', function () { if (!window.confirm('รีบูตแอปเพื่อใช้ ' + m.id + ' ?')) return; return sys.use(m.id, say); }));
        if (!m.builtin) {
          r.appendChild(button(m.pinned ? 'เลิกปักหมุด' : 'ปัก', 'sm', async function () { await O().pin(m.id, !m.pinned); render(); }));
          r.appendChild(button('ลบ', 'sm dng', async function () { if (!window.confirm('ลบ ' + m.id + ' ออกจากเครื่อง?')) return; await O().remove(m.id); render(); }));
        }
        el.appendChild(r);
      }
      hist.appendChild(el);
    });
    P.appendChild(card('เวอร์ชันในเครื่อง (ล่าสุดอยู่บน)', [hist]));

    /* remote */
    var rem = [button(remoteList ? 'โหลดรายการใหม่' : 'ดูเวอร์ชันเก่าบน GitHub', '', async function () { remoteList = await O().remote(); render(); })];
    if (remoteList) {
      if (!remoteList.length) rem.push(h('div', { class: 'nc-muted', text: 'ยังไม่มีรีลีส web-* บน GitHub' }));
      remoteList.forEach(function (x) {
        var row = h('div', { class: 'nc-ver' }, [h('div', { class: 't' }, [h('b', { text: x.tag }), x.installed ? h('span', { class: 'nc-badge ok', text: 'อยู่ในเครื่องแล้ว' }) : null]), h('div', { class: 'nc-muted', text: (x.publishedAt || '').slice(0, 16).replace('T', ' ') + ' · ' + String(x.name || '').slice(0, 70) })]);
        if (!x.installed) { var ib = button('ดาวน์โหลดเก็บไว้', 'sm', async function () { await O().install(x.tag, { allowOlder: true }); remoteList = await O().remote(); render(); }); row.appendChild(h('div', { style: 'margin-top:6px' }, [ib])); }
        rem.push(row);
      });
    }
    P.appendChild(card('ย้อนดูเวอร์ชันที่เคยทำ (จาก GitHub)', rem));

    /* native apk */
    var ak = [button('ตรวจ APK ใหม่ (ส่วนเนทีฟ)', '', async function () { apkInfo = await O().apkCheck(); render(); })];
    if (apkInfo) {
      ak.push(h('div', { class: 'nc-muted', style: 'margin-top:6px', text: 'ติดตั้งอยู่: ' + apkInfo.installedName + ' (code ' + apkInfo.installedCode + ')' + (apkInfo.apk ? ' · ล่าสุด: v' + apkInfo.apk.versionName + ' (code ' + apkInfo.apk.versionCode + ')' : ' · ยังไม่มี APK ในรีลีส nino-latest') }));
      if (apkInfo.newer) ak.push(button('ดาวน์โหลดและติดตั้ง APK', 'warn', async function () {
        if (!window.confirm('ติดตั้ง APK v' + apkInfo.apk.versionName + ' ?\nAndroid จะขอให้กดยืนยันอีกครั้ง และแอปจะรีสตาร์ต')) return;
        await O().apkInstall(function (p) { /* progress shown by the button label below */ });
        say('ส่งให้ตัวติดตั้งของ Android แล้ว — กดยืนยัน', 'ok');
      }));
    }
    ak.push(h('div', { class: 'nc-muted', style: 'margin-top:6px', text: 'ใช้เมื่อมีการแก้ Kotlin/Java (โฟลเดอร์ android/) — แก้เฉพาะหน้าเว็บไม่ต้องใช้ปุ่มนี้ เพราะ Build ด้านบนอัปเดตหน้าเว็บให้เลย' }));
    P.appendChild(card('ส่วนเนทีฟ (APK)', ak));
  }

  /* ---------- Godview ---------- */
  function heatCanvas(px) {
    var c = document.createElement('canvas'); c.width = px.w; c.height = px.h;
    var g = c.getContext('2d'), id = g.createImageData(px.w, px.h);
    for (var i = 0; i < px.mask.length; i++) if (px.mask[i]) { id.data[i * 4] = 255; id.data[i * 4 + 1] = 60; id.data[i * 4 + 2] = 60; id.data[i * 4 + 3] = 170; }
    g.putImageData(id, 0, 0);
    return c;
  }
  function renderGodview() {
    var P = panes.godview; P.textContent = '';
    var g = G(); if (!g) { P.appendChild(card('Godview', [h('div', { text: 'ยังไม่พร้อม' })])); return; }
    var lab = h('input', { class: 'nc-sel', placeholder: 'ชื่อภาพ (เช่น ก่อนแก้ปุ่ม)', style: 'flex:2;min-width:0' });
    P.appendChild(card('จับภาพหน้าจอ', [h('div', { class: 'nc-row' }, [lab, button('จับภาพ', 'pri', async function () { var s = await g.snap(lab.value); say('จับภาพแล้ว ' + s.id + (s.dom.issues.length ? ' · พบ ' + s.dom.issues.length + ' ปัญหา' : '')); render(); })]),
      h('div', { class: 'nc-muted', style: 'margin-top:6px', text: (N ? 'จับพิกเซลจริงของหน้าจอ (PixelCopy) ' : 'เบราว์เซอร์: ไม่มีภาพจริง — ตรวจโครงสร้างอย่างเดียว ') + '· ซ่อนหน้าต่างนี้ชั่วคราวระหว่างจับ' })]));
    var list = g.list();
    var th = h('div', { class: 'nc-thumbs' });
    list.forEach(function (x) {
      var cls = 'nc-th' + (gv.a === x.id ? ' a' : gv.b === x.id ? ' b' : '');
      var el = h('div', { class: cls }, [x.url ? h('img', { src: x.url, loading: 'lazy', alt: '' }) : h('div', { style: 'height:150px;display:flex;align-items:center;justify-content:center;color:#6e7681;font-size:11px', text: 'ไม่มีภาพ' }),
        gv.a === x.id ? h('span', { class: 'tag', text: 'ก่อน' }) : gv.b === x.id ? h('span', { class: 'tag', text: 'หลัง' }) : null,
        h('div', { class: 'c', text: (x.label || x.id) + ' · ' + x.dom.issues.length + '!' })]);
      el.addEventListener('click', function () {
        if (gv.a === x.id) gv.a = ''; else if (gv.b === x.id) gv.b = '';
        else if (!gv.a) gv.a = x.id; else if (!gv.b) gv.b = x.id; else { gv.a = x.id; gv.b = ''; }
        gv.cmp = null; renderGodview();
      });
      th.appendChild(el);
    });
    P.appendChild(card('ภาพที่เก็บไว้ — แตะเลือก "ก่อน" แล้ว "หลัง"', [list.length ? th : h('div', { class: 'nc-muted', text: 'ยังไม่มีภาพ' }),
      h('div', { class: 'nc-row', style: 'margin-top:8px' }, [
        (function () { var b = button('เทียบก่อน/หลัง', 'pri', async function () { gv.cmp = await g.compare(gv.a, gv.b); renderGodview(); }); if (!(gv.a && gv.b)) { /* default compares the two newest */ if (list.length < 2) b.disabled = true; } return b; })(),
        button('ตรวจหน้าจอตอนนี้', '', function () { var d = g.dom(); gv.cmp = { text: g.describe({ id: 'now', label: 'ตอนนี้', t: Date.now(), version: self.NINO_VERSION, bundle: O() && O().native ? O().running().id : '', dom: d }), a: null, b: null, px: null }; renderGodview(); }),
        gv.b || gv.a ? button('ลบที่เลือก', 'dng sm', function () { [gv.a, gv.b].forEach(function (i) { if (i) g.remove(i); }); gv.a = gv.b = ''; gv.cmp = null; renderGodview(); }) : null])]));
    if (gv.cmp) {
      var c = gv.cmp, kids = [];
      if (c.a && c.b && (c.a.url || c.b.url)) {
        var pa = h('div', { class: 'p' }, [c.a.url ? h('img', { src: c.a.url, alt: 'ก่อน' }) : null, h('div', { class: 'nc-muted', text: 'ก่อน · ' + (c.a.label || c.a.id) })]);
        var pb = h('div', { class: 'p' }, [c.b.url ? h('img', { src: c.b.url, alt: 'หลัง' }) : null, h('div', { class: 'nc-muted', text: 'หลัง · ' + (c.b.label || c.b.id) })]);
        if (gv.heat && c.px) pb.appendChild(heatCanvas(c.px));
        kids.push(h('div', { class: 'nc-cmp' }, [pa, pb]));
        if (c.px) kids.push(h('div', { class: 'nc-row', style: 'margin-top:8px' }, [button(gv.heat ? 'ซ่อน heatmap' : 'แสดง heatmap ส่วนที่เปลี่ยน', 'sm', function () { gv.heat = !gv.heat; renderGodview(); })]));
        if (c.b.url) kids.push(h('div', { class: 'nc-row', style: 'margin-top:6px' }, [button('ส่งภาพ "หลัง" ให้ AI ในข้อความถัดไป', 'sm', function () { return g.attachToChat(c.b.id).then(function () { say('แนบภาพแล้ว — พิมพ์ข้อความถึง NINO ได้เลย'); }); })]));
      }
      kids.push(h('pre', { class: 'nc-pre', text: c.text }));
      P.appendChild(card('ผลวิเคราะห์', kids));
    }
  }

  /* ---------- Logs ---------- */
  async function renderLogs() {
    var P = panes.logs;
    if (!P._built) {
      P._built = true;
      P.appendChild(h('div', { id: 'nc-crash' }));
      var lvl = h('select', { class: 'nc-sel', id: 'nc-lvl' }, ['D', 'I', 'W', 'E'].map(function (x) { return h('option', { value: x, text: { D: 'ทั้งหมด', I: 'info+', W: 'เตือน+', E: 'error' }[x] }); }));
      lvl.value = 'I'; lvl.addEventListener('change', renderLogs);
      P.appendChild(h('div', { class: 'nc-row', style: 'margin-bottom:8px' }, [lvl, button('รีเฟรช', 'sm', renderLogs), button('คัดลอกรายงานวินิจฉัย', 'sm pri', async function () { var t = await window.ninoObs.report(); try { await navigator.clipboard.writeText(t); say('คัดลอกแล้ว — วางให้ AI ได้เลย'); } catch (e) { say('คัดลอกไม่ได้ ใช้ nino diag ในเทอร์มินัลแทน', 'err'); } })]));
      P.appendChild(card('ตัวชี้วัด', [h('div', { id: 'nc-met', class: 'nc-pre', text: '…' })]));
      P.appendChild(card('Log เนทีฟ + JS', [h('div', { id: 'nc-lg', class: 'nc-lg', text: '…' })]));
    }
    if (!N) { P.querySelector('#nc-lg').textContent = 'ไม่มี log เนทีฟในเบราว์เซอร์ — แสดง error ของหน้าเว็บแทน\n' + window.ninoObs.ring().slice(-60).map(function (x) { return new Date(x.t).toISOString().slice(11, 19) + ' ' + x.l + '/' + x.tag + ': ' + x.msg.split('\n')[0]; }).join('\n'); return; }
    var level = P.querySelector('#nc-lvl').value;
    try {
      var lg = await N.call('log.tail', { n: 150, level: level }), box = P.querySelector('#nc-lg'); box.textContent = '';
      lg.lines.forEach(function (x) { box.appendChild(h('div', { class: x.l, text: new Date(x.t).toISOString().slice(11, 19) + ' ' + x.l + '/' + x.tag + ': ' + x.msg })); });
      if (!lg.lines.length) box.textContent = '(ว่าง)';
      var m = (await N.call('metrics')).metrics, c = m.counters || {};
      P.querySelector('#nc-met').textContent = 'เปิดมาแล้ว ' + m.uptimeSec + ' วิ · JVM ' + m.jvmUsedMb + '/' + m.jvmMaxMb + ' MB · native heap ' + m.nativeHeapMb + ' MB · RAM เครื่องว่าง ' + m.deviceAvailMb + ' MB' + (m.deviceLowMemory ? ' (ใกล้เต็ม!)' : '') + '\nbundle ' + m.activeBundle + ' · เก็บ ' + mb(m.bundleBytes) + ' · ' + (m.webview || '') + '\n' + Object.keys(c).sort().map(function (k) { return k + '=' + c[k]; }).join('  ');
      var cr = (await N.call('log.crash')).crash, cb = P.querySelector('#nc-crash'); cb.textContent = '';
      if (cr) cb.appendChild(card('แอปเคยแครชครั้งก่อน', [h('pre', { class: 'nc-pre', text: String(cr).split('\n').slice(0, 18).join('\n') }), h('div', { class: 'nc-row', style: 'margin-top:6px' }, [
        button('คัดลอกทั้งฉบับ', 'sm', async function () { await navigator.clipboard.writeText(cr); say('คัดลอกแล้ว'); }), button('ล้างรายงาน', 'sm', async function () { await N.call('log.clearCrash'); renderLogs(); })])]));
    } catch (e) { P.querySelector('#nc-lg').textContent = 'อ่าน log ไม่ได้: ' + e.message; }
  }

  /* ---------- shell ---------- */
  function render() {
    if (!root || scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      if (cur === 'versions') renderVersions().catch(function (e) { say('✗ ' + e.message, 'err'); }); else if (cur === 'godview') renderGodview();
    });
  }

  function setTab(t) {
    cur = t;
    Object.keys(tabs).forEach(function (k) { tabs[k].classList.toggle('on', k === t); panes[k].classList.toggle('on', k === t); });
    clearInterval(logTimer); logTimer = null;
    if (t === 'terminal') { if (!termView) termView = window.ninoTerm.mount(panes.terminal); setTimeout(function () { termView.focus(); }, 60); }
    else if (t === 'logs') { renderLogs(); logTimer = setInterval(function () { if (root.classList.contains('on') && !root.classList.contains('peek')) renderLogs(); }, 3000); }
    else { if (t === 'versions' && O() && O().native) O().refresh().catch(function () {}); render(); }
  }

  function build() {
    var st = document.createElement('style'); st.id = 'nino-console-css'; st.textContent = CSS; document.head.appendChild(st);
    var chip = h('span', { class: 'nc-chip', id: 'nc-chip', text: '…' });
    root = h('div', { id: 'nino-console', role: 'dialog', 'aria-label': 'NINO Console' }, [
      h('div', { class: 'nc-top' }, [h('b', { text: 'NINO Console' }), chip, h('button', { class: 'nc-x', type: 'button', text: 'ปิด', 'aria-label': 'ปิด', onclick: function () { close(); } })]),
      h('div', { class: 'nc-tabs' }), h('div', { class: 'nc-body' })]);
    [['terminal', 'Terminal'], ['versions', 'Versions'], ['godview', 'Godview'], ['logs', 'Logs']].forEach(function (x) {
      var b = h('button', { type: 'button', text: x[1] }); b.addEventListener('click', function () { setTab(x[0]); });
      root.querySelector('.nc-tabs').appendChild(b); tabs[x[0]] = b;
      var p = h('div', { class: 'nc-pane', id: 'nc-p-' + x[0] }); root.querySelector('.nc-body').appendChild(p); panes[x[0]] = p;
    });
    document.body.appendChild(root);
    if (O()) O().on(function () { updateChip(); render(); });
    if (S()) S().on(function () { render(); });
    updateChip();
  }
  function updateChip() {
    var c = document.getElementById('nc-chip'); if (!c) return;
    var r = O() && O().native && O().state() ? O().running() : null;
    c.textContent = r ? (r.builtin ? 'builtin' : r.id) + ' · v' + (r.version || '?') : 'v' + (self.NINO_VERSION || '?') + (N ? '' : ' · เบราว์เซอร์');
  }

  function open(tab) {
    if (!root) build();
    root.classList.add('on'); root.classList.remove('peek');
    document.documentElement.style.overflow = 'hidden';
    if (!pushed) { try { history.pushState({ ninoConsole: 1 }, ''); pushed = true; } catch (e) {} }
    setTab(tab || cur);
  }
  function hide() { if (!root) return; root.classList.remove('on'); document.documentElement.style.overflow = ''; clearInterval(logTimer); logTimer = null; }
  function close() { hide(); if (pushed) { pushed = false; ignorePop = true; try { history.back(); } catch (e) { ignorePop = false; } } }
  window.addEventListener('popstate', function () { if (ignorePop) { ignorePop = false; return; } if (pushed) { pushed = false; hide(); } });

  function addDrawerButton(tries) {
    var b = document.getElementById('nd-build');
    if (!b || !b.parentNode) { if (tries < 20) setTimeout(function () { addDrawerButton(tries + 1); }, 300); return; }
    if (document.getElementById('nd-console')) return;
    var btn = document.createElement('button'); btn.className = 'nd-b'; btn.id = 'nd-console'; btn.textContent = 'Console · Terminal / Build / Godview';
    btn.addEventListener('click', function () { open(); });
    b.parentNode.parentNode.insertBefore(btn, b.parentNode);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { addDrawerButton(0); }); else addDrawerButton(0);

  window.ninoConsole = { open: open, close: close, isOpen: function () { return !!root && root.classList.contains('on'); }, tab: function () { return cur; },
    peek: function (v) { if (!root) return; root.classList.toggle('peek', !!v); document.documentElement.style.overflow = (!v && root.classList.contains('on')) ? 'hidden' : ''; } };
})();
