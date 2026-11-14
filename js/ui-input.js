'use strict';
/* ระบบแนบรูป: ดู js/image-bridge.js (ปุ่ม , ถาดรูปในช่องข้อความ, ดวงตาช่วย, ตัวจับเวลาลบรูป) */
let _sendLock = false;

function updatePhaseUI(label, forcedPct) {
    const l = document.getElementById('phase-label'), b = document.getElementById('phase-bar'), e = document.getElementById('phase-eta');
    if (l && label)
        l.textContent = label;
    if (!b)
        return;
    const elapsed = Date.now() - _phaseStartTime;
    const p = typeof forcedPct === 'number' ? Math.min(0.95, forcedPct) : Math.min(0.95, elapsed / 8000);
    b.style.width = (p * 100).toFixed(1) + '%';
    if (e)
        e.textContent = window.ninoAgent && window.ninoAgent.phase() !== 'idle' ? window.ninoAgent.hud() : `${(elapsed / 1000).toFixed(1)}s`;
}

function endPhaseUI(ok) {
    const el = document.getElementById('phase-indicator'), b = document.getElementById('phase-bar'), l = document.getElementById('phase-label'), e = document.getElementById('phase-eta');
    if (b)
        b.style.width = '100%';
    if (l)
        l.textContent = ok ? 'เสร็จสิ้น' : 'ล้มเหลว';
    if (e)
        e.textContent = '';
    setTimeout(() => {
        if (el) {
            el.classList.add('hidden');
            el.classList.remove('flex');
        }
        if (b)
            b.style.width = '0%';
    }, 400);
}

function enterTaskMode() {
    session.taskMode = true;
    const b = document.getElementById('task-lock-badge');
    if (b) {
        b.classList.remove('hidden');
        b.classList.add('flex');
    }
    const i = document.getElementById('prompt-input'), s = document.getElementById('btn-send'), c = document.getElementById('btn-cancel');
    if (i) {
        i.disabled = true;
        i.placeholder = 'NINO กำลังลงมือ...';
    }
    if (s) {
        s.disabled = true;
        s.classList.add('opacity-40');
    }
    if (c)
        c.classList.remove('hidden');
}

function exitTaskMode() {
    session.taskMode = false;
    const b = document.getElementById('task-lock-badge');
    if (b) {
        b.classList.add('hidden');
        b.classList.remove('flex');
    }
    const i = document.getElementById('prompt-input'), s = document.getElementById('btn-send'), c = document.getElementById('btn-cancel');
    if (i) {
        i.disabled = false;
        i.placeholder = currentCharacter.mode === 'roleplay' ? `พูดคุยกับ ${currentCharacter.name}...` : 'สั่งงาน NINO...';
    }
    if (s) {
        s.disabled = false;
        s.classList.remove('opacity-40');
    }
    if (c)
        c.classList.add('hidden');
}

