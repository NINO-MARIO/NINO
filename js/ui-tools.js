'use strict';
let importCloseTimer = null;

function updateImportStatus() {
    const code = document.getElementById('file-import-code').value;
    const name = document.getElementById('file-import-name').value.trim();
    const bytes = new Blob([code]).size;
    const lines = code.split('\n').length;
    const type = detectImportType(code, name);
    document.getElementById('import-status-text').textContent = `${bytes} bytes · ${lines} บรรทัด · type: ${type}`;
}

function openImportFile() {
    if (importCloseTimer) {
        clearTimeout(importCloseTimer);
        importCloseTimer = null;
    }
    const overlay = document.getElementById('file-import-overlay');
    document.getElementById('file-import-name').value = '';
    document.getElementById('file-import-code').value = '';
    updateImportStatus();
    overlay.classList.remove('hidden-drawer');
    document.getElementById('file-import-name').focus();
}

function closeImportFile(skip = false) {
    const code = document.getElementById('file-import-code').value;
    if (!skip && code.trim() && !confirm('ปิดโดยไม่บันทึก?'))
        return;
    if (importCloseTimer) {
        clearTimeout(importCloseTimer);
        importCloseTimer = null;
    }
    document.getElementById('file-import-overlay').classList.add('hidden-drawer');
}

function saveImportedFile() {
    let name = document.getElementById('file-import-name').value.trim();
    const code = document.getElementById('file-import-code').value;
    if (!name) {
        toast('กรุณาระบุชื่อไฟล์', 'err');
        return;
    }
    if (!code.trim() && !confirm('สร้างไฟล์เปล่า?'))
        return;
    if (!name.includes('.')) {
        const t = detectImportType(code, name);
        name += '.' + (t === 'unknown' ? 'txt' : t);
    }
    name = sanitizeFilename(name);
    const isOver = session.files[name] !== undefined;
    if (isOver && !confirm('ไฟล์ ' + name + ' มีอยู่แล้ว เขียนทับ?'))
        return;
    session.files[name] = code;
    session.currentFile = name;
    recordMemoryEvent('user import: [' + name + '] ' + code.length, ['import', 'user'], 4);
    renderFilesList();
    renderPreview();
    updateBudgetUI();
    renderMemoryDrawer();
    toast((isOver ? 'เขียนทับ ' : 'นำเข้า ') + name + ' สำเร็จ');
    _broadcast('file-update', { path: name, content: session.files[name] });
    persistSession();
    importCloseTimer = setTimeout(() => {
        importCloseTimer = null;
        closeImportFile(true);
    }, 400);
}

