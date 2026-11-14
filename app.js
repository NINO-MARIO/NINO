'use strict';

function wireEvents() {
    bind('tab-btn-chat', 'click', () => switchTab('chat'));
    bind('tab-btn-files', 'click', () => switchTab('files'));
    bind('tab-btn-preview', 'click', () => switchTab('preview'));
    bind('btn-send', 'click', handleUserSend);
    bind('btn-cancel', 'click', cancelCurrent);
    bind('btn-phase-cancel', 'click', cancelCurrent);
    bind('prompt-input', 'keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleUserSend();
        }
    });
    bind('prompt-input', 'input', e => {
        const t = e.target;
        t.style.height = 'auto';
        t.style.height = Math.min(t.scrollHeight, 120) + 'px';
        const cc = document.getElementById('char-counter');
        if (cc)
            cc.textContent = t.value.length;
    });
    if (fileEditorTextarea)
        fileEditorTextarea.addEventListener('input', () => {
            session.files[session.currentFile] = fileEditorTextarea.value;
            updateLineNumbers();
        });
    bind('btn-clear-chat', 'click', () => {
        if (window.ninoThreads)
            window.ninoThreads.newChat();
        else {
            const c = document.getElementById('chat-messages-container');
            if (c)
                c.innerHTML = '';
            resetSession();
        }
        setStatus('info', 'เริ่มแชทใหม่แล้ว (แชทเดิมยังอยู่ในรายการแชท)');
    });
    bind('file-search-input', 'input', e => searchFiles(e.target.value));
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const si = document.getElementById('file-search-input');
            if (si) {
                si.focus();
                si.select();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (fileEditorTextarea) {
                session.files[session.currentFile] = fileEditorTextarea.value;
                _broadcast('file-update', { path: session.currentFile, content: session.files[session.currentFile] });
                renderPreview();
                toast('บันทึกแล้ว (Ctrl+S)');
                persistSession();
            }
        }
    });
    if (fileEditorTextarea)
        fileEditorTextarea.addEventListener('scroll', () => {
            editorLineNumbers.scrollTop = fileEditorTextarea.scrollTop;
        });
    if (fileEditorTextarea) {
        fileEditorTextarea.addEventListener('click', updateCursorPos);
        fileEditorTextarea.addEventListener('keyup', updateCursorPos);
        fileEditorTextarea.addEventListener('keydown', e => {
            if (e.key === 'Tab') {
                e.preventDefault();
                editorIndent(e.shiftKey);
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                editorDuplicateLine();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                e.preventDefault();
                editorToggleComment();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
                e.preventDefault();
                editorGoToLine();
            }
        });
    }
    bind('btn-save-current-file', 'click', () => {
        session.files[session.currentFile] = fileEditorTextarea.value;
        _broadcast('file-update', { path: session.currentFile, content: session.files[session.currentFile] });
        renderPreview();
        toast('บันทึกแล้ว');
        persistSession();
    });
    bind('btn-new-file', 'click', openImportFile);
    bind('file-import-name', 'input', updateImportStatus);
    bind('file-import-code', 'input', updateImportStatus);
    bind('btn-import-save', 'click', saveImportedFile);
    bind('btn-import-close', 'click', () => closeImportFile());
    bind('btn-delete-active-file', 'click', () => {
        if (session.currentFile === 'index.html') {
            alert('ไม่สามารถลบ index.html ได้');
            return;
        }
        if (confirm(`ลบไฟล์ ${session.currentFile}?`)) {
            const _dp = session.currentFile;
            delete session.files[_dp];
            session.currentFile = 'index.html';
            _broadcast('file-delete', { path: _dp });
            renderFilesList();
            renderPreview();
            updateBudgetUI();
            persistSession();
        }
    });
    bind('btn-undo', 'click', () => {
        if (!session.history.length) {
            toast('ไม่มี snapshot', 'warn');
            return;
        }
        const snap = session.history.pop();
        if (snap.content === null || snap.content === undefined) {
            session.history.push(snap);
            toast('snapshot ไม่มีเนื้อหา', 'warn');
            return;
        }
        const cur = session.files[snap.file] || '';
        const validation = validateCode(snap.content, snap.file);
        if (!validation.ok) {
            session.history.push(snap);
            toast('คืนค่าไม่ได้: ' + validation.reason, 'err');
            return;
        }
        session.files[snap.file] = snap.content;
        session.currentFile = snap.file;
        recordDiff(snap.file, 'undo', cur, snap.content, `ย้อนกลับ Turn ${snap.turn}`, 'UNDO');
        renderFilesList();
        renderPreview();
        updateBudgetUI();
        renderMemoryDrawer();
        toast(`ย้อนกลับ Turn ${snap.turn}`);
        persistSession();
    });
    bind('btn-word-wrap', 'click', toggleWordWrap);
    bind('btn-preview-shortcut', 'click', () => switchTab('preview'));
    bind('btn-open-in-chat', 'click', () => switchTab('chat'));
    bind('btn-refresh-preview', 'click', () => renderPreview());
    bind('btn-memory-toggle', 'click', () => {
        renderMemoryDrawer();
        memoryDrawer.classList.remove('hidden-drawer');
    });
    bind('sensory-cue-close', 'click', () => {
        const el = document.getElementById('sensory-cue-banner');
        if (el) {
            el.classList.add('hidden');
            el.classList.remove('flex');
        }
    });
    bind('btn-close-memory', 'click', () => memoryDrawer.classList.add('hidden-drawer'));
    bind('btn-dismiss-memory-footer', 'click', () => memoryDrawer.classList.add('hidden-drawer'));
    bind('memory-export-btn', 'click', handleMemoryExport);
    bind('memory-import-btn', 'click', () => document.getElementById('memory-import-file').click());
    bind('memory-import-file', 'change', e => {
        const x = e.target.files?.[0];
        e.target.value = '';
        handleMemoryImport(x);
    });
    bind('memory-compact-btn', 'click', async () => {
        const n = await compactMemory();
        renderMemoryDrawer();
        toast(`Compact: ลบ ${n} events`);
    });
    bind('memory-clear-btn', 'click', () => {
        if (!confirm('ล้าง events + summaries + episodic?'))
            return;
        session.memory.events.length = 0;
        session.memory.summaries.length = 0;
        session.memory.facts.length = 0;
        episodicStore.episodes = [];
        if (vectorStore && vectorStore.documents)
            vectorStore.documents.length = 0;
        memoryUI.query = '';
        memoryUI.filterTier = 'all';
        memoryUI.filterImp = 'all';
        memoryUI.pinBackup = {};
        renderMemoryDrawer();
        persistSession();
    });
    bind('btn-reset-session', 'click', () => {
        if (!confirm('เริ่มแชทใหม่? แชทเดิมยังเก็บอยู่ในรายการแชท'))
            return;
        if (window.ninoThreads)
            window.ninoThreads.newChat();
        else
            resetSession();
    });
    bind('btn-settings', 'click', openSettings);
    bind('cfg-provider', 'change', e => toggleProviderFields(e.target.value));
    bind('cfg-9arm-test', 'click', async () => {
        const cfg = getCfg();
        cfg.ninearmApiKey = document.getElementById('cfg-9arm-key').value.trim();
        cfg.ninearmBaseUrl = document.getElementById('cfg-9arm-base').value.trim() || 'https://gateway.9arm.co/v1';
        cfg.ninearmModel = document.getElementById('cfg-9arm-model').value.trim() || 'qwen3.8-27b-fp8';
        setCfg(cfg);
        const st = document.getElementById('ninearm-status');
        if (st) {
            st.style.color = '#A79BB3';
            st.textContent = 'กำลังทดสอบ...';
        }
        const t = await testNinearm(cfg);
        if (st) {
            st.style.color = t.ok ? '#8FD3B0' : '#F26D78';
            st.textContent = t.ok ? '✓ เชื่อมต่อได้ (' + cfg.ninearmModel + ')' : '✗ ' + (t.error || 'ล้มเหลว');
        }
    });
    bind('cfg-tm-test', 'click', async () => {
        const cfg = Object.assign(getCfg(), {
            provider: 'tokenme', tokenmeApiKey: document.getElementById('cfg-tm-key').value.trim(), tokenmeModel: document.getElementById('cfg-tm-model').value
        });
        const saved = getCfg();
        saved.tokenmeApiKey = cfg.tokenmeApiKey;
        saved.tokenmeModel = cfg.tokenmeModel;
        setCfg(saved);
        const st = document.getElementById('tm-status');
        if (st) {
            st.style.color = '#A79BB3';
            st.textContent = 'กำลังทดสอบ...';
        }
        const t = await testNinearm(cfg);
        if (st) {
            st.style.color = t.ok ? '#8FD3B0' : '#F26D78';
            st.textContent = t.ok ? '✓ เชื่อมต่อได้ (' + cfg.tokenmeModel + ')' : '✗ ' + (t.error || 'ล้มเหลว');
        }
    });
    bind('cfg-trash-empty', 'click', async () => {
        if (window.ninoTrash) {
            await window.ninoTrash.clean();
            toast('เทถังขยะรูปภาพแล้ว');
        }
    });
    bind('cfg-save', 'click', saveSettings);
    bind('cfg-close', 'click', () => document.getElementById('settings-modal').classList.add('hidden'));
    bind('cfg-discover', 'click', async () => {
        const key = document.getElementById('cfg-api-key').value.trim();
        const cfgNow = getCfg();
        if (isCompat(cfgNow.provider)) {
            toast('กำลังทดสอบ ' + providerLabel(cfgNow.provider) + '...', 'warn');
            await discoverModelsUI('');
            toast('ทดสอบเสร็จ');
            return;
        }
        if (!key) {
            toast('กรอก API Key ก่อน', 'err');
            return;
        }
        toast('กำลังค้นหาโมเดล...', 'warn');
        await discoverModelsUI(key);
        toast('ค้นหาเสร็จแล้ว');
    });
    bind('btn-token-slider-toggle', 'click', () => {
        const p = document.getElementById('token-slider-panel');
        p.classList.toggle('hidden');
        p.classList.toggle('flex');
    });
    bind('token-slider', 'input', e => {
        const n = parseInt(e.target.value);
        session.tokenBudgetMax = n;
        session.contextManager.maxTokens = n;
        document.getElementById('token-slider-val').textContent = (n / 1024).toFixed(0) + 'K';
        updateBudgetUI();
    });
    bind('mode-code', 'click', () => {
        if (currentCharacter.mode !== 'code')
            toggleMode();
    });
    bind('mode-roleplay', 'click', () => {
        if (currentCharacter.mode !== 'roleplay')
            toggleMode();
    });
    bind('btn-character', 'click', openCharacterDrawer);
    bind('btn-close-character', 'click', closeCharacterDrawer);
    bind('btn-dismiss-character-footer', 'click', closeCharacterDrawer);
    bind('btn-create-character', 'click', () => openCharacterEditor(null));
    bind('char-save-btn', 'click', saveCharacterFromEditor);
    bind('char-cancel-btn', 'click', closeCharacterEditor);
    bind('char-name', 'input', updateAvatarPreview);
    bind('char-avatar-file', 'change', e => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = ev => {
            _avatarDataUrl = ev.target.result;
            updateAvatarPreview();
        };
        reader.readAsDataURL(file);
    });
    document.querySelectorAll('.char-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.char-mode-btn').forEach(b => {
                b.dataset.selected = 'false';
                b.style.background = '#14111A';
                b.style.color = '#A79BB3';
                b.style.borderColor = '#3A3145';
            });
            btn.dataset.selected = 'true';
            const m = btn.dataset.mode;
            btn.style.background = m === 'roleplay' ? '#B388F0' : '#1F6FEB';
            btn.style.color = '#fff';
            btn.style.borderColor = 'transparent';
        });
    });
    bind('char-edit-modal', 'click', e => {
        if (e.target === document.getElementById('char-edit-modal'))
            closeCharacterEditor();
    });
}