async function handleUserSend() {
    if (session.taskMode || _sendLock)
        return;
    const inp = document.getElementById('prompt-input');
    let txt = inp.value.trim();
    const att = window.ninoImg ? window.ninoImg.getPending() : null;
    if (!txt && !att)
        return;
    const isRoleplay = currentCharacter.mode === 'roleplay';
    let imgMeta = null;
    if (att) {
        _sendLock = true;
        try {
            imgMeta = await window.ninoImg.commit(att);
            window.ninoImg.clearPending();
        }
        catch (e) {
            toast('แนบรูปไม่สำเร็จ: ' + String(e && e.message || e).slice(0, 80), 'err');
            if (!txt)
                return;
        }
        finally {
            _sendLock = false;
        }
        if (!txt)
            txt = isRoleplay ? '*ยื่นรูปภาพให้ดู*' : '(ส่งรูปภาพ)';
    }
    inp.value = '';
    inp.dispatchEvent(new Event('input'));
    const userMsg = {
        sender: 'user', phase: session.phase, text: txt, characterId: currentCharacter.id, characterName: currentCharacter.name
    };
    if (imgMeta)
        userMsg.image = imgMeta;
    session.messages.push(userMsg);
    _activeStreamController = new AbortController();
    const localReqId = ++_requestId;
    if (isRoleplay) {
        session.memory.lastQuery = txt;
        session.fileWriteCounts = {};
        renderMessages();
        enterTaskMode();
        try {
            await runRoleplayTurn(txt);
        }
        finally {
            exitTaskMode();
        }
        if (localReqId !== _requestId)
            return;
        updateBudgetUI();
        persistSession();
        const _ps = _pendingSwitch;
        _pendingSwitch = null;
        if (_ps && _ps.mode === 'code') {
            await setMode('code', true);
            document.getElementById('prompt-input').value = '[NINO สลับโหมดเอง] ' + _ps.goal;
            await handleUserSend();
        }
        return;
    }
    const intent = detectIntent(txt, session.files[session.currentFile] || session.files['index.html'] || '');
    session.memory.lastIntent = intent.intent;
    session.memory.lastQuery = txt;
    session.fileWriteCounts = {};
    _fileFingerprintCache.clear();
    if (!orchestratorState.paused) {
        if (session.ambitionDeclared && !session.taskMode && session.messages.length > 0) {
            session.ambitionTarget = 0;
            session.ambitionDeclared = false;
            session.checklist = [];
            session._lastSeenSize = 0;
            session._lastMilestone = 0;
        }
        if (!session.ambitionDeclared) {
            const parsed = parseExplicitTarget(txt);
            if (parsed) {
                session.ambitionTarget = parsed;
                session.ambitionDeclared = true;
                session._lastMilestone = 0;
                addMemoryEvent(`ambition: pre-declared ${parsed} chars จากคำขอ`, ['ambition'], 5);
            }
        }
    }
    renderMessages();
    startPhaseUI();
    enterTaskMode();
    _phaseTimer = setInterval(() => updatePhaseUI(null, null), 200);
    let res;
    try {
        if (imgMeta && window.ninoImg) {
            updatePhaseUI('กำลังอ่านรูปภาพ...', 0.1);
            await window.ninoImg.buildContext(userMsg, { mode: 'code', signal: _activeStreamController.signal });
        }
        if (orchestratorState.paused && orchestratorState.pendingQuestion) {
            orchestratorState.pendingUserText = orchestratorState.pendingUserText || txt;
            res = await resumeOrchestrator(txt);
        }
        else {
            orchestratorState.pendingUserText = txt;
            res = await orchestratorRun(txt);
        }
    }
    catch (e) {
        res = {
            reply: 'เกิดข้อผิดพลาด: ' + String(e && e.message || e), action: 'ask', filename: '', code: '', reasoning: 'ERR', done: true, error: true
        };
    }
    finally {
        if (_phaseTimer) {
            clearInterval(_phaseTimer);
            _phaseTimer = null;
        }
        exitTaskMode();
        if (imgMeta && window.ninoImg) {
            try {
                window.ninoImg.endTurn(imgMeta);
            }
            catch (_) { }
        }
    }
    if (localReqId !== _requestId)
        return;
    const isErr = res && (res.error || String(res.reasoning || '').startsWith('ERR'));
    if (session.seedStep === 0)
        session.seedStep = 1;
    session.phase++;
    session.messages.push({
        sender: 'nino', phase: session.phase, action: res.action, filename: res.filename, code: res.code, reply: res.reply, reasoning: res.reasoning, thinking: res.thinking, done: res.done, error: isErr, characterId: currentCharacter.id, characterName: currentCharacter.name, characterAvatar: currentCharacter.avatar || ''
    });
    episodicStore.addEpisode(txt + ' → ' + (res.reply || '').slice(0, 150), ['chat', intent.intent]);
    if (episodicStore.episodes.length % 20 === 0)
        episodicStore.decayAndPrune();
    vectorStore.addDocument(txt + ' ' + (res.reply || '').slice(0, 200), { phase: session.phase, intent: intent.intent });
    if (!isErr && res && res.done) {
        const taskLabel = txt.slice(0, 60).replace(/\s+/g, ' ').trim();
        const curSize = (session.files[session.currentFile] || '').length;
        summarizeCompletedTask(taskLabel, session.currentFile, intent.intent, curSize);
        if (session.memory.events.length > 80)
            await compactMemory();
    }
    updateBudgetUI();
    renderMessages();
    renderPreview();
    if (session.memory.events.length > 250)
        await compactMemory();
    renderMemoryDrawer();
    endPhaseUI(!isErr);
    persistSession();
}

