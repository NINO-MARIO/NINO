'use strict';
const memoryUI = { query: '', filterTier: 'all', filterImp: 'all', pinBackup: {}, _debounce: null };
const DEFAULT_CHARACTER = {
    id: 'nino-default', name: 'NINO', avatar: '', mode: 'code', description: 'ผู้ช่วยเขียนโค้ด', persona: 'ผู้ช่วยเขียนโค้ดที่ซื่อตรง ถามเมื่อจำเป็น กลั่นก่อนตอบ', scenario: '', examples: '', greeting: 'สวัสดีค่ะ ฉันคือ NINO ผู้ช่วยเขียนโค้ดของคุณ\n\nก่อนเริ่ม ขอถาม 3 ข้อ:\n1. อยากสร้างอะไร?\n2. ไฟล์เดียว หรือแยกหลายไฟล์?\n3. Stack ที่อยากใช้? (Vanilla / Tailwind / CSS)', temperature: null, isDefault: true, createdAt: Date.now()
};
let currentCharacter = Object.assign({}, DEFAULT_CHARACTER);
let allCharacters = [];
let editingCharacterId = null;
let _avatarDataUrl = '';

async function loadCharacters() {
    try {
        const list = await DB.getAll('characters');
        if (!list.find(c => c.id === DEFAULT_CHARACTER.id)) {
            await DB.put('characters', Object.assign({}, DEFAULT_CHARACTER));
            list.unshift(Object.assign({}, DEFAULT_CHARACTER));
        }
        allCharacters = list.sort((a, b) => (a.isDefault ? -1 : b.isDefault ? 1 : (b.createdAt || 0) - (a.createdAt || 0)));
        return allCharacters;
    }
    catch (_) {
        allCharacters = [Object.assign({}, DEFAULT_CHARACTER)];
        return allCharacters;
    }
}

async function saveCharacter(ch) {
    ch.updatedAt = Date.now();
    await DB.put('characters', ch);
    const idx = allCharacters.findIndex(c => c.id === ch.id);
    if (idx >= 0)
        allCharacters[idx] = ch;
    else
        allCharacters.push(ch);
    return ch;
}

async function deleteCharacter(id) {
    if (id === DEFAULT_CHARACTER.id)
        return false;
    await DB.delete('characters', id);
    await DB.delete('character-chats', id);
    allCharacters = allCharacters.filter(c => c.id !== id);
    return true;
}

async function loadChatForCharacter(id) {
    try {
        const d = await DB.get('character-chats', id);
        const msgs = d ? (d.messages || []) : [];
        for (const m of msgs) {
            if (m && m.streaming) {
                m.streaming = false;
                m.notice = 'ข้อความนี้ถูกตัดกลางคันตอนสตรีม (ปิดแอป/สัญญาณหลุด) — กด เขียนต่อ เพื่อต่อจากตรงนี้';
            }
        }
        try {
            if (window.ninoImg && window.ninoImg.healMessages)
                await window.ninoImg.healMessages(msgs);
        }
        catch (_) { }
        return msgs;
    }
    catch (_) {
        return [];
    }
}

async function saveChatForCharacter(id, messages) {
    try {
        await DB.put('character-chats', { characterId: id, messages: messages.slice(-300), updatedAt: Date.now() });
    }
    catch (_) { }
}

async function switchCharacter(id) {
    if (_activeStreamController) {
        try {
            _activeStreamController.abort();
        }
        catch (_) { }
        _activeStreamController = null;
    }
    _requestId++;
    if (id === currentCharacter.id) {
        closeCharacterDrawer();
        return;
    }
    await saveChatForCharacter(currentCharacter.id, session.messages);
    const ch = allCharacters.find(c => c.id === id);
    if (!ch)
        return;
    currentCharacter = ch;
    useMemorySpace(spaceModeOf(ch));
    const messages = await loadChatForCharacter(id);
    if (!messages.length) {
        const g = ch.greeting || ('สวัสดี ฉันคือ ' + ch.name);
        messages.push({
            sender: 'nino', turn: 1, action: 'explain', reply: g, reasoning: 'greeting', characterId: ch.id, characterName: ch.name, characterAvatar: ch.avatar || ''
        });
    }
    session.messages = messages;
    session.phase = Math.max(1, messages.filter(m => m.sender === 'user').length + 1);
    session.seedStep = 1;
    orchestratorState.history = [];
    orchestratorState.paused = false;
    orchestratorState.pendingQuestion = null;
    orchestratorState.done = false;
    _fileFingerprintCache.clear();
    updateModeToggle();
    updateActiveCharBar();
    renderMessages();
    renderQuickChips();
    closeCharacterDrawer();
    localStorage.setItem('nino-last-char', ch.id);
    toast('สลับเป็น ' + ch.name + ' (' + (ch.mode === 'roleplay' ? 'Roleplay' : 'Code') + ')');
}