bind('fr-find-input', 'input', doFind);
bind('fr-find-input', 'keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        navigateFind(e.shiftKey ? -1 : 1);
    }
    if (e.key === 'Escape')
        closeFindReplace();
});
bind('fr-replace-input', 'keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        replaceCurrent();
    }
    if (e.key === 'Escape')
        closeFindReplace();
});
bind('fr-prev-btn', 'click', () => navigateFind(-1));
bind('fr-next-btn', 'click', () => navigateFind(1));
bind('fr-replace-btn', 'click', replaceCurrent);
bind('fr-replace-all-btn', 'click', replaceAll);
bind('fr-close-btn', 'click', closeFindReplace);
document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        openFindReplace();
    }
});

function resetSession() {
    try {
        if (window.ninoTrash)
            window.ninoTrash.clean();
        if (window.ninoImg)
            window.ninoImg.clearPending();
    }
    catch (_) { }
    session = createInitialSession();
    orchestratorState.history = [];
    orchestratorState.paused = false;
    orchestratorState.pendingQuestion = null;
    orchestratorState.hardBlockCount = 0;
    _fileFingerprintCache.clear();
    memoryUI.query = '';
    memoryUI.filterTier = 'all';
    memoryUI.filterImp = 'all';
    memoryUI.pinBackup = {};
    rebuildSpaces();
    const greeting = currentCharacter.greeting || 'สวัสดี ฉันคือ ' + currentCharacter.name;
    session.messages = [{
            sender: 'nino', turn: 1, action: 'explain', reply: greeting, reasoning: 'greeting', characterId: currentCharacter.id, characterName: currentCharacter.name, characterAvatar: currentCharacter.avatar || ''
        }];
    updateBudgetUI();
    renderMessages();
    renderFilesList();
    renderPreview();
    renderMemoryDrawer();
    switchTab('chat');
    document.getElementById('prompt-input').value = '';
    persistSession();
}