async function cancelCurrent() {
    if (window.ninoAgent)
        window.ninoAgent.journal.note('ผู้ใช้ยกเลิกที่ ' + Math.round(window.ninoAgent.elapsed()) + 's');
    if (_activeStreamController) {
        try {
            _activeStreamController.abort();
        }
        catch (_) { }
    }
    _requestId++;
    orchestratorState.done = true;
    orchestratorState.paused = false;
    exitTaskMode();
    if (_phaseTimer) {
        clearInterval(_phaseTimer);
        _phaseTimer = null;
    }
    endPhaseUI(false);
    toast('ยกเลิกแล้ว', 'warn');
    setStatus('on', 'พร้อมทำงาน');
}

function copyToClipboard(text, label) {
    const success = () => toast(`${label || 'คัดลอก'}แล้ว (${text.length.toLocaleString()} ตัวอักษร)`);
    const fallback = () => fallbackCopy(text, success);
    if (navigator.clipboard && navigator.clipboard.writeText && !/(iPad|iPhone|iPod)/.test(navigator.userAgent)) {
        navigator.clipboard.writeText(text).then(success, fallback);
    }
    else {
        fallback();
    }
}

function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;inset:auto 8px 8px 8px;z-index:100001;width:calc(100% - 16px);height:6em;opacity:.98;background:#fff;color:#111;font:14px monospace';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    }
    catch (_) { }
    if (ok) {
        ta.remove();
        done();
    }
    else {
        toast('คัดลอกไม่สำเร็จ', 'err');
    }
}

function installInspector() {
    const overlay = document.getElementById('inspector');
    const codeEl = document.getElementById('nino-inspect-code');
    const sizeEl = document.getElementById('nino-inspect-size');
    let timer = null;
    function fullSource() {
        return '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    }
    function openInspector() {
        const src = fullSource();
        if (src.length > 500000 && !confirm(`source ใหญ่ ${src.length.toLocaleString()} — แสดงต่อ?`))
            return;
        overlay.style.display = 'flex';
        codeEl.textContent = '';
        sizeEl.textContent = `${src.length.toLocaleString()} chars`;
        let i = 0;
        const step = 24;
        function stream() {
            if (overlay.style.display !== 'flex')
                return;
            codeEl.textContent += src.slice(i, i + step);
            codeEl.scrollTop = codeEl.scrollHeight;
            i += step;
            if (i < src.length)
                timer = setTimeout(stream, 10);
            else
                timer = null;
        }
        stream();
    }
    function closeInspector() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        overlay.style.display = 'none';
    }
    const btnI = document.getElementById('nino-inspect');
    if (btnI)
        btnI.addEventListener('click', openInspector);
    const btnC = document.getElementById('nino-inspect-close');
    if (btnC)
        btnC.addEventListener('click', closeInspector);
    const btnCp = document.getElementById('nino-inspect-copy');
    if (btnCp)
        btnCp.addEventListener('click', () => copyToClipboard(fullSource(), 'คัดลอกโค้ด'));
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && overlay.style.display === 'flex')
            closeInspector();
    });
}

function switchTab(target) {
    session.phase = target;
    const tabs = [
        { name: 'chat', btn: document.getElementById('tab-btn-chat'), panel: document.getElementById('panel-chat') }, { name: 'files', btn: document.getElementById('tab-btn-files'), panel: document.getElementById('panel-files') }, { name: 'preview', btn: document.getElementById('tab-btn-preview'), panel: document.getElementById('panel-preview') }
    ];
    tabs.forEach(t => {
        if (t.name === target) {
            t.panel.classList.add('active');
            t.btn.classList.add('border-[#F28AB2]', 'text-[#FBF7FD]', 'bg-[#1D1824]/50');
            t.btn.classList.remove('border-transparent', 'text-[#A79BB3]');
        }
        else {
            t.panel.classList.remove('active');
            t.btn.classList.remove('border-[#F28AB2]', 'text-[#FBF7FD]', 'bg-[#1D1824]/50');
            t.btn.classList.add('border-transparent', 'text-[#A79BB3]');
        }
    });
    if (target === 'files')
        renderFilesList();
    else if (target === 'preview')
        renderPreview();
}
