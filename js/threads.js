/* Chat threads: every conversation is its own thread with its own messages, LLM history, files and character.
   A thread is created by the first message the person sends in a fresh chat; its title is set from that
   context and refined by the model after the first reply. "แชทใหม่" starts a real empty chat; nothing is
   overwritten. Threads live in the existing IndexedDB store 'sessions' under ids 'chat:…'. */
(function () {
    'use strict';
    var ACTIVE_KEY = 'nino.thread.active';
    var PREFIX = 'chat:';
    var S = { id: null, timer: null, titleTried: false, saving: false };
    var $ = function (id) { return document.getElementById(id); };
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function toastMsg(t, k) { if (typeof toast === 'function') toast(t, k); }
    function hasDB() { return typeof DB !== 'undefined' && DB && DB.put; }
    function newId() { return PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

    /* ---------- what counts as a conversation ---------- */
    function userMessages(ms) { return (ms || []).filter(function (m) { return m && m.sender === 'user'; }); }
    function hasConversation() { return typeof session !== 'undefined' && userMessages(session.messages).length > 0; }
    function cleanMessages(ms) {
        return JSON.parse(JSON.stringify((ms || []).filter(function (m) { return m && !m.streaming; }).slice(-300)));
    }
    function heuristicTitle(ms) {
        var u = userMessages(ms)[0];
        var t = String((u && (u.text || u.content || u.message)) || '').replace(/\s+/g, ' ').trim();
        if (t.length < 2) return 'แชทใหม่ ' + new Date().toTimeString().slice(0, 5);
        if (t.length <= 30) return t;
        var cut = t.slice(0, 30), sp = cut.lastIndexOf(' ');
        return (sp > 12 ? cut.slice(0, sp) : cut) + '…';
    }
    function sanitizeTitle(s) {
        var t = String(s || '').split('\n')[0].replace(/[*#`"“”「」'’]/g, '').replace(/^ชื่อ[:：]\s*/, '').trim();
        return t.length > 40 ? t.slice(0, 40).trim() + '…' : t;
    }

    /* ---------- storage ---------- */
    async function getRec(id) { return hasDB() ? DB.get('sessions', id) : null; }
    async function putRec(rec) { if (hasDB()) await DB.put('sessions', rec); }
    async function list() {
        if (!hasDB()) return [];
        var all = await DB.getAll('sessions');
        return all.filter(function (r) { return String(r.id).indexOf(PREFIX) === 0; })
            .map(function (r) { return Object.assign({ updatedAt: r.updatedAt || r.ts || 0, createdAt: r.createdAt || r.ts || 0, titleSrc: r.titleSrc || 'auto' }, r); })
            .sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    }
    function snapshot(id, title) {
        var ms = session.messages || [];
        var ch = typeof currentCharacter !== 'undefined' ? currentCharacter : {};
        var prev = S.rec || {};
        return {
            id: id, title: title, titleSrc: prev.titleSrc || 'auto',
            createdAt: prev.createdAt || Date.now(), updatedAt: Date.now(),
            characterId: ch.id || '', characterName: ch.name || 'NINO', mode: ch.mode || 'code',
            messages: cleanMessages(ms), count: userMessages(ms).length,
            history: (typeof orchestratorState !== 'undefined' && orchestratorState.history) ? orchestratorState.history.slice(-200) : [],
            files: Object.assign({}, session.files || {}), currentFile: session.currentFile || null,
            phase: session.phase || 0, seedStep: session.seedStep || 1, checklist: session.checklist || [],
            notes: JSON.parse(JSON.stringify(session.notes || []))
        };
    }

    /* Save the active thread. Creates it on the first real message. */
    async function save() {
        if (S.saving || typeof session === 'undefined') return;
        if (!S.id) {
            if (!hasConversation()) return;
            S.id = newId();
            S.rec = { createdAt: Date.now(), titleSrc: 'auto' };
            S.rec.title = heuristicTitle(session.messages);
            localStorage.setItem(ACTIVE_KEY, S.id);
        }
        S.saving = true;
        try {
            var rec = snapshot(S.id, (S.rec && S.rec.title) || heuristicTitle(session.messages));
            S.rec = rec;
            await putRec(rec);
            mirrorCharacterChat(rec);
            refreshChip();
            maybeAiTitle();
        } catch (e) { /* storage full or blocked: the chat still works in memory */ }
        S.saving = false;
    }
    /* Save after the reply has finished, not on every streamed piece. */
function schedule() {
    clearTimeout(S.timer);
    var streaming = typeof session !== 'undefined' && session.messages && session.messages.some(function (m) { return m && m.streaming; });
    S.timer = setTimeout(streaming ? schedule : save, streaming ? 1200 : 900);
}

    /* Keep the per-character chat in step with the active thread, so a reload that reads it gets the same text. */
    function mirrorCharacterChat(rec) {
        if (!hasDB() || !rec.characterId) return;
        DB.put('character-chats', { characterId: rec.characterId, messages: rec.messages.slice(-300), updatedAt: Date.now() }).catch(function () { });
    }

    /* ---------- titles from context ---------- */
    async function maybeAiTitle() {
        if (S.titleTried || !S.rec || S.rec.titleSrc !== 'auto') return;
        var replied = (session.messages || []).some(function (m) { return m.sender === 'nino' && m.reply && !m.streaming; });
        if (!replied || typeof geminiGenerate !== 'function') return;
        S.titleTried = true;
        var convo = (session.messages || []).filter(function (m) { return !m.streaming && (m.text || m.reply); }).slice(0, 6)
            .map(function (m) { return (m.sender === 'user' ? 'ผู้ใช้: ' : 'NINO: ') + String(m.text || m.reply).slice(0, 220); }).join('\n');
        try {
            var out = await geminiGenerate({
                systemInstruction: 'ตั้งชื่อหัวข้อแชทภาษาไทยจากบทสนทนา ไม่เกิน 6 คำ ตอบเฉพาะชื่อบรรทัดเดียว ห้ามใส่เครื่องหมายคำพูด ห้ามใส่คำว่าชื่อ',
                contents: [{ role: 'user', parts: [{ text: convo }] }],
                temperature: 0.3
            });
            var t = sanitizeTitle(out);
            if (t.length >= 2 && S.id) {
                S.rec.title = t; S.rec.titleSrc = 'ai';
                await putRec(S.rec);
                refreshChip(); refreshList();
            }
        } catch (e) { /* keep the heuristic title */ }
    }

    /* ---------- actions ---------- */
    async function newChat() {
        if (S.id) await save();
        S.id = null; S.rec = null; S.titleTried = false;
        localStorage.removeItem(ACTIVE_KEY);
        if (typeof resetSession === 'function') resetSession();
        refreshChip(); refreshList();
        toastMsg('เริ่มแชทใหม่แล้ว');
    }

    async function openThread(id) {
        if (S.id === id) return;
        if (S.id) await save();
        var rec = await getRec(id);
        if (!rec) return toastMsg('ไม่พบแชทนี้แล้ว', 'warn');
        S.id = id; S.rec = rec; S.titleTried = rec.titleSrc === 'ai';
        localStorage.setItem(ACTIVE_KEY, id);
        applyRecord(rec);
        refreshChip(); refreshList();
        toastMsg('เปิด "' + rec.title + '"');
    }

    function applyRecord(rec) {
        var ch = (typeof allCharacters !== 'undefined' && allCharacters.find(function (c) { return c.id === rec.characterId; })) || null;
        if (ch && typeof currentCharacter !== 'undefined') {
            currentCharacter = ch;
            if (typeof useMemorySpace === 'function' && typeof spaceModeOf === 'function') useMemorySpace(spaceModeOf(ch));
            localStorage.setItem('nino-last-char', ch.id);
        }
        session.messages = JSON.parse(JSON.stringify(rec.messages || []));
        session.files = Object.assign({}, rec.files || {});
        session.currentFile = rec.currentFile || null;
        session.phase = rec.phase || 0;
        session.seedStep = rec.seedStep || 1;
        session.checklist = rec.checklist || [];
        session.notes = JSON.parse(JSON.stringify(rec.notes || []));
        if (typeof orchestratorState !== 'undefined') {
            orchestratorState.history = (rec.history || []).slice();
            orchestratorState.paused = false; orchestratorState.pendingQuestion = null; orchestratorState.done = false;
        }
        if (typeof _fileFingerprintCache !== 'undefined' && _fileFingerprintCache.clear) _fileFingerprintCache.clear();
        if (typeof updateModeToggle === 'function') updateModeToggle();
        if (typeof updateActiveCharBar === 'function') updateActiveCharBar();
        if (typeof renderMessages === 'function') renderMessages();
        if (typeof renderFilesList === 'function') renderFilesList();
        if (typeof renderQuickChips === 'function') renderQuickChips();
        if (typeof persistSession === 'function') persistSession();
    }

    async function remove(id) {
        var rec = await getRec(id);
        if (!rec) return;
        if (!window.confirm('ลบแชท "' + rec.title + '" ?\nข้อความและไฟล์ของแชทนี้จะหายถาวร')) return;
        await DB.delete('sessions', id);
        if (S.id === id) { S.id = null; S.rec = null; localStorage.removeItem(ACTIVE_KEY); if (typeof resetSession === 'function') resetSession(); }
        refreshChip(); refreshList();
        toastMsg('ลบแชทแล้ว');
    }

    async function rename(id) {
        var rec = await getRec(id);
        if (!rec) return;
        var t = window.prompt('ชื่อแชทใหม่', rec.title);
        if (t == null) return;
        t = sanitizeTitle(t);
        if (!t) return;
        rec.title = t; rec.titleSrc = 'user';
        await putRec(rec);
        if (S.id === id) { S.rec = rec; S.titleTried = true; }
        refreshChip(); refreshList();
    }

    /* ---------- drawer list ---------- */
    async function renderList(box) {
        if (!box) return;
        var all = await list();
        if (!all.length) { box.innerHTML = '<div class="thr-empty">ยังไม่มีแชท ข้อความแรกที่คุยจะกลายเป็นแชทหนึ่งรายการที่นี่</div>'; return; }
        box.innerHTML = all.map(function (r) {
            var on = r.id === S.id;
            var when = (typeof relDayLabel === 'function' ? relDayLabel(r.updatedAt) : '') + ' ' + new Date(r.updatedAt).toTimeString().slice(0, 5);
            return '<div class="thr-row' + (on ? ' on' : '') + '" data-id="' + esc(r.id) + '">' +
                '<button type="button" class="thr-open" data-act="open" aria-label="เปิดแชท ' + esc(r.title) + '">' +
                '<span class="thr-title">' + esc(r.title) + '</span>' +
                '<span class="thr-meta">' + esc(r.characterName || 'NINO') + ' · ' + (r.mode === 'roleplay' ? 'โรลเพลย์' : 'โค้ด') + ' · ' + (r.count || 0) + ' ข้อความ · ' + esc(when) + '</span></button>' +
                '<button type="button" class="thr-ico" data-act="rename" title="เปลี่ยนชื่อ" aria-label="เปลี่ยนชื่อแชท">✎</button>' +
                '<button type="button" class="thr-ico del" data-act="delete" title="ลบแชท" aria-label="ลบแชท">✕</button>' +
                '</div>';
        }).join('');
    }
    function refreshList() { renderList($('nd-chats')); }

    function bindList(box) {
        if (!box || box.__thr) return;
        box.__thr = true;
        box.addEventListener('click', function (e) {
            var b = e.target.closest('[data-act]');
            if (!b) return;
            var row = b.closest('.thr-row');
            if (!row) return;
            var id = row.getAttribute('data-id'), act = b.getAttribute('data-act');
            if (act === 'open') { openThread(id); if (typeof window.ninoDrawerClose === 'function') window.ninoDrawerClose(); }
            else if (act === 'rename') rename(id);
            else if (act === 'delete') remove(id);
        });
    }

    /* ---------- header chip (current title, opens the drawer) ---------- */
    function refreshChip() {
        var c = $('thr-chip');
        if (!c) return;
        c.textContent = S.id && S.rec ? S.rec.title : 'แชทใหม่';
        c.title = 'แชทปัจจุบัน · แตะเพื่อดูรายการแชท';
    }
    function mountChip() {
        var bar = $('active-char-bar');
        if (!bar || $('thr-chip')) return !!bar;
        var c = document.createElement('button');
        c.id = 'thr-chip';
        c.type = 'button';
        c.className = 'thr-chip';
        c.addEventListener('click', function () {
            var nd = document.querySelector('#app-header .w-7.h-7');
            if (nd) nd.click();
        });
        var clr = $('btn-clear-chat');
        bar.insertBefore(c, clr || null);
        refreshChip();
        return true;
    }

    /* ---------- boot: reopen the last active thread ---------- */
    async function restore() {
        var id = localStorage.getItem(ACTIVE_KEY);
        if (!id || !hasDB()) return;
        var rec = await getRec(id);
        if (!rec) { localStorage.removeItem(ACTIVE_KEY); return; }
        S.id = id; S.rec = rec; S.titleTried = rec.titleSrc === 'ai';
        applyRecord(rec);
        refreshChip();
    }

    /* Hook persistence: every persistSession() call (after each turn and edit) also saves the thread. */
    function hookPersist() {
        if (typeof window.persistSession !== 'function' || window.persistSession.__thr) return;
        var orig = window.persistSession;
        var wrapped = function () { var r = orig.apply(this, arguments); schedule(); return r; };
        wrapped.__thr = true;
        window.persistSession = wrapped;
    }

    var tries = 0;
    var iv = setInterval(function () {
        hookPersist();
        mountChip();
        var box = $('nd-chats');
        if (box) bindList(box);
        if (++tries > 120) clearInterval(iv);
    }, 250);
    window.addEventListener('load', function () { setTimeout(restore, 900); });

    window.ninoThreads = { newChat: newChat, open: openThread, remove: remove, rename: rename, list: list, renderList: function (b) { bindList(b); return renderList(b); }, save: save, current: function () { return S.id; } };
})();