function getActiveCharacter() {
    return currentCharacter;
}

function updateActiveCharBar() {
    const bar = document.getElementById('active-char-bar');
    if (!bar)
        return;
    bar.classList.remove('hidden');
    const av = document.getElementById('active-char-avatar');
    av.innerHTML = currentCharacter.avatar ? `<img src="${currentCharacter.avatar}" alt="">` : '';
    av.classList.toggle('solid', !currentCharacter.avatar);
    av.setAttribute('aria-label', currentCharacter.name || 'ตัวละคร');
    document.getElementById('active-char-name').textContent = currentCharacter.name;
    const modeBadge = document.getElementById('active-char-mode');
    modeBadge.textContent = currentCharacter.mode;
    modeBadge.className = 'char-mode-badge ' + currentCharacter.mode;
    const hint = document.getElementById('active-char-hint');
    hint.textContent = currentCharacter.description || '';
}

function updateModeToggle() {
    const isRoleplay = currentCharacter.mode === 'roleplay';
    document.getElementById('mode-code').classList.toggle('active', !isRoleplay);
    document.getElementById('mode-code').classList.toggle('code', !isRoleplay);
    document.getElementById('mode-roleplay').classList.toggle('active', isRoleplay);
    document.getElementById('mode-roleplay').classList.toggle('roleplay', isRoleplay);
    const tf = document.getElementById('tab-btn-files');
    const tp = document.getElementById('tab-btn-preview');
    if (tf)
        tf.style.display = isRoleplay ? 'none' : '';
    if (tp)
        tp.style.display = isRoleplay ? 'none' : '';
    if (isRoleplay && (session.phase === 'files' || session.phase === 'preview'))
        switchTab('chat');
    const inp = document.getElementById('prompt-input');
    if (inp)
        inp.placeholder = isRoleplay ? `พูดคุยกับ ${currentCharacter.name}...` : 'สั่งงาน NINO...';
    const fsBadge = document.getElementById('fs-count-badge');
    if (fsBadge)
        fsBadge.style.display = isRoleplay ? 'none' : '';
}

async function toggleMode() {
    await setMode(spaceModeOf(currentCharacter) === 'roleplay' ? 'code' : 'roleplay');
}

function openCharacterDrawer() {
    renderCharacterList();
    document.getElementById('character-drawer').classList.remove('hidden-drawer');
}

function closeCharacterDrawer() {
    document.getElementById('character-drawer').classList.add('hidden-drawer');
}

function renderCharacterList() {
    const list = document.getElementById('characters-list');
    list.innerHTML = '';
    allCharacters.forEach(ch => {
        const card = document.createElement('div');
        card.className = 'char-card' + (ch.id === currentCharacter.id ? ' active' : '');
        card.innerHTML = `<div class="char-avatar">${ch.avatar ? `<img src="${ch.avatar}" alt="">` : escapeHtml(ch.name?.[0] || '?')}</div><div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;"><span style="font-weight:600;color:#FBF7FD;font-size:13px;">${escapeHtml(ch.name)}</span><span class="char-mode-badge ${ch.mode}">${ch.mode}</span>${ch.isDefault ? '<span style="font-size:9px;color:#A79BB3;">default</span>' : ''}</div><div style="color:#A79BB3;font-size:11px;line-height:1.4;">${escapeHtml(ch.description || '(ไม่มีคำอธิบาย)')}</div></div><div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;"><button class="btn-tactile char-edit-btn" data-id="${ch.id}" style="padding:3px 8px;background:#272030;color:#F28AB2;border:1px solid #3A3145;border-radius:5px;cursor:pointer;font-size:11px;">แก้</button>${!ch.isDefault ? `<button class="btn-tactile char-del-btn" data-id="${ch.id}" style="padding:3px 8px;background:#272030;color:#F26D78;border:1px solid #3A3145;border-radius:5px;cursor:pointer;font-size:11px;">ลบ</button>` : ''}</div>`;
        card.addEventListener('click', e => {
            if (e.target.closest('.char-edit-btn') || e.target.closest('.char-del-btn'))
                return;
            switchCharacter(ch.id);
        });
        list.appendChild(card);
    });
    list.querySelectorAll('.char-edit-btn').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        openCharacterEditor(b.dataset.id);
    }));
    list.querySelectorAll('.char-del-btn').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm('ลบตัวละครนี้และประวัติแชททั้งหมด?')) {
            deleteCharacter(b.dataset.id).then(() => renderCharacterList());
        }
    }));
}