function handleMemoryExport() {
    const dump = JSON.stringify({
        facts: session.memory.facts, events: session.memory.events, summaries: session.memory.summaries, episodic: episodicStore.episodes, roleplayMemory: SPACES.roleplay.memory, skill: window.ninoAgent ? window.ninoAgent.skill.get() : '', characters: allCharacters, exportedAt: Date.now()
    }, null, 2);
    const url = URL.createObjectURL(new Blob([dump], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nino-memory-' + Date.now() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function handleMemoryImport(file) {
    if (!file)
        return;
    try {
        const data = JSON.parse(await file.text());
        if (Array.isArray(data.facts))
            data.facts.forEach(x => session.memory.facts.push(x));
        if (Array.isArray(data.events))
            data.events.forEach(x => addMemoryEvent(x.desc, x.tags, x.importance));
        if (Array.isArray(data.summaries))
            data.summaries.forEach(x => session.memory.summaries.push(x));
        if (Array.isArray(data.episodic))
            data.episodic.forEach(x => episodicStore.episodes.push(x));
        if (session.memory.facts.length > 50)
            session.memory.facts = session.memory.facts.slice(-50);
        normalizeMemory();
        renderMemoryDrawer();
        toast('Import สำเร็จ');
    }
    catch (err) {
        toast('Import ล้มเหลว: ' + (err.message || err), 'err');
    }
}

function openSettings() {
    const cfg = getCfg();
    document.getElementById('cfg-provider').value = cfg.provider || 'gemini';
    document.getElementById('cfg-api-key').value = cfg.apiKey;
    document.getElementById('cfg-model').value = cfg.model;
    document.getElementById('cfg-model-list').value = (cfg.modelList || []).join(', ');
    document.getElementById('cfg-temp').value = cfg.temperature;
    {
        const L = window.ninoAgent ? window.ninoAgent.limits() : { timeLimitSec: 2000, allowanceK: 600 };
        const e1 = document.getElementById('cfg-time-limit'), e2 = document.getElementById('cfg-allow-k');
        if (e1)
            e1.value = L.timeLimitSec;
        if (e2)
            e2.value = L.allowanceK;
    }
    document.getElementById('cfg-9arm-key').value = cfg.ninearmApiKey || '';
    document.getElementById('cfg-9arm-base').value = cfg.ninearmBaseUrl || 'https://gateway.9arm.co/v1';
    document.getElementById('cfg-9arm-model').value = cfg.ninearmModel || 'qwen3.8-27b-fp8';
    document.getElementById('cfg-9arm-temp').value = cfg.ninearmTemperature != null ? cfg.ninearmTemperature : 0.7;
    document.getElementById('cfg-tm-key').value = cfg.tokenmeApiKey || '';
    document.getElementById('cfg-tm-model').value = cfg.tokenmeModel || TOKENME_MODELS[0];
    document.getElementById('cfg-tm-temp').value = cfg.tokenmeTemperature != null ? cfg.tokenmeTemperature : 0.7;
    {
        const e1 = document.getElementById('cfg-rp-length'), e2 = document.getElementById('cfg-vision-mode'), e3 = document.getElementById('cfg-img-ttl');
        if (e1)
            e1.value = cfg.rpLength || 'xlong';
        if (e2)
            e2.value = cfg.visionMode || 'auto';
        if (e3)
            e3.value = String(cfg.imgTtlMin != null ? cfg.imgTtlMin : 30);
    }
    toggleProviderFields(cfg.provider || 'gemini');
    const st = document.getElementById('ninearm-status');
    if (st) {
        st.textContent = '—';
        st.style.color = '#A79BB3';
    }
    document.getElementById('settings-modal').classList.remove('hidden');
}

function toggleProviderFields(provider) {
    const g = document.getElementById('cfg-gemini-fields');
    const n = document.getElementById('cfg-9arm-fields');
    const t = document.getElementById('cfg-tokenme-fields');
    if (g)
        g.style.display = provider === 'gemini' ? '' : 'none';
    if (n)
        n.style.display = provider === '9arm' ? '' : 'none';
    if (t)
        t.style.display = provider === 'tokenme' ? '' : 'none';
}

function saveSettings() {
    const cfg = getCfg();
    cfg.provider = document.getElementById('cfg-provider').value || 'gemini';
    cfg.apiKey = document.getElementById('cfg-api-key').value.trim();
    cfg.model = document.getElementById('cfg-model').value.trim() || DEFAULT_CFG.model;
    cfg.modelList = document.getElementById('cfg-model-list').value.split(',').map(s => s.trim()).filter(Boolean);
    if (!cfg.modelList.length)
        cfg.modelList = [cfg.model];
    cfg.temperature = parseFloat(document.getElementById('cfg-temp').value) || 0.7;
    if (window.ninoAgent) {
        const e1 = document.getElementById('cfg-time-limit'), e2 = document.getElementById('cfg-allow-k');
        window.ninoAgent.setLimits({ timeLimitSec: e1 ? e1.value : null, allowanceK: e2 ? e2.value : null });
    }
    cfg.ninearmApiKey = document.getElementById('cfg-9arm-key').value.trim();
    cfg.ninearmBaseUrl = document.getElementById('cfg-9arm-base').value.trim() || 'https://gateway.9arm.co/v1';
    cfg.ninearmModel = document.getElementById('cfg-9arm-model').value.trim() || 'qwen3.8-27b-fp8';
    cfg.ninearmTemperature = parseFloat(document.getElementById('cfg-9arm-temp').value);
    if (isNaN(cfg.ninearmTemperature))
        cfg.ninearmTemperature = 0.7;
    cfg.tokenmeApiKey = document.getElementById('cfg-tm-key').value.trim();
    cfg.tokenmeModel = document.getElementById('cfg-tm-model').value || TOKENME_MODELS[0];
    cfg.tokenmeTemperature = parseFloat(document.getElementById('cfg-tm-temp').value);
    if (isNaN(cfg.tokenmeTemperature))
        cfg.tokenmeTemperature = 0.7;
    {
        const e1 = document.getElementById('cfg-rp-length'), e2 = document.getElementById('cfg-vision-mode'), e3 = document.getElementById('cfg-img-ttl');
        if (e1)
            cfg.rpLength = e1.value || 'xlong';
        if (e2)
            cfg.visionMode = e2.value || 'auto';
        if (e3)
            cfg.imgTtlMin = parseInt(e3.value, 10) >= 0 ? parseInt(e3.value, 10) : 30;
    }
    setCfg(cfg);
    session.contextManager = new ContextManager(cfg.maxTokens, cfg.model);
    updateModelBadge(activeModelName(cfg));
    document.getElementById('settings-modal').classList.add('hidden');
    toast('บันทึกแล้ว');
    const hasKey = providerHasKey(cfg);
    if (hasKey)
        setTimeout(() => {
            healthCheck();
            ensureModelPool();
        }, 200);
}

function bind(id, ev, fn) {
    const el = document.getElementById(id);
    if (el)
        el.addEventListener(ev, fn);
}

function updateCursorPos() {
    if (!fileEditorTextarea)
        return;
    const pos = fileEditorTextarea.selectionStart;
    const text = fileEditorTextarea.value.substring(0, pos);
    const lines = text.split('\n');
    const ln = lines.length;
    const col = lines[lines.length - 1].length + 1;
    const el = document.getElementById('cursor-pos-display');
    if (el)
        el.textContent = 'Ln ' + ln + ', Col ' + col;
}

let _frMatches = [];
let _frIndex = -1;

function openFindReplace() {
    const bar = document.getElementById('find-replace-bar');
    if (!bar)
        return;
    bar.classList.remove('hidden');
    const fi = document.getElementById('fr-find-input');
    if (fi) {
        fi.focus();
        fi.select();
    }
}

function closeFindReplace() {
    const bar = document.getElementById('find-replace-bar');
    if (!bar)
        return;
    bar.classList.add('hidden');
    _frMatches = [];
    _frIndex = -1;
    const mc = document.getElementById('fr-match-count');
    if (mc)
        mc.textContent = '0/0';
}

function doFind() {
    if (!fileEditorTextarea)
        return;
    const q = (document.getElementById('fr-find-input') || {}).value || '';
    if (!q) {
        _frMatches = [];
        _frIndex = -1;
        const mc = document.getElementById('fr-match-count');
        if (mc)
            mc.textContent = '0/0';
        return;
    }
    const text = fileEditorTextarea.value;
    const lower = text.toLowerCase();
    const ql = q.toLowerCase();
    _frMatches = [];
    let idx = 0;
    while ((idx = lower.indexOf(ql, idx)) !== -1) {
        _frMatches.push(idx);
        idx += ql.length;
    }
    if (_frMatches.length)
        _frIndex = 0;
    else
        _frIndex = -1;
    updateFRCount();
    if (_frIndex >= 0)
        navigateFind(0);
}

function updateFRCount() {
    const mc = document.getElementById('fr-match-count');
    if (mc)
        mc.textContent = _frIndex >= 0 ? (_frIndex + 1) + '/' + _frMatches.length : '0/' + _frMatches.length;
}

function navigateFind(dir) {
    if (!_frMatches.length)
        return;
    _frIndex = (_frIndex + dir + _frMatches.length) % _frMatches.length;
    const pos = _frMatches[_frIndex];
    const qLen = ((document.getElementById('fr-find-input') || {}).value || '').length;
    fileEditorTextarea.focus();
    fileEditorTextarea.setSelectionRange(pos, pos + qLen);
    const before = fileEditorTextarea.value.substring(0, pos);
    const lineNum = before.split('\n').length;
    fileEditorTextarea.scrollTop = Math.max(0, (lineNum - 3) * 20);
    updateFRCount();
}

function replaceCurrent() {
    if (_frIndex < 0 || !_frMatches.length)
        return;
    const q = (document.getElementById('fr-find-input') || {}).value || '';
    const r = (document.getElementById('fr-replace-input') || {}).value || '';
    const pos = _frMatches[_frIndex];
    const text = fileEditorTextarea.value;
    fileEditorTextarea.value = text.substring(0, pos) + r + text.substring(pos + q.length);
    session.files[session.currentFile] = fileEditorTextarea.value;
    doFind();
}

function replaceAll() {
    const q = (document.getElementById('fr-find-input') || {}).value || '';
    const r = (document.getElementById('fr-replace-input') || {}).value || '';
    if (!q || !fileEditorTextarea)
        return;
    const text = fileEditorTextarea.value;
    const count = text.split(q).length - 1;
    if (!count) {
        toast('ไม่พบ', 'warn');
        return;
    }
    fileEditorTextarea.value = text.split(q).join(r);
    session.files[session.currentFile] = fileEditorTextarea.value;
    _frMatches = [];
    _frIndex = -1;
    const mc = document.getElementById('fr-match-count');
    if (mc)
        mc.textContent = '0/0';
    toast('แทนที่ ' + count + ' ตัว');
}

let _wordWrap = true;

function toggleWordWrap() {
    _wordWrap = !_wordWrap;
    const btn = document.getElementById('btn-word-wrap');
    const ta = document.getElementById('file-editor-textarea');
    if (ta) {
        ta.style.whiteSpace = _wordWrap ? 'pre-wrap' : 'pre';
        ta.style.overflowX = _wordWrap ? 'hidden' : 'auto';
    }
    if (btn) {
        btn.style.color = _wordWrap ? '#F28AB2' : '#A79BB3';
        btn.textContent = _wordWrap ? 'WRAP' : 'NO-WRAP';
    }
}

function autoCloseBrackets() {
    if (!fileEditorTextarea)
        return;
    fileEditorTextarea.addEventListener('input', () => {
        const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
        const ta = fileEditorTextarea;
        const pos = ta.selectionStart;
        const ch = ta.value[pos - 1];
        if (ch && pairs[ch] && pos > 0) {
            const next = ta.value[pos];
            if (next !== pairs[ch]) {
                ta.value = ta.value.substring(0, pos) + pairs[ch] + ta.value.substring(pos);
                ta.selectionStart = ta.selectionEnd = pos + 1;
            }
        }
    });
}

autoCloseBrackets();

function editorIndent(shift) {
    if (!fileEditorTextarea)
        return;
    const s = fileEditorTextarea.selectionStart;
    const e = fileEditorTextarea.selectionEnd;
    const v = fileEditorTextarea.value;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = v.indexOf('\n', e);
    if (lineEnd === -1)
        lineEnd = v.length;
    const line = v.substring(lineStart, lineEnd);
    const lines = line.split('\n');
    let newLines;
    if (shift) {
        newLines = lines.map(l => l.replace(/^ {2}/, ''));
    }
    else {
        newLines = lines.map(l => '  ' + l);
    }
    fileEditorTextarea.value = v.substring(0, lineStart) + newLines.join('\n') + v.substring(lineEnd);
    fileEditorTextarea.selectionStart = lineStart;
    fileEditorTextarea.selectionEnd = lineStart + newLines.join('\n').length;
    session.files[session.currentFile] = fileEditorTextarea.value;
    updateLineNumbers();
}

function editorDuplicateLine() {
    if (!fileEditorTextarea)
        return;
    const s = fileEditorTextarea.selectionStart;
    const v = fileEditorTextarea.value;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = v.indexOf('\n', s);
    if (lineEnd === -1)
        lineEnd = v.length;
    const line = v.substring(lineStart, lineEnd);
    const insertPos = lineEnd + 1;
    fileEditorTextarea.value = v.substring(0, insertPos) + '\n' + line + v.substring(insertPos);
    fileEditorTextarea.selectionStart = insertPos + 1;
    fileEditorTextarea.selectionEnd = insertPos + 1 + line.length;
    session.files[session.currentFile] = fileEditorTextarea.value;
    updateLineNumbers();
}

function editorToggleComment() {
    if (!fileEditorTextarea)
        return;
    const s = fileEditorTextarea.selectionStart;
    const e = fileEditorTextarea.selectionEnd;
    const v = fileEditorTextarea.value;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = v.indexOf('\n', e);
    if (lineEnd === -1)
        lineEnd = v.length;
    const line = v.substring(lineStart, lineEnd);
    const lines = line.split('\n');
    const isHtml = session.currentFile.endsWith('.html');
    const prefix = isHtml ? '<!-- ' : '// ';
    const allCommented = lines.every(l => {
        const t = l.trim();
        return t.startsWith('<!--') || t.startsWith('//');
    });
    const newLines = lines.map(l => {
        if (allCommented) {
            return l.replace(/^\s*(<!-- |\/\/ )/, '');
        }
        return l.replace(/^([\s]*)/, m => m + prefix);
    });
    fileEditorTextarea.value = v.substring(0, lineStart) + newLines.join('\n') + v.substring(lineEnd);
    session.files[session.currentFile] = fileEditorTextarea.value;
    updateLineNumbers();
}

function editorGoToLine() {
    if (!fileEditorTextarea)
        return;
    const total = fileEditorTextarea.value.split('\n').length;
    const input = prompt('ไปที่บรรทัด (1-' + total + '):');
    if (!input)
        return;
    const n = parseInt(input, 10);
    if (n < 1 || n > total) {
        toast('บรรทัดไม่ถูกต้อง', 'warn');
        return;
    }
    const lines = fileEditorTextarea.value.split('\n');
    let pos = 0;
    for (let i = 0; i < n - 1; i++)
        pos += lines[i].length + 1;
    fileEditorTextarea.focus();
    fileEditorTextarea.selectionStart = fileEditorTextarea.selectionEnd = pos;
    fileEditorTextarea.scrollTop = Math.max(0, pos - fileEditorTextarea.clientHeight / 2);
}
