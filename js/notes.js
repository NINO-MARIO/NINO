/* Notes (บันทึกย่อ): the chat is summarised every 8 finished rounds into notes that cover a range of rounds.
   A note is shown as a timeline (range, time, summary), can be read in full, edited, regenerated from its own
   rounds, deleted, or used to jump back to the story. The last notes are put into the system prompt, so the
   model keeps the thread of a long story or project after older messages are trimmed. */
(function () {
    'use strict';
    var EVERY = 8;          // finished rounds per note
    var MAX_IN_PROMPT = 6;  // newest notes sent to the model
    var S = { busy: false, timer: null, open: false };
    var $ = function (id) { return document.getElementById(id); };
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function toastMsg(t, k) { if (typeof toast === 'function') toast(t, k); }
    function notesList() { if (typeof session === 'undefined') return []; if (!Array.isArray(session.notes)) session.notes = []; return session.notes; }
    function persist() { if (typeof persistSession === 'function') persistSession(); }

    /* ---------- rounds ---------- */
    function plainText(m) {
        var t = String((m && (m.reply || m.text || m.content)) || '');
        return t.replace(/\[\[\/?[A-Z_]+[^\]]*\]\]/g, '').replace(/\s+/g, ' ').trim();
    }
    function rounds() {
        var ms = (typeof session !== 'undefined' && session.messages) || [], out = [];
        ms.forEach(function (m, i) {
            if (!m || m.streaming || m.sender !== 'user') return;
            out.push({ n: out.length + 1, idx: i, ts: m.ts || 0 });
        });
        return out;
    }
    /* A round is finished once the next user message exists. */
    function finishedRounds() { var r = rounds(); return r.slice(0, Math.max(0, r.length - 1)); }
    function noteOf(n) { return notesList().filter(function (x) { return n >= x.from && n <= x.to; })[0] || null; }
    function uncovered() { return finishedRounds().filter(function (r) { return !noteOf(r.n); }); }
    function transcriptFor(from, to) {
        var r = rounds(), ms = session.messages, start = r[from - 1].idx, endRound = r[to] ? r[to].idx : ms.length;
        var lines = [], total = 0;
        for (var i = start; i < endRound; i++) {
            var m = ms[i];
            if (!m || m.streaming) continue;
            var t = plainText(m).slice(0, 420);
            if (!t) continue;
            var line = (m.sender === 'user' ? 'ผู้ใช้: ' : (m.characterName || 'NINO') + ': ') + t;
            total += line.length;
            if (total > 9000) break;
            lines.push(line);
        }
        return lines.join('\n');
    }
    function isCode() { return !(typeof currentCharacter !== 'undefined' && currentCharacter && currentCharacter.mode === 'roleplay'); }

    /* ---------- writing a note ---------- */
    async function summarise(from, to) {
        var text = transcriptFor(from, to);
        if (!text || typeof geminiGenerate !== 'function') throw new Error('ไม่มีข้อความให้สรุป');
        var sys = isCode()
            ? 'คุณคือผู้ช่วยเขียนบันทึกย่อของงานโค้ดที่กำลังทำกันอยู่ เขียนภาษาไทย 3-7 บรรทัดสั้นๆ สรุปเฉพาะสิ่งที่เกิดขึ้นจริงในข้อความที่ให้: สิ่งที่ทำไปแล้ว ไฟล์หรือส่วนที่เปลี่ยน ปัญหาที่เจอ และงานที่ค้างอยู่ ห้ามเดาเพิ่ม ห้ามใช้หัวข้อหรือมาร์กอัป'
            : 'คุณคือผู้ช่วยเขียนบันทึกย่อของเรื่องที่กำลังเล่นกัน เขียนภาษาไทย 4-8 บรรทัดสั้นๆ สรุปเฉพาะสิ่งที่เกิดขึ้นจริงในข้อความที่ให้: เหตุการณ์สำคัญ สถานะของตัวละคร สถานที่และเวลา และคำสัญญาหรือปมที่ยังค้างอยู่ ห้ามเติมเรื่องที่ไม่อยู่ในข้อความ ห้ามใช้หัวข้อหรือมาร์กอัป';
        var out = await geminiGenerate({ systemInstruction: sys, contents: [{ role: 'user', parts: [{ text: 'ข้อความที่จะสรุป (รอบที่ ' + from + '–' + to + '):\n' + text }] }], temperature: 0.3 });
        var clean = String(out || '').replace(/[*#`]/g, '').replace(/\n{3,}/g, '\n\n').trim();
        if (clean.length < 20) throw new Error('บันทึกย่อสั้นเกินไป ลองใหม่อีกครั้ง');
        return clean.slice(0, 1500);
    }
    function rangeMeta(from, to) {
        var r = rounds();
        return { fromTs: (r[from - 1] || {}).ts || Date.now(), toTs: (r[to - 1] || r[r.length - 1] || {}).ts || Date.now() };
    }
    async function createNote(from, to, src) {
        var text = await summarise(from, to);
        var meta = rangeMeta(from, to);
        var n = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), from: from, to: to, fromTs: meta.fromTs, toTs: meta.toTs, text: text, src: src || 'auto', regen: 0, at: Date.now() };
        notesList().push(n);
        notesList().sort(function (a, b) { return a.from - b.from; });
        persist();
        return n;
    }

    /* Auto: when 8 finished rounds have no note, write one for the first 8 of them. */
    async function check() {
        if (S.busy) return;
        var todo = uncovered();
        if (todo.length < EVERY) return;
        var block = todo.slice(0, EVERY);
        var from = block[0].n, to = block[block.length - 1].n;
        S.busy = true; render();
        try { await createNote(from, to, 'auto'); toastMsg('สร้างบันทึกย่อรอบที่ ' + from + '–' + to + ' แล้ว'); }
        catch (e) { toastMsg('บันทึกย่อยังไม่ได้: ' + (e.message || e), 'warn'); }
        S.busy = false; render();
        if (uncovered().length >= EVERY) setTimeout(check, 800);
    }
    function scheduleCheck() { clearTimeout(S.timer); S.timer = setTimeout(check, 1500); }

    /* ---------- actions on a note ---------- */
    async function regenerate(id) {
        var n = notesList().filter(function (x) { return x.id === id; })[0];
        if (!n) return;
        S.busy = true; render();
        try {
            n.text = await summarise(n.from, n.to); n.src = 'auto'; n.regen = (n.regen || 0) + 1; n.at = Date.now();
            persist(); toastMsg('สร้างบันทึกย่อใหม่แล้ว');
        } catch (e) { toastMsg('สร้างใหม่ไม่สำเร็จ: ' + (e.message || e), 'warn'); }
        S.busy = false; render();
    }
    function saveEdit(id, text) {
        var n = notesList().filter(function (x) { return x.id === id; })[0];
        if (!n) return;
        var t = String(text || '').trim();
        if (!t) return toastMsg('บันทึกย่อต้องมีข้อความ', 'warn');
        n.text = t.slice(0, 1500); n.src = 'edit'; n.at = Date.now();
        persist(); render(); toastMsg('บันทึกแก้ไขแล้ว');
    }
    function removeNote(id) {
        var n = notesList().filter(function (x) { return x.id === id; })[0];
        if (!n || !window.confirm('ลบบันทึกย่อรอบที่ ' + n.from + '–' + n.to + ' ?\nเนื้อเรื่องในแชทยังอยู่ครบ')) return;
        session.notes = notesList().filter(function (x) { return x.id !== id; });
        persist(); render(); toastMsg('ลบบันทึกย่อแล้ว');
    }
    function jumpTo(n) {
        var r = rounds()[n.from - 1];
        close();
        if (!r) return;
        setTimeout(function () {
            var el = document.querySelector('[data-ts="' + r.ts + '"]');
            if (!el) return toastMsg('ไม่พบข้อความรอบนี้ในแชท', 'warn');
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            el.classList.remove('nn-flash'); void el.offsetWidth; el.classList.add('nn-flash');
        }, 260);
    }

    /* ---------- prompt: the newest notes go into the system prompt ---------- */
    function promptBlock() {
        var list = notesList().slice().sort(function (a, b) { return a.from - b.from; }).slice(-MAX_IN_PROMPT);
        if (!list.length) return '';
        return '\n\n[บันทึกย่อของเรื่องก่อนหน้า (สรุปจากข้อความเก่าที่อาจถูกตัดออกจากบริบท ใช้เป็นความต่อเนื่อง ห้ามอ้างว่าเป็นข้อความที่ผู้ใช้พูด)]\n' +
            list.map(function (n) { return '- รอบที่ ' + n.from + '–' + n.to + ': ' + n.text.slice(0, 700).replace(/\n+/g, ' / '); }).join('\n');
    }
    function wrapPrompt(name) {
        var o = window[name];
        if (typeof o !== 'function' || o.__nn) return;
        var w = function () { return o.apply(this, arguments) + promptBlock(); };
        w.__nn = true;
        window[name] = w;
    }

    /* ---------- the + menu: picture or notes ---------- */
    var ICON_IMG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/></svg>';
    var ICON_BOOK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8 7h8M8 10.5h6"/></svg>';
    function plusMenu(anchor) {
        var m = $('nn-plusmenu');
        if (m) { m.remove(); return; }
        m = document.createElement('div');
        m.id = 'nn-plusmenu';
        m.className = 'nn-menu';
        m.innerHTML = '<button type="button" data-k="img">' + ICON_IMG + '<span>รูปภาพ</span></button><button type="button" data-k="notes">' + ICON_BOOK + '<span>บันทึกย่อ</span></button>';
        document.body.appendChild(m);
        var r = anchor.getBoundingClientRect();
        m.style.left = Math.max(8, Math.round(r.left)) + 'px';
        m.style.bottom = Math.round(innerHeight - r.top + 8) + 'px';
        m.addEventListener('click', function (e) {
            var b = e.target.closest('[data-k]');
            m.remove();
            if (!b) return;
            if (b.getAttribute('data-k') === 'img') { if (window.ninoImg && window.ninoImg.pick) window.ninoImg.pick(); }
            else open();
        });
        setTimeout(function () {
            document.addEventListener('click', function off(e) {
                if (!m.contains(e.target) && e.target !== anchor) { m.remove(); document.removeEventListener('click', off); }
            });
        }, 0);
    }
    function wirePlus() {
        var b = $('btn-img');
        if (!b || b.__nn) return !!b;
        b.__nn = true;
        b.addEventListener('click', function (e) { e.preventDefault(); e.stopImmediatePropagation(); plusMenu(b); }, true);
        return true;
    }

    /* ---------- the notes page ---------- */
    function stamp(ts) {
        var d = new Date(ts || Date.now());
        return ('0' + d.getDate()).slice(-2) + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
    function srcLabel(n) {
        var bits = [n.src === 'edit' ? 'แก้ไขแล้ว' : 'อัตโนมัติ'];
        if (n.regen) bits.push('สร้างใหม่ ' + n.regen + ' ครั้ง');
        return bits.join(' · ');
    }
    function cardHtml(n, expanded) {
        var long = n.text.length > 180;
        return '<article class="nn-card" data-id="' + esc(n.id) + '">' +
            '<span class="nn-dot" aria-hidden="true"></span>' +
            '<div class="nn-head"><span class="nn-range">รอบที่ ' + n.from + (n.to !== n.from ? '–' + n.to : '') + '</span><span class="nn-date">' + esc(stamp(n.toTs)) + '</span><button type="button" class="nn-link" data-act="jump">ไปยังเนื้อเรื่อง</button></div>' +
            '<div class="nn-body' + (expanded ? ' full' : '') + '" data-text>' + esc(n.text).replace(/\n/g, '<br>') + '</div>' +
            '<div class="nn-foot">' +
            '<button type="button" class="nn-ico" data-act="regen" title="สร้างใหม่จากรอบนี้" aria-label="สร้างบันทึกย่อใหม่">' + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>' + '</button>' +
            '<button type="button" class="nn-ico" data-act="edit" title="แก้ไข" aria-label="แก้ไขบันทึกย่อ"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>' +
            '<button type="button" class="nn-ico del" data-act="del" title="ลบ" aria-label="ลบบันทึกย่อ"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg></button>' +
            '<span class="nn-src">' + esc(srcLabel(n)) + '</span>' +
            (long ? '<button type="button" class="nn-more" data-act="more">' + (expanded ? 'ย่อ' : 'ดูข้อความเต็ม') + '</button>' : '') +
            '</div></article>';
    }
    var expandedIds = {};
    function render() {
        var box = $('nn-list');
        if (!box) return;
        var list = notesList().slice().sort(function (a, b) { return a.from - b.from; });
        var pending = uncovered().length;
        var st = $('nn-status');
        if (st) {
            st.textContent = S.busy ? 'กำลังเขียนบันทึกย่อ…' : (pending >= EVERY ? 'มี ' + pending + ' รอบที่รอสรุป' : (pending ? 'ยังไม่ถึง ' + EVERY + ' รอบ · รออีก ' + (EVERY - pending) + ' รอบ' : 'สรุปครบทุกรอบแล้ว'));
        }
        var cnt = $('nn-count');
        if (cnt) cnt.textContent = list.length + ' บันทึก';
        var btn = $('nn-now');
        if (btn) { btn.disabled = S.busy || pending === 0; btn.textContent = S.busy ? 'กำลังสรุป…' : 'สรุปรอบที่เหลือ'; }
        if (!list.length) { box.innerHTML = '<div class="nn-empty">ยังไม่มีบันทึกย่อ ระบบจะสรุปให้ทุก ' + EVERY + ' รอบที่คุยจบ และคุณก็สั่งสรุปเองได้จากปุ่มด้านบน</div>'; return; }
        box.innerHTML = '<div class="nn-line" aria-hidden="true"></div>' + list.map(function (n) { return cardHtml(n, !!expandedIds[n.id]); }).join('');
    }
    function open() {
        var o = $('nino-notes');
        if (!o) {
            o = document.createElement('div');
            o.id = 'nino-notes';
            o.className = 'nn-over';
            o.innerHTML = '<header class="nn-head-bar"><button type="button" class="nn-back" id="nn-back" aria-label="กลับไปยังแชท">‹</button><div class="nn-title"><b>บันทึกย่อ</b><span id="nn-count"></span></div><button type="button" class="nn-now" id="nn-now">สรุปรอบที่เหลือ</button></header>' +
                '<div class="nn-sub" id="nn-status"></div><main class="nn-main" id="nn-list"></main>';
            document.body.appendChild(o);
            o.addEventListener('click', function (e) {
                if (e.target.id === 'nn-back') return close();
                if (e.target.id === 'nn-now') return check();
                var b = e.target.closest('[data-act]');
                if (!b) return;
                var card = b.closest('.nn-card'), id = card && card.getAttribute('data-id');
                var n = notesList().filter(function (x) { return x.id === id; })[0];
                if (!n) return;
                var act = b.getAttribute('data-act');
                if (act === 'jump') jumpTo(n);
                else if (act === 'regen') regenerate(id);
                else if (act === 'del') removeNote(id);
                else if (act === 'more') { expandedIds[id] = !expandedIds[id]; render(); }
                else if (act === 'edit') startEdit(card, n);
                else if (act === 'save') saveEdit(id, card.querySelector('textarea').value);
                else if (act === 'cancel') render();
            });
        }
        o.classList.add('show');
        S.open = true;
        render();
    }
    function startEdit(card, n) {
        var body = card.querySelector('[data-text]');
        body.outerHTML = '<div class="nn-edit"><textarea rows="6" aria-label="แก้ไขบันทึกย่อ">' + esc(n.text) + '</textarea><div class="nn-row"><button type="button" class="nn-cancel" data-act="cancel">ยกเลิก</button><button type="button" class="nn-ok" data-act="save">บันทึก</button></div></div>';
        var ta = card.querySelector('textarea');
        if (ta) ta.focus();
    }
    function close() { var o = $('nino-notes'); if (o) o.classList.remove('show'); S.open = false; }

    /* ---------- boot ---------- */
    wrapPrompt('buildRoleplaySystemPrompt');
    wrapPrompt('buildSystemPrompt');
    var tries = 0;
    var iv = setInterval(function () {
        var ok = wirePlus();
        if (ok && (wrapPrompt('buildRoleplaySystemPrompt'), wrapPrompt('buildSystemPrompt'), true)) {}
        if (++tries > 120) clearInterval(iv);
    }, 250);
    /* persistence is the trigger: after every saved turn, check whether a new note is due */
    (function hookPersist() {
        var t = setInterval(function () {
            if (typeof window.persistSession !== 'function' || window.persistSession.__nn) return;
            var orig = window.persistSession;
            var w = function () { var r = orig.apply(this, arguments); scheduleCheck(); if (S.open) render(); return r; };
            w.__nn = true;
            window.persistSession = w;
            clearInterval(t);
        }, 300);
    })();

    window.ninoNotes = { open: open, close: close, check: check, list: function () { return notesList().slice(); }, rounds: rounds, uncovered: uncovered, promptBlock: promptBlock, regenerate: regenerate, saveEdit: saveEdit, remove: removeNote, plusMenu: plusMenu, busy: function () { return S.busy; } };
})();