async function init() {
    try {
        if (navigator.storage && navigator.storage.persisted)
            navigator.storage.persisted().then(p => {
                if (!p && navigator.storage.persist)
                    navigator.storage.persist().then(ok => {
                        if (ok)
                            recordMemoryEvent('storage: persistent granted', ['persistence'], 3);
                    });
            });
    }
    catch (_) { }
    try {
        await DB.open();
    }
    catch (_) { }
    try {
        await loadCharacters();
    }
    catch (_) { }
    try {
        const saved = localStorage.getItem('nino-last-char');
        if (saved) {
            const ch = allCharacters.find(c => c.id === saved);
            if (ch)
                currentCharacter = ch;
        }
    }
    catch (_) { }
    try {
        await restoreSession();
    }
    catch (_) { }
    try {
        updateBudgetUI();
    }
    catch (_) { }
    try {
        renderMessages();
    }
    catch (_) { }
    try {
        renderFilesList();
    }
    catch (_) { }
    try {
        renderPreview();
    }
    catch (_) { }
    try {
        renderMemoryDrawer();
    }
    catch (_) { }
    try {
        wireEvents();
    }
    catch (e) {
        console.error('wireEvents failed:', e);
    }
    try {
        installInspector();
    }
    catch (_) { }
    try {
        updateModeToggle();
    }
    catch (_) { }
    try {
        updateActiveCharBar();
    }
    catch (_) { }
    const cfg = getCfg();
    try {
        document.getElementById('token-slider').value = cfg.maxTokens || 900000;
        document.getElementById('token-slider-val').textContent = ((cfg.maxTokens || 900000) / 1024).toFixed(0) + 'K';
        updateModelBadge(activeModelName(cfg));
    }
    catch (_) { }
    const _hasKey = providerHasKey(cfg);
    if (!_hasKey) {
        setStatus('', 'รอ API Key');
        setTimeout(() => toast('กดปุ่ม เพื่อตั้งค่า API (' + providerLabel(cfg.provider) + ') ก่อน', 'warn'), 600);
    }
    else {
        setStatus('on', 'พร้อม');
        setTimeout(async () => {
            try {
                const ok = await healthCheck();
                if (ok)
                    await ensureModelPool();
            }
            catch (_) { }
        }, 200);
    }
    _bcReady = true;
    setTimeout(runSelfTest, 1200);
}

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
else
    init();
window.ninoDebug = {
    memory: { embed: embedText, search: semanticSearch, compact: compactMemory, summarizeTask: summarizeCompletedTask }, episodic: () => episodicStore.episodes, vector: () => vectorStore.documents, invalid: () => [...INVALID_MODELS], pool: () => getModelPool(), characters: () => allCharacters, currentCharacter: () => currentCharacter, reset: resetSession, switchTab, healthCheck, ensureModelPool, discoverModels: discoverModelsUI, testNinearm: () => testNinearm(getCfg()), state: () => ({
        phase: session.phase, phase: session.phase, filesCount: Object.keys(session.files).length, char: currentCharacter.name, mode: currentCharacter.mode, provider: getCfg().provider, events: session.memory.events.length, diffs: session.diffs.length, history: session.history.length
    })
};
