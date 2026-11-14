/* Music button beside Build. Plays YouTube links the person pastes, through the official embedded player.
   Audio only: the player is kept off-screen, controlled with postMessage (no extra scripts). */
(function () {
    'use strict';
    var KEY = 'nino.music.q';
    var TKEY = 'nino.music.t';
    var FKEY = 'nino.music.fold';
    var OKEY = 'nino.music.opt';
    var WAIT_MS = 9000;
    var ERR = { 2: 'ลิงก์เพลงไม่ถูกต้อง', 5: 'เครื่องเล่นทำงานผิดพลาด', 100: 'ไม่พบวิดีโอนี้ อาจถูกลบหรือตั้งเป็นส่วนตัว', 101: 'เจ้าของวิดีโอไม่อนุญาตให้เล่นในเว็บนี้', 150: 'เจ้าของวิดีโอไม่อนุญาตให้เล่นในเว็บนี้', 153: 'การตั้งค่าเครื่องเล่นผิดพลาด' };
    var ORIGIN = 'https://www.youtube-nocookie.com';
    var S = { q: [], i: 0, state: 'idle', timer: null, open: false, wd: null, fails: 0, t: 0, d: 0, drag: false, unm: false, titles: {}, folded: false, msgT: null, rep: false, vol: 100, volDone: false, listOn: false };
    var $ = function (id) { return document.getElementById(id); };

    /* ---------- links ---------- */
    function valid(id) { return typeof id === 'string' && /^[\w-]{11}$/.test(id); }
    function ytId(raw) {
        var t = String(raw || '').trim();
        if (valid(t)) return t;
        var u;
        try { u = new URL(t); } catch (e) { return ''; }
        var h = u.hostname.replace(/^(www|m|music)\./, ''), id = '';
        if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
        else if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
            if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
            else { var m = /^\/(embed|shorts|live|v)\/([\w-]{11})/.exec(u.pathname); if (m) id = m[2]; }
        }
        return valid(id) ? id : '';
    }
    function parseList(text) {
        var out = [], seen = {};
        String(text || '').split(/\s+/).forEach(function (tok) {
            var id = ytId(tok);
            if (id && !seen[id]) { seen[id] = 1; out.push(id); }
        });
        return out;
    }
    function loadQ() {
        try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(valid) : []; }
        catch (e) { return []; }
    }
    function saveQ() { try { localStorage.setItem(KEY, JSON.stringify(S.q)); } catch (e) { } }
    function loadT() { try { var o = JSON.parse(localStorage.getItem(TKEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
    function saveT() { try { localStorage.setItem(TKEY, JSON.stringify(S.titles)); } catch (e) { } }
    function loadO() { try { var o = JSON.parse(localStorage.getItem(OKEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
    function saveO() { try { localStorage.setItem(OKEY, JSON.stringify({ rep: S.rep, vol: S.vol })); } catch (e) { } }

    /* ---------- player ---------- */
    function embed(id, auto, ctrl) {
        var o = (location.protocol === 'http:' || location.protocol === 'https:') ? '&origin=' + encodeURIComponent(location.origin) : '';
        return ORIGIN + '/embed/' + id + '?autoplay=' + (auto ? 1 : 0) + '&enablejsapi=1&controls=' + (ctrl ? 1 : 0) + '&playsinline=1&rel=0&modestbranding=1' + o;
    }
    function frame() {
        var f = $('nino-yt');
        if (f) return f;
        f = document.createElement('iframe');
        f.id = 'nino-yt';
        f.title = 'เครื่องเล่นเพลง';
        f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
        f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        f.style.cssText = 'position:fixed;left:0;bottom:0;width:200px;height:113px;border:0;opacity:.01;pointer-events:none;z-index:-1;';
        f.addEventListener('load', function () {
            try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), ORIGIN); } catch (e) { }
        });
        document.body.appendChild(f);
        return f;
    }
    /* Watch mode: the same player, shown as a 16:9 video under the music button. Audio-only keeps it hidden. */
    var HIDDEN = 'position:fixed;left:0;bottom:0;width:200px;height:113px;border:0;opacity:.01;pointer-events:none;z-index:-1;';
    function placeVideo(f) {
        var b = $('music-btn');
        var w = Math.min(340, innerWidth - 16);
        var r = b ? b.getBoundingClientRect() : { bottom: 56, right: innerWidth - 8 };
        var top = Math.round(r.bottom + 8);
        f.style.cssText = 'position:fixed;top:' + top + 'px;right:' + Math.max(8, Math.round(innerWidth - r.right)) + 'px;width:' + w + 'px;height:' + Math.round(w * 9 / 16) + 'px;border:0;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.5);z-index:9001;background:#000;';
    }
    function setWatch(on) {
        S.watch = !!on;
        var f = $('nino-yt');
        if (!f) return;
        f.style.cssText = S.watch && S.state !== 'idle' ? '' : HIDDEN;
        if (S.watch && S.state !== 'idle') placeVideo(f);
        var b = document.querySelector('#music-panel [data-act="watch"]');
        if (b) { b.classList.toggle('on', S.watch); b.setAttribute('aria-pressed', S.watch ? 'true' : 'false'); }
    }
    function cmd(func, args) {
        var f = $('nino-yt');
        if (f && f.contentWindow) {
            try { f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), ORIGIN); } catch (e) { }
        }
    }
    function arm() {
        clearTimeout(S.wd);
        S.wd = setTimeout(function () { S.wd = null; if (S.state === 'loading') blocked(); }, WAIT_MS);
    }
    function disarm() { clearTimeout(S.wd); S.wd = null; }
    function blocked() {
        var f = $('nino-yt');
        S.unm = false; S.volDone = false;
        setState('paused');
        if (f && S.q.length) f.src = embed(S.q[S.i], false, true);
        setWatch(true);
        flash('เสียงยังไม่เริ่ม กดปุ่มเล่นในกรอบวิดีโอด้านล่างได้เลย');
    }
    function play(i) {
        if (!S.q.length) return;
        S.i = (i + S.q.length) % S.q.length;
        var f = frame();
        S.t = 0; S.d = 0; S.unm = false; S.volDone = false;
        f.src = embed(S.q[S.i], true);
        setState('loading');
        setWatch(S.watch);
        arm();
        paintSeek();
    }
    function toggle() {
        if (S.state === 'playing' || S.state === 'loading') { disarm(); cmd('pauseVideo'); setState('paused'); }
        else if (S.state === 'paused') { cmd('unMute'); cmd('playVideo'); setState('loading'); arm(); }
        else play(S.i);
    }
    function next(auto) { if (auto && !S.rep && S.i + 1 >= S.q.length) return stop(); play(S.i + 1); }
    function prev() { play(S.i - 1); }
    function stop() {
        disarm();
        var f = $('nino-yt');
        if (f) { cmd('stopVideo'); f.src = 'about:blank'; f.style.cssText = HIDDEN; }
        S.fails = 0; S.t = 0; S.d = 0;
        paintSeek();
        setState('idle');
        closePanel();
    }
    function onFail(code) {
        if (S.state === 'idle') return;
        disarm();
        S.fails++;
        var msg = ERR[code] || 'เล่นเพลงนี้ไม่ได้';
        if (S.fails < S.q.length) { flash(msg); return next(false); }
        stop();
        if (typeof window.toast === 'function') window.toast(msg, 'warn');
    }
    window.addEventListener('message', function (ev) {
        if (ev.origin !== ORIGIN || S.state === 'idle') return;
        var d;
        try { d = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data; } catch (e) { return; }
        if (!d) return;
        if (d.event === 'onError') return onFail(Number(d.info));
        if (d.event !== 'infoDelivery' || !d.info) return;
        var info = d.info, id = S.q[S.i], vd = info.videoData;
        if (vd && vd.title && (!vd.video_id || vd.video_id === id) && S.titles[id] !== vd.title) { S.titles[id] = vd.title; saveT(); refresh(); }
        if (typeof info.currentTime === 'number') S.t = info.currentTime;
        if (typeof info.duration === 'number' && info.duration > 0) S.d = info.duration;
        if (!S.drag) paintSeek();
        if (info.muted === true && !S.unm) { S.unm = true; cmd('unMute'); }
        var st = info.playerState;
        if (st === 1) { disarm(); S.fails = 0; if (!S.volDone) { S.volDone = true; cmd('setVolume', [S.vol]); } setState('playing'); }
        else if (st === 2 && (S.state === 'playing' || S.state === 'loading')) { disarm(); setState('paused'); }
        else if (st === 0) next(true);
    });

    /* ---------- UI ---------- */
    var NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" fill="currentColor"/><circle cx="18" cy="16" r="3" fill="currentColor"/></svg>';
    var ICON = {
        prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M19 5L9 12l10 7z" fill="currentColor"/></svg>',
        next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M5 5l10 7-10 7z" fill="currentColor"/></svg>',
        play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5l13 7.5-13 7.5z" fill="currentColor"/></svg>',
        pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>',
        stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>',
        film: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>',
        edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'
    };
    ICON.fold = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    ICON.repeat = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    ICON.list = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    var NOTE_COLORS = ['#F28AB2', '#C9A8F5', '#8FD3B0', '#7fe7ff', '#F2C275'];

    function mountButton() {
        var fb = $('fb-b');
        if (!fb || $('music-btn')) return !!fb;
        var b = document.createElement('button');
        b.id = 'music-btn';
        b.type = 'button';
        b.className = 'mb';
        b.setAttribute('aria-label', 'เล่นเพลงจากลิงก์ YouTube');
        b.title = 'เพลง';
        b.innerHTML = '<span class="mb-glyph">' + NOTE + '</span><span class="mb-live" aria-hidden="true"></span>';
        b.addEventListener('click', onButton);
        fb.parentNode.insertBefore(b, fb.nextSibling);
        buildPanel();
        buildSheet();
        return true;
    }

    function buildPanel() {
        var p = document.createElement('div');
        p.id = 'music-panel';
        p.className = 'mp';
        p.setAttribute('role', 'dialog');
        p.setAttribute('aria-label', 'เครื่องเล่นเพลง');
        p.innerHTML =
            '<div class="mp-head"><div class="mp-disc"><span class="mp-disc-note">' + NOTE + '</span></div>' +
            '<div class="mp-meta"><div class="mp-title" id="mp-title"></div><div class="mp-sub" id="mp-sub"></div></div>' +
            '<button type="button" class="mp-edit mp-fold" data-act="fold" aria-expanded="true" aria-label="พับแผงเพลง" title="พับแผงเพลง">' + ICON.fold + '</button>' +
            '<button type="button" class="mp-edit" data-act="edit" aria-label="แก้รายการลิงก์" title="แก้รายการลิงก์">' + ICON.edit + '</button></div>' +
            '<div class="mp-eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
            '<div class="mp-seek"><span class="mp-cur" id="mp-cur">0:00</span>' +
            '<div class="mp-track" id="mp-track" role="slider" tabindex="0" aria-label="ตำแหน่งเพลง" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-valuetext="0:00"><div class="mp-fill" id="mp-fill"></div><div class="mp-knob" id="mp-knob"></div></div>' +
            '<span class="mp-dur" id="mp-dur">--:--</span></div>' +
            '<div class="mp-ctrl">' +
            '<button type="button" class="mp-b" data-act="prev" aria-label="เพลงก่อนหน้า">' + ICON.prev + '</button>' +
            '<button type="button" class="mp-b mp-main" data-act="toggle" aria-label="เล่น / หยุดชั่วคราว"></button>' +
            '<button type="button" class="mp-b" data-act="next" aria-label="เพลงถัดไป">' + ICON.next + '</button>' +
            '<button type="button" class="mp-b mp-watch" data-act="watch" aria-pressed="false" aria-label="ดูวิดีโอ" title="ดูวิดีโอ">' + ICON.film + '</button>' +
            '<button type="button" class="mp-b mp-stop" data-act="stop" aria-label="หยุดและปิดเพลง" title="หยุด">' + ICON.stop + '</button>' +
            '</div>' +
            '<div class="mp-extra">' +
            '<button type="button" class="mp-x" data-act="repeat" aria-pressed="false" aria-label="วนซ้ำทั้งรายการ" title="วนซ้ำทั้งรายการ">' + ICON.repeat + '</button>' +
            '<button type="button" class="mp-x" data-act="list" aria-expanded="false" aria-label="รายการเพลง" title="รายการเพลง">' + ICON.list + '</button>' +
            '<label class="mp-vol"><span>เสียง</span><input type="range" id="mp-vol" min="0" max="100" step="5" value="100" aria-label="ระดับเสียง"></label>' +
            '</div>' +
            '<div class="mp-list" id="mp-list"></div>' +
            '<div class="mp-msg" id="mp-msg" role="status" aria-live="polite"></div>';
        p.addEventListener('click', function (e) {
            e.__inMusic = true;
            var b = e.target.closest && e.target.closest('[data-act]');
            if (!b) return;
            var act = b.getAttribute('data-act');
            if (act === 'prev') prev();
            else if (act === 'next') next(false);
            else if (act === 'toggle') toggle();
            else if (act === 'stop') stop();
            else if (act === 'watch') setWatch(!S.watch);
            else if (act === 'edit') openSheet();
            else if (act === 'fold') setFold(!S.folded);
            else if (act === 'repeat') { S.rep = !S.rep; saveO(); paintOpts(); }
            else if (act === 'list') { S.listOn = !S.listOn; paintList(); paintOpts(); }
            else if (act === 'pick') play(Number(b.getAttribute('data-idx')));
        });
        var tr = p.querySelector('#mp-track');
        tr.addEventListener('pointerdown', function (e) {
            if (!(S.d > 0)) return;
            S.drag = true;
            try { tr.setPointerCapture(e.pointerId); } catch (x) { }
            seekAt(e.clientX, false);
        });
        tr.addEventListener('pointermove', function (e) { if (S.drag) seekAt(e.clientX, false); });
        tr.addEventListener('pointerup', function (e) { if (!S.drag) return; S.drag = false; seekAt(e.clientX, true); });
        tr.addEventListener('pointercancel', function () { S.drag = false; paintSeek(); });
        tr.addEventListener('keydown', function (e) {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            seekTo(S.t + (e.key === 'ArrowLeft' ? -5 : 5));
        });
        var vol = p.querySelector('#mp-vol');
        vol.addEventListener('input', function () { S.vol = Number(vol.value); saveO(); cmd('setVolume', [S.vol]); });
        document.body.appendChild(p);
        setFold(S.folded);
        paintOpts();
        var n = document.createElement('div');
        n.id = 'music-notes';
        n.setAttribute('aria-hidden', 'true');
        document.body.appendChild(n);
    }

    function buildSheet() {
        var s = document.createElement('div');
        s.id = 'music-sheet';
        s.className = 'ms';
        s.setAttribute('role', 'dialog');
        s.setAttribute('aria-label', 'วางลิงก์เพลง');
        s.innerHTML =
            '<div class="ms-title">ลิงก์เพลงจาก YouTube</div>' +
            '<div class="ms-hint">วางลิงก์ทีละบรรทัด หรือคั่นด้วยเว้นวรรค ใช้ได้ทั้ง youtu.be และ youtube.com</div>' +
            '<textarea id="ms-text" class="ms-text" rows="4" spellcheck="false" placeholder="https://youtu.be/..."></textarea>' +
            '<div class="ms-count" id="ms-count">ยังไม่มีลิงก์</div>' +
            '<div class="ms-row"><button type="button" class="ms-cancel" data-act="cancel">ยกเลิก</button><button type="button" class="ms-ok" data-act="ok">เริ่มเล่น</button></div>';
        s.addEventListener('click', function (e) {
            e.__inMusic = true;
            var b = e.target.closest && e.target.closest('[data-act]');
            if (!b) return;
            if (b.getAttribute('data-act') === 'cancel') return closeSheet();
            var ids = parseList($('ms-text').value);
            if (!ids.length) { flash('ไม่พบลิงก์ YouTube ที่ใช้ได้'); return; }
            S.q = ids; S.i = 0; S.fails = 0; saveQ();
            closeSheet();
            play(0);
            openPanel();
        });
        s.querySelector('#ms-text').addEventListener('input', function (e) {
            var n = parseList(e.target.value).length;
            $('ms-count').textContent = n ? 'พบ ' + n + ' เพลง' : 'ยังไม่มีลิงก์';
        });
        document.body.appendChild(s);
    }

    function openSheet() {
        closePanel();
        var s = $('music-sheet');
        $('ms-text').value = S.q.map(function (id) { return 'https://youtu.be/' + id; }).join('\n');
        $('ms-count').textContent = S.q.length ? 'พบ ' + S.q.length + ' เพลง' : 'ยังไม่มีลิงก์';
        s.classList.add('show');
        setTimeout(function () { $('ms-text').focus(); }, 60);
    }
    function closeSheet() { var s = $('music-sheet'); if (s) s.classList.remove('show'); }

    function placeAt(el) {
        var r = $('music-btn').getBoundingClientRect();
        el.style.top = Math.round(r.bottom + 8) + 'px';
        el.style.right = Math.max(8, Math.round(innerWidth - r.right)) + 'px';
    }
    function openPanel() {
        if (!S.q.length) return openSheet();
        var p = $('music-panel');
        placeAt(p);
        p.classList.add('show');
        S.open = true;
        refresh();
    }
    function closePanel() { var p = $('music-panel'); if (p) p.classList.remove('show'); S.open = false; }

    function onButton(e) {
        e.__inMusic = true;
        e.stopPropagation();
        if (!S.q.length) return openSheet();
        if (S.state === 'idle') { play(S.i); return openPanel(); }
        S.open ? closePanel() : openPanel();
    }

    function refresh() {
        var id = S.q[S.i] || '', t = $('mp-title'), sub = $('mp-sub'), main = document.querySelector('#music-panel [data-act="toggle"]');
        if (t) t.textContent = S.titles[id] || id;
        if (sub) sub.textContent = 'เพลง ' + (S.i + 1) + ' / ' + S.q.length + ' · YouTube';
        if (sub) sub.title = id ? 'https://youtu.be/' + id : '';
        if (main) main.innerHTML = S.state === 'playing' || S.state === 'loading' ? ICON.pause : ICON.play;
        var p = $('music-panel');
        if (p) p.setAttribute('data-state', S.state);
        var b = $('music-btn');
        if (b) b.setAttribute('data-state', S.state);
        paintList();
        paintOpts();
    }

    function setState(st) {
        S.state = st;
        refresh();
        if (st === 'playing') startNotes(); else stopNotes();
    }

    function spawnNote() {
        var b = $('music-btn'), host = $('music-notes');
        if (!b || !host || document.hidden) return;
        var r = b.getBoundingClientRect();
        var el = document.createElement('span');
        el.className = 'mn';
        var size = 12 + Math.round(Math.random() * 8);
        var sway = Math.round(10 + Math.random() * 14) * (Math.random() < 0.5 ? -1 : 1);
        el.style.left = Math.round(r.left + r.width / 2 - size / 2 + (Math.random() * 14 - 7)) + 'px';
        el.style.top = Math.round(r.top - 4) + 'px';
        el.style.width = el.style.height = size + 'px';
        el.style.color = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
        el.style.setProperty('--sway', sway + 'px');
        el.style.animationDuration = (2.6 + Math.random() * 1.2).toFixed(2) + 's';
        el.innerHTML = NOTE;
        host.appendChild(el);
        el.addEventListener('animationend', function () { el.remove(); });
    }
    function startNotes() {
        if (S.timer) return;
        spawnNote();
        S.timer = setInterval(spawnNote, 620);
    }
    function stopNotes() {
        if (S.timer) { clearInterval(S.timer); S.timer = null; }
    }

    function flash(msg) {
        var m = $('mp-msg');
        if (m && S.open) {
            m.textContent = msg;
            clearTimeout(S.msgT);
            S.msgT = setTimeout(function () { m.textContent = ''; }, 5000);
        } else if (typeof window.toast === 'function') window.toast(msg, 'warn');
    }
    function escHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    }
    function paintOpts() {
        var r = document.querySelector('#music-panel [data-act="repeat"]'), l = document.querySelector('#music-panel [data-act="list"]'), v = $('mp-vol');
        if (r) { r.classList.toggle('on', S.rep); r.setAttribute('aria-pressed', S.rep ? 'true' : 'false'); }
        if (l) { l.classList.toggle('on', S.listOn); l.setAttribute('aria-expanded', S.listOn ? 'true' : 'false'); }
        if (v) v.value = String(S.vol);
    }
    function paintList() {
        var l = $('mp-list');
        if (!l) return;
        l.classList.toggle('show', S.listOn);
        l.innerHTML = S.q.map(function (id, i) {
            return '<button type="button" class="mp-li' + (i === S.i ? ' on' : '') + '" data-act="pick" data-idx="' + i + '">' + (i + 1) + '. ' + escHtml(S.titles[id] || id) + '</button>';
        }).join('');
    }
    function fmt(sec) {
        var s = Math.max(0, Math.floor(sec || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
        return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
    }
    function paintSeek(ratio) {
        var fill = $('mp-fill'), tr = $('mp-track');
        if (!fill || !tr) return;
        var p = typeof ratio === 'number' ? ratio : (S.d > 0 ? Math.min(1, S.t / S.d) : 0), at = p * S.d;
        fill.style.width = (p * 100).toFixed(2) + '%';
        $('mp-knob').style.left = (p * 100).toFixed(2) + '%';
        $('mp-cur').textContent = fmt(at);
        $('mp-dur').textContent = S.d > 0 ? fmt(S.d) : '--:--';
        tr.setAttribute('aria-valuemax', String(Math.round(S.d)));
        tr.setAttribute('aria-valuenow', String(Math.round(at)));
        tr.setAttribute('aria-valuetext', fmt(at) + ' จาก ' + fmt(S.d));
    }
    function seekTo(sec) {
        if (!(S.d > 0)) return;
        S.t = Math.min(S.d, Math.max(0, sec));
        paintSeek();
        cmd('seekTo', [S.t, true]);
    }
    function seekAt(clientX, commit) {
        var tr = $('mp-track');
        if (!tr || !(S.d > 0)) return;
        var r = tr.getBoundingClientRect(), p = Math.min(1, Math.max(0, (clientX - r.left) / (r.width || 1)));
        if (commit) seekTo(p * S.d); else paintSeek(p);
    }
    function setFold(on) {
        S.folded = !!on;
        try { localStorage.setItem(FKEY, S.folded ? '1' : '0'); } catch (e) { }
        var p = $('music-panel');
        if (!p) return;
        p.classList.toggle('folded', S.folded);
        var b = p.querySelector('[data-act="fold"]'), label = S.folded ? 'ขยายแผงเพลง' : 'พับแผงเพลง';
        if (b) { b.setAttribute('aria-expanded', S.folded ? 'false' : 'true'); b.setAttribute('aria-label', label); b.title = label; }
    }

    document.addEventListener('click', function (e) {
        if (!S.open || e.__inMusic) return;
        closePanel();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closePanel(); closeSheet(); }
    });

    S.q = loadQ();
    S.titles = loadT();
    var o = loadO();
    S.rep = !!o.rep;
    S.vol = typeof o.vol === 'number' ? Math.min(100, Math.max(0, o.vol)) : 100;
    S.folded = (function () { try { return localStorage.getItem(FKEY) === '1'; } catch (e) { return false; } })();
    S.watch = false;
    var tries = 0;
    var iv = setInterval(function () { if (mountButton() || ++tries > 80) clearInterval(iv); }, 300);
    function pauseForGame() {
        if (S.state !== 'playing' && S.state !== 'loading') return;
        S.gameResume = true;
        disarm(); cmd('pauseVideo'); setState('paused');
    }
    function resumeAfterGame() {
        if (!S.gameResume) return;
        S.gameResume = false;
        if (S.state === 'paused' && S.q.length) { cmd('unMute'); cmd('playVideo'); setState('loading'); arm(); }
    }
    window.ninoMusic = { parse: parseList, ytId: ytId, play: play, stop: stop, pauseForGame: pauseForGame, resumeAfterGame: resumeAfterGame, state: function () { return { state: S.state, i: S.i, n: S.q.length }; } };
})();