function openCharacterEditor(id) {
    editingCharacterId = id;
    _avatarDataUrl = '';
    let ch;
    if (id) {
        ch = allCharacters.find(c => c.id === id);
        if (!ch)
            return;
        document.getElementById('char-modal-title').textContent = 'แก้ไขตัวละคร';
    }
    else {
        ch = {
            name: '', avatar: '', mode: 'roleplay', description: '', persona: '', scenario: '', examples: '', greeting: '', temperature: null
        };
        document.getElementById('char-modal-title').textContent = 'สร้างตัวละคร';
    }
    _avatarDataUrl = ch.avatar || '';
    document.getElementById('char-name').value = ch.name || '';
    document.getElementById('char-description').value = ch.description || '';
    document.getElementById('char-persona').value = ch.persona || '';
    document.getElementById('char-scenario').value = ch.scenario || '';
    document.getElementById('char-examples').value = ch.examples || '';
    document.getElementById('char-greeting').value = ch.greeting || '';
    document.querySelectorAll('.char-mode-btn').forEach(b => {
        const isSel = b.dataset.mode === ch.mode;
        b.dataset.selected = isSel ? 'true' : 'false';
        if (isSel) {
            b.style.background = ch.mode === 'roleplay' ? '#B388F0' : '#1F6FEB';
            b.style.color = '#fff';
            b.style.borderColor = 'transparent';
        }
        else {
            b.style.background = '#14111A';
            b.style.color = '#A79BB3';
            b.style.borderColor = '#3A3145';
        }
    });
    updateAvatarPreview();
    document.getElementById('char-edit-modal').classList.remove('hidden');
}

function updateAvatarPreview() {
    const p = document.getElementById('char-avatar-preview');
    if (_avatarDataUrl)
        p.innerHTML = `<img src="${_avatarDataUrl}" alt="">`;
    else
        p.textContent = document.getElementById('char-name').value?.[0] || '?';
}

function closeCharacterEditor() {
    document.getElementById('char-edit-modal').classList.add('hidden');
    editingCharacterId = null;
    _avatarDataUrl = '';
}

async function saveCharacterFromEditor() {
    const name = document.getElementById('char-name').value.trim();
    if (!name) {
        toast('กรุณาใส่ชื่อ', 'err');
        return;
    }
    const rpBtn = document.querySelector('.char-mode-btn[data-mode="roleplay"]');
    const mode = rpBtn && rpBtn.dataset.selected === 'true' ? 'roleplay' : 'code';
    const ch = {
        id: editingCharacterId || `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, avatar: _avatarDataUrl || '', mode, description: document.getElementById('char-description').value.trim(), persona: document.getElementById('char-persona').value.trim(), scenario: document.getElementById('char-scenario').value.trim(), examples: document.getElementById('char-examples').value.trim(), greeting: document.getElementById('char-greeting').value.trim(), temperature: null, createdAt: editingCharacterId ? (allCharacters.find(c => c.id === editingCharacterId)?.createdAt || Date.now()) : Date.now()
    };
    await saveCharacter(ch);
    closeCharacterEditor();
    renderCharacterList();
    if (currentCharacter.id === ch.id) {
        currentCharacter = ch;
        updateActiveCharBar();
        updateModeToggle();
    }
    toast(editingCharacterId ? 'แก้ไขแล้ว' : 'สร้างแล้ว');
}
