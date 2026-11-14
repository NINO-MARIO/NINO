'use strict';
const chatContainer = document.getElementById('chat-messages-container');
const quickReplyContainer = document.getElementById('quick-reply-chips');
const budgetProgressBar = document.getElementById('budget-progress-bar');
const budgetTokenText = document.getElementById('budget-token-text');
const sessionPhaseBadge = document.getElementById('session-phase-badge');
const fsCountBadge = document.getElementById('fs-count-badge');
const fileEditorTextarea = document.getElementById('file-editor-textarea');
const editorLineNumbers = document.getElementById('editor-line-numbers');
const activeFilenameDisplay = document.getElementById('active-filename-display');
const filesListTabs = document.getElementById('files-list-tabs');
const previewIframe = document.getElementById('live-preview-iframe');
const memoryDrawer = document.getElementById('memory-drawer');

function escapeHtml(str) {
    if (!str)
        return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function ninoHardRefresh() {
    try {
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs)
                await r.unregister();
        }
    }
    catch (_) { }
    try {
        if ('caches' in window && caches.keys) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
    }
    catch (_) { }
    try {
        localStorage.setItem('nino-last-hard-refresh', String(Date.now()));
    }
    catch (_) { }
    const u = new URL(location.href);
    u.searchParams.set('_r', String(Date.now()));
    location.replace(u.toString());
}

window.ninoHardRefresh = ninoHardRefresh;
const sensoryCueState = { text: '', updatedAt: 0, cooldownUntil: 0, inFlight: false, failCount: 0 };

function updateSensoryBanner(text) {
    const t = String(text == null ? '' : text).trim();
    if (!t)
        return;
    const el = document.getElementById('sensory-cue-banner');
    const txtEl = document.getElementById('sensory-cue-text');
    if (!el || !txtEl)
        return;
    sensoryCueState.text = t;
    sensoryCueState.updatedAt = Date.now();
    sensoryCueState.failCount = 0;
    txtEl.textContent = t;
    el.classList.remove('hidden');
    el.classList.add('flex');
    el.classList.remove('cue-flash');
    void el.offsetWidth;
    el.classList.add('cue-flash');
}

function stripSensoryCueForDisplay(raw) {
    let s = String(raw || '');
    if (window.ninoAgent && s.indexOf('[[TOOL:') >= 0)
        s = window.ninoAgent.parseTools(s).text;
    s = s.replace(/\[\[SENSORY_CUE:[\s\S]*?\]\]/gi, '');
    s = s.replace(/\[\[[^\]]*$/, '');
    return s;
}

async function requestSensoryCueFallback(mode, contextText) {
    if (_nestedRp)
        return;
    const now = Date.now();
    if (sensoryCueState.inFlight || now < sensoryCueState.cooldownUntil)
        return;
    const cfg = getCfg();
    const hasKey = providerHasKey(cfg);
    if (!hasKey)
        return;
    sensoryCueState.inFlight = true;
    const cooldownMs = Math.min(120000, 20000 * Math.pow(1.6, sensoryCueState.failCount));
    sensoryCueState.cooldownUntil = now + cooldownMs;
    try {
        const ch = (typeof currentCharacter !== 'undefined' && currentCharacter) ? currentCharacter : { name: 'NINO' };
        const persona = mode === 'roleplay' ? (ch.persona || ch.description || ch.name || 'NINO') : 'ผู้ช่วยเขียนโค้ด NINO ที่กำลังทำงานอยู่';
        const sys = 'ตอบเป็นประโยคเดียวสั้นๆภาษาไทยเท่านั้น ไม่เกิน 20 คำ บรรยายบรรยากาศ ท่าที ความรู้สึก หรือสภาพแวดล้อมของ ' + String(persona).slice(0, 200) + ' ในขณะนี้ ห้ามใส่เครื่องหมายคำพูด ห้ามขึ้นต้นด้วยคำอธิบายหรือป้ายกำกับ ตอบแค่ประโยคบรรยายเปล่าๆ';
        const userTxt = String(contextText || '').slice(0, 300) || '(ยังไม่มีบริบทเพิ่มเติม)';
        const out = await spendGenerate({ systemInstruction: sys, contents: [{ role: 'user', parts: [{ text: userTxt }] }], jsonMode: false, temperature: 0.9 });
        const cue = String(out || '').replace(/^["'“”]+|["'“”]+$/g, '').replace(/\n+/g, ' ').trim().slice(0, 160);
        if (cue) {
            updateSensoryBanner(cue);
        }
        else {
            sensoryCueState.failCount = Math.min(6, sensoryCueState.failCount + 1);
        }
    }
    catch (_) {
        sensoryCueState.failCount = Math.min(6, sensoryCueState.failCount + 1);
    }
    finally {
        sensoryCueState.inFlight = false;
    }
}

function toast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    if (!el)
        return;
    el.textContent = msg;
    el.className = (type === 'err' ? 'err' : type === 'warn' ? 'warn' : '') + ' toast-anim';
    el.classList.add('show');
    const dur = type === 'err' ? 4000 : type === 'warn' ? 3000 : 2000;
    clearTimeout(el._toastTimer);
    el._toastTimer = setTimeout(() => {
        el.classList.remove('show');
    }, dur);
}

function updateBudgetUI() {
    if (!budgetProgressBar)
        return;
    const _pc = (window.ninoAgent && window.ninoAgent.progress) ? window.ninoAgent.progress() : { task: 0, ctx: 0 };
    budgetProgressBar.style.width = _pc.task + '%';
    budgetProgressBar.className = 'h-full transition-all duration-300 bg-[#8FD3B0]';
    budgetTokenText.textContent = 'งาน ' + _pc.task + '% · บริบท ' + _pc.ctx + '%';
    sessionPhaseBadge.textContent = `Phase ${session.phase}`;
    fsCountBadge.textContent = `${Object.keys(session.files).length} ไฟล์`;
    const mb = document.getElementById('memory-events-badge');
    if (mb) {
        const c = session.memory.events.length;
        mb.textContent = c;
        mb.classList.toggle('hidden', c <= 0);
    }
}

const _msgDomMap = new Map();
const MAX_VISIBLE_MESSAGES = 100;
let _renderWindowSize = MAX_VISIBLE_MESSAGES;

function _msgNodeId(msg, vi) {
    return msg._id || ('m' + vi);
}

function userImageHtml(im) {
    if (!im)
        return '';
    if (im.expired || !im.thumb)
        return `<div class="nino-img-gone">รูป ${escapeHtml(im.name || '')} ถูกลบอัตโนมัติแล้ว${im.caption ? ' (ยังเหลือคำบรรยายให้ AI จำ)' : ''}</div>`;
    return `<img class="nino-img-thumb" src="${im.thumb}" alt="${escapeHtml(im.name || 'รูปแนบ')}">`;
}

function _buildMsgInner(msg, origIdx) {
    if (msg.kind === 'learned' && window.ninoLearn) return window.ninoLearn.cardHtml(msg.learned);
    const isNino = msg.sender === 'nino';
    const isRoleplay = currentCharacter.mode === 'roleplay';
    const msgCharName = msg.characterName || currentCharacter.name;
    const msgCharAvatar = msg.characterAvatar || currentCharacter.avatar || '';
    if (isNino) {
        let actionColor = 'bg-[#1F6FEB]/20 text-[#F28AB2] border-[#1F6FEB]/40';
        if (msg.action === 'create')
            actionColor = 'bg-[#D9558A]/20 text-[#8FD3B0] border-[#D9558A]/40';
        if (msg.action === 'edit')
            actionColor = 'bg-[#D29922]/20 text-[#F2C275] border-[#D29922]/40';
        if (msg.action === 'explain')
            actionColor = 'bg-[#B388F0]/20 text-[#C9A8F5] border-[#B388F0]/40';
        const hideActionTag = isRoleplay && msg.action === 'explain';
        const avatarHtml = msgCharAvatar ? `<img src="${msgCharAvatar}" alt="" style="width:14px;height:14px;border-radius:50%;object-fit:cover;">` : '';
        let html = `<div class="msg-wrap max-w-[94%] ${msg.error ? 'bg-[#2A1114] border border-[#F26D78]' : 'bg-[#1D1824] border border-[#3A3145]'} rounded-xl p-3 shadow-sm flex flex-col gap-2"><div class="flex items-center justify-between border-b border-[#272030] pb-1.5 text-[11px]"><div class="flex items-center gap-1.5">${avatarHtml}<span class="w-2 h-2 rounded-full bg-[#F28AB2]"></span><span class="font-bold text-[#FBF7FD]">${escapeHtml(msgCharName)}</span></div><div class="flex items-center gap-1.5"><button class="copy-message-btn text-[#9BE0BC] hover:underline" data-idx="${origIdx}">คัดลอก</button>${hideActionTag ? '' : `<span class="px-1.5 py-0.5 rounded border font-mono-code uppercase text-[9px] ${actionColor}">${msg.action}</span><span class="text-[#A79BB3] text-[10px]">#${msg.turn || 1}</span>`}${msg.streaming ? `<span class="pct-badge px-1.5 py-0.5 rounded bg-[#1F6FEB]/20 text-[#F28AB2] border border-[#1F6FEB]/40 text-[9px] font-bold font-mono-code" data-pct-idx="${origIdx}">0%</span>` : ''}</div></div>`;
        if (isRoleplay) {
            html += `<div class="roleplay-msg">${msg.reply ? renderRoleplayContent(msg.reply, false, msg) : ''}</div>`;
            if (msg.notice)
                html += `<div class="rp-notice">${escapeHtml(msg.notice)}</div>`;
        }
        else {
            html += `<div class="text-[#E9E2EE] text-xs leading-relaxed whitespace-pre-wrap">${window.ninoHud && (window.ninoHud.has(msg.reply) || window.ninoHud.stopped(msg.reply) || window.ninoHud.hasFeat(msg.reply)) ? window.ninoHud.mixed(msg.reply, escapeHtml, { mode: 'code', avatar: msgCharAvatar, name: msgCharName, ts: msg.ts }) : escapeHtml(msg.reply || '')}</div>`;
        }
        if (!isRoleplay) {
            if (msg.thinking)
                html += `<div class="bg-[#14111A] border border-[#3A3145] rounded p-2 text-[10px] text-[#F2C275] leading-relaxed whitespace-pre-wrap"><span class="font-semibold">Thinking:</span> ${escapeHtml(msg.thinking.slice(0, 600))}</div>`;
            if (msg.reasoning && msg.reasoning !== msg.thinking)
                html += `<div class="text-[10px] text-[#A79BB3] italic border-t border-[#272030] pt-1"><span class="text-[#79C0FF]">Reasoning:</span> ${escapeHtml(msg.reasoning.slice(0, 300))}</div>`;
        }
        if (msg.plan && window.ninoAgent)
            html += window.ninoAgent.planHtml(msg.plan, escapeHtml);
        return html + `</div>`;
    }
    const imgHtml = msg.image ? userImageHtml(msg.image) : '';
    if (isRoleplay) {
        const rendered = renderRoleplayContent(msg.text || '', true);
        return `<div class="max-w-[85%] bg-[#1F6FEB] text-white rounded-2xl px-3.5 py-2.5 text-xs shadow-sm font-roleplay" style="line-height:1.75;color:#fff;">${imgHtml}${rendered}</div>`;
    }
    return `<div class="max-w-[85%] bg-[#1F6FEB] text-white rounded-xl px-3 py-2 text-xs shadow-sm whitespace-pre-wrap">${imgHtml}${escapeHtml(msg.text)}</div>`;
}

function _dayStart(ts) {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function relDayLabel(ts) {
    const diff = Math.round((_dayStart(Date.now()) - _dayStart(ts)) / 86400000);
    if (diff <= 0) return 'วันนี้';
    if (diff === 1) return 'เมื่อวาน';
    if (diff === 2) return 'เมื่อวันก่อน';
    return 'เมื่อ ' + diff + ' วันก่อน';
}
function dayTicketHtml(ts) {
    const dt = new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    return `<div class="nino-day"><div class="nino-day-ticket"><span class="nino-day-date">${escapeHtml(dt)}</span><span class="nino-day-rel">${relDayLabel(ts)}</span></div></div>`;
}
function timeBadgeHtml(ts, isNino) {
    const d = new Date(ts);
    const hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    return `<div class="nino-time ${isNino ? 'self-start' : 'self-end'}">${hm}</div>`;
}
function _renderNode(node, msg, origIdx, prev) {
    const isNino = msg.sender === 'nino';
    node.className = `flex flex-col ${isNino ? 'items-start' : 'items-end'}`;
    node.dataset.ts = msg.ts || '';
    const newDay = !prev || _dayStart(prev.ts) !== _dayStart(msg.ts);
    node.innerHTML = (newDay ? dayTicketHtml(msg.ts) : '') + _buildMsgInner(msg, origIdx) + timeBadgeHtml(msg.ts, isNino);
    if (isNino) {
        const btn = node.querySelector('.copy-message-btn');
        if (btn)
            btn.addEventListener('click', () => copyToClipboard(msg.reply || '', 'คัดลอก'));
        if (currentCharacter.mode === 'roleplay' && !msg.error) {
            const btns = document.createElement('div');
            btns.style.cssText = 'display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;';
            btns.innerHTML = `<button class="rp-btn" data-act="regen" style="color:#F2C275;">สร้างใหม่</button><button class="rp-btn" data-act="cont" style="color:#F7B8D0;">เขียนต่อ</button><button class="rp-btn" data-act="del" style="color:#F26D78;">ลบ</button>`;
            node.appendChild(btns);
            btns.querySelectorAll('.rp-btn').forEach(b => b.addEventListener('click', () => {
                const act = b.dataset.act;
                if (act === 'regen')
                    regenerateRoleplay(origIdx);
                else if (act === 'cont')
                    continueRoleplay(origIdx);
                else if (act === 'del')
                    deleteRoleplay(origIdx);
            }));
        }
    }
}

function renderMessages() {
    session.messages.forEach(m => { if (m.ts === undefined) m.ts = Date.now(); });
    renderChecklist();
    const checklistEl = document.getElementById('orch-checklist');
    const visible = session.messages.filter(m => !m._hidden);
    const startIdx = Math.max(0, visible.length - _renderWindowSize);
    const visibleIds = new Set();
    const oldLoadOlder = document.getElementById('load-older-btn');
    if (startIdx > 0) {
        if (!oldLoadOlder) {
            const lb = document.createElement('button');
            lb.id = 'load-older-btn';
            lb.className = 'btn-tactile self-center px-3 py-1 bg-[#272030] hover:bg-[#3A3145] text-[#F28AB2] border border-[#3A3145] rounded-full text-[11px] font-mono-code';
            lb.textContent = `โหลดเก่ากว่า (${startIdx} ข้อความ)`;
            lb.addEventListener('click', () => {
                _renderWindowSize += MAX_VISIBLE_MESSAGES;
                renderMessages();
            });
            chatContainer.insertBefore(lb, chatContainer.firstChild);
        }
    }
    else if (oldLoadOlder)
        oldLoadOlder.remove();
    for (let vi = startIdx; vi < visible.length; vi++) {
        const msg = visible[vi];
        const origIdx = session.messages.indexOf(msg);
        const id = _msgNodeId(msg, vi);
        visibleIds.add(id);
        let node = _msgDomMap.get(id);
        if (!node) {
            node = document.createElement('div');
            node.dataset.msgId = id;
            _msgDomMap.set(id, node);
            _renderNode(node, msg, origIdx, visible[vi - 1]);
            if (checklistEl)
                chatContainer.insertBefore(node, checklistEl);
            else
                chatContainer.appendChild(node);
        }
        else {
            _renderNode(node, msg, origIdx, visible[vi - 1]);
        }
    }
    for (const [id, node] of _msgDomMap) {
        if (!visibleIds.has(id)) {
            node.remove();
            _msgDomMap.delete(id);
        }
    }
    chatContainer.scrollTop = chatContainer.scrollHeight;
    renderQuickChips();
}

function renderChecklist() {
    const old = document.getElementById('orch-checklist');
    if (old)
        old.remove();
    if (!session.checklist || !session.checklist.length)
        return;
    if (currentCharacter.mode === 'roleplay')
        return;
    const panel = document.createElement('div');
    panel.id = 'orch-checklist';
    panel.className = 'mx-2 bg-[#1D1824] border border-[#3A3145] rounded-xl p-2.5 flex flex-col gap-1.5';
    const icons = {
        pending: '<span style="display:inline-block;width:15px;height:15px;border:1.5px solid #6E6279;border-radius:3px;flex-shrink:0;"></span>', in_progress: '<span style="display:inline-block;width:15px;height:15px;border:1.5px solid #F2C275;border-radius:3px;flex-shrink:0;position:relative;"><span style="position:absolute;inset:2px;background:#F2C275;border-radius:1px;animation:soft-pulse 1.2s infinite;"></span></span>', done: '<span style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border:1.5px solid #8FD3B0;border-radius:3px;background:#8FD3B0;flex-shrink:0;"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#14111A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 8.5 6.5 12 13 4.5"/></svg></span>', failed: '<span style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border:1.5px solid #F26D78;border-radius:3px;background:#F26D78;flex-shrink:0;color:#fff;font-size:12px;line-height:1;font-weight:bold;">×</span>'
    };
    const textColors = {
        pending: 'text-[#A79BB3]', in_progress: 'text-[#F2C275]', done: 'text-[#8FD3B0] line-through decoration-[#8FD3B0]/40', failed: 'text-[#F26D78]'
    };
    session.checklist.forEach(item => {
        const row = document.createElement('div');
        row.className = 'flex items-start gap-2 text-[11px] ' + (textColors[item.status] || textColors.pending);
        row.innerHTML = (icons[item.status] || icons.pending) + '<span class="flex-1 min-w-0 leading-tight">' + escapeHtml(item.task || '') + '</span>' + '<span class="px-1 rounded bg-[#14111A] border border-[#3A3145] text-[9px] text-[#A79BB3] flex-shrink-0">' + escapeHtml(item.tool || '') + '</span>';
        panel.appendChild(row);
    });
    chatContainer.appendChild(panel);
}

function renderQuickChips() {
    quickReplyContainer.innerHTML = '';
    const isRoleplay = currentCharacter.mode === 'roleplay';
    let chips;
    if (isRoleplay) {
        chips = ['*มองไปรอบๆ อย่างระวัง*', 'เดินเข้าไปใกล้', '"เป็นใครกัน?"', '*ถอนหายใจ*'];
    }
    else {
        chips = session.seedStep === 0 ? ['Todo App (Tailwind)', 'เครื่องคิดเลข', 'Pomodoro Timer', 'เกม OX + AI'] : ['เพิ่ม Dark Mode', 'อธิบายการทำงานของโค้ด', 'รีวิวโค้ด', 'ปรับ Layout'];
    }
    ;
    chips.concat(window.ninoAgent ? window.ninoAgent.chips(isRoleplay ? 'roleplay' : 'code') : []).forEach(t0 => {
        const t = typeof t0 === 'string' ? t0 : t0.text;
        const lab = typeof t0 === 'string' ? t0 : t0.label;
        const btn = document.createElement('button');
        btn.className = 'btn-tactile px-2.5 py-1 rounded-full bg-[#272030] hover:bg-[#3A3145] border border-[#3A3145] text-[#F28AB2] text-[11px] font-mono-code whitespace-nowrap flex-shrink-0';
        btn.textContent = lab;
        btn.addEventListener('click', () => {
            document.getElementById('prompt-input').value = t;
            handleUserSend();
        });
        quickReplyContainer.appendChild(btn);
    });
}

function renderFilesList() {
    filesListTabs.innerHTML = '';
    Object.keys(session.files).forEach(fn => {
        const cur = fn === session.currentFile;
        const tab = document.createElement('button');
        tab.className = `btn-tactile px-2 py-0.5 rounded text-[11px] font-mono-code flex items-center gap-1 border ${cur ? 'bg-[#1F6FEB]/20 text-[#F28AB2] border-[#1F6FEB]/50 font-bold' : 'bg-[#14111A] text-[#A79BB3] border-[#3A3145] hover:text-[#E9E2EE]'}`;
        tab.textContent = fn;
        tab.addEventListener('click', () => {
            session.currentFile = fn;
            loadCurrentFileToEditor();
            renderFilesList();
        });
        filesListTabs.appendChild(tab);
    });
    loadCurrentFileToEditor();
}

function searchFiles(query) {
    const q = query.toLowerCase().trim();
    const resultsEl = document.getElementById('file-search-results');
    if (!resultsEl)
        return;
    if (!q) {
        resultsEl.classList.add('hidden');
        resultsEl.innerHTML = '';
        return;
    }
    const results = [];
    Object.entries(session.files).forEach(([fname, content]) => {
        const lines = content.split('\n');
        lines.forEach((line, i) => {
            if (line.toLowerCase().includes(q))
                results.push({ file: fname, line: i + 1, text: line.trim().slice(0, 120) });
        });
    });
    if (!results.length) {
        resultsEl.classList.remove('hidden');
        resultsEl.innerHTML = '<div class="px-3 py-2 text-xs text-[#6E6279]">ไม่พบผลลัพธ์</div>';
        return;
    }
    resultsEl.classList.remove('hidden');
    resultsEl.innerHTML = results.slice(0, 20).map(r => `<div class="px-3 py-1.5 border-b border-[#272030] hover:bg-[#1D1824] cursor-pointer flex items-center gap-2 text-xs" data-file="${r.file}" data-line="${r.line}"><span class="text-[#F28AB2] font-medium flex-shrink-0">${r.file}</span><span class="text-[#6E6279] flex-shrink-0">L${r.line}</span><span class="text-[#A79BB3] truncate">${r.text}</span></div>`).join('');
    resultsEl.querySelectorAll('[data-file]').forEach(el => {
        el.addEventListener('click', () => {
            const f = el.dataset.file, l = parseInt(el.dataset.line) || 1;
            if (session.files[f] !== undefined) {
                session.currentFile = f;
                loadCurrentFileToEditor();
                switchTab('files');
            }
            fileEditorTextarea.focus();
            const lh = 20;
            fileEditorTextarea.scrollTop = (l - 1) * lh;
            editorLineNumbers.scrollTop = fileEditorTextarea.scrollTop;
        });
    });
}

function loadCurrentFileToEditor() {
    const c = session.files[session.currentFile] || '';
    fileEditorTextarea.value = c;
    activeFilenameDisplay.textContent = session.currentFile;
    updateLineNumbers();
}

let _lnLastLines = 0, _lnRaf = 0;

function updateLineNumbers() {
    const lines = (fileEditorTextarea.value.match(/\n/g) || []).length + 1;
    if (lines === _lnLastLines)
        return;
    _lnLastLines = lines;
    if (_lnRaf)
        return;
    _lnRaf = requestAnimationFrame(() => {
        _lnRaf = 0;
        let numHtml = '';
        for (let i = 1; i <= _lnLastLines; i++)
            numHtml += i + '<br>';
        editorLineNumbers.innerHTML = numHtml;
    });
}

let _rpLast = 0;

function renderPreview() {
    const _t = performance.now();
    if (_t - _rpLast < 150)
        return;
    _rpLast = _t;
    let html = session.files['index.html'] || '<!DOCTYPE html><html><body>ไม่มีไฟล์ index.html</body></html>';
    if (session.files['style.css'])
        html = html.replace('</head>', `<style>${session.files['style.css']}</style></head>`);
    if (session.files['app.js'])
        html = html.replace('</body>', `<script>${session.files['app.js']}<\/script></body>`);
    previewIframe.srcdoc = html;
}

function renderMemorySearchBar() {
    const bar = document.createElement('div');
    bar.id = 'memory-search-bar';
    bar.style.cssText = 'display:flex;gap:4px;padding:4px 0;margin-bottom:4px;flex-wrap:wrap';
    const s = 'background:#14111A;border:1px solid #3A3145;border-radius:4px;padding:4px;color:#E9E2EE;font-size:10px;font-family:monospace';
    const t = ['all', 'hot', 'warm', 'cold'].map(v => `<option value="${v}"${memoryUI.filterTier === v ? ' selected' : ''}>Tier: ${v === 'all' ? 'All' : v[0].toUpperCase() + v.slice(1)}</option>`).join('');
    const i = ['all', '5', '4', '3', '2', '1'].map(v => `<option value="${v}"${memoryUI.filterImp === v ? ' selected' : ''}>Imp: ${v === 'all' ? 'All' : v}</option>`).join('');
    bar.innerHTML = `<input id="memory-search-input" type="text" placeholder="ค้นหา events..." value="${escapeHtml(memoryUI.query)}" style="${s};flex:1;min-width:100px;outline:none"><select id="memory-filter-tier" style="${s}">${t}</select><select id="memory-filter-imp" style="${s}">${i}</select>`;
    const inp = bar.querySelector('#memory-search-input');
    inp.addEventListener('input', e => {
        const val = e.target.value, pos = e.target.selectionStart;
        if (memoryUI._debounce)
            clearTimeout(memoryUI._debounce);
        memoryUI._debounce = setTimeout(() => {
            memoryUI._debounce = null;
            memoryUI.query = val;
            renderMemoryDrawer();
            const ni = document.getElementById('memory-search-input');
            if (ni) {
                ni.focus();
                try {
                    ni.setSelectionRange(pos, pos);
                }
                catch (_) { }
            }
        }, 150);
    });
    bar.querySelector('#memory-filter-tier').addEventListener('change', e => {
        memoryUI.filterTier = e.target.value;
        renderMemoryDrawer();
    });
    bar.querySelector('#memory-filter-imp').addEventListener('change', e => {
        memoryUI.filterImp = e.target.value;
        renderMemoryDrawer();
    });
    return bar;
}

function memoryGetVisibleEvents() {
    const q = (memoryUI.query || '').toLowerCase();
    return session.memory.events.slice().reverse().filter(ev => {
        if (memoryUI.filterTier !== 'all' && (ev.tier || 'warm') !== memoryUI.filterTier)
            return false;
        if (memoryUI.filterImp !== 'all' && String(Number(ev.importance) || 3) !== memoryUI.filterImp)
            return false;
        if (q && !((ev.desc || '') + ' ' + (ev.tags || []).join(' ')).toLowerCase().includes(q))
            return false;
        return true;
    });
}

function renderMemoryEventRow(ev) {
    const el = document.createElement('div');
    el.className = 'flex items-start gap-2 py-0.5 text-[#A79BB3] border-b border-[#272030]/60';
    const pinned = Number(ev.importance) === 10;
    el.innerHTML = `<span class="text-[#9BE0BC] flex-shrink-0 text-[10px]">${escapeHtml(ev.timestamp)}</span><span class="text-[#E9E2EE] flex-1">${escapeHtml(ev.desc)} ${(ev.tags || []).map(t => '#' + escapeHtml(t)).join(' ')}</span><span class="flex gap-1 ml-auto flex-shrink-0"><button class="ev-pin-btn text-[10px] px-1 rounded ${pinned ? 'bg-[#D29922]/30 text-[#F2C275]' : 'text-[#A79BB3] hover:text-[#F2C275]'}" data-ev-id="${escapeHtml(ev.id)}">ปัก</button><button class="ev-del-btn text-[10px] px-1 rounded text-[#A79BB3] hover:text-[#F26D78]" data-ev-id="${escapeHtml(ev.id)}">ลบ</button></span>`;
    el.querySelector('.ev-pin-btn').addEventListener('click', e => {
        e.stopPropagation();
        const t = session.memory.events.find(x => x.id === e.currentTarget.dataset.evId);
        if (!t)
            return;
        if (Number(t.importance) === 10) {
            const b = memoryUI.pinBackup[t.id];
            t.importance = b != null ? b : 5;
            delete memoryUI.pinBackup[t.id];
            toast('ปลดหมุด → P' + t.importance);
        }
        else {
            memoryUI.pinBackup[t.id] = Number(t.importance) || 3;
            t.importance = 10;
            toast('ปักหมุด → P10');
        }
        renderMemoryDrawer();
    });
    el.querySelector('.ev-del-btn').addEventListener('click', e => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.evId;
        if (!confirm('ลบ event นี้?'))
            return;
        const i = session.memory.events.findIndex(x => x.id === id);
        if (i >= 0) {
            session.memory.events.splice(i, 1);
            delete memoryUI.pinBackup[id];
            recomputeTiers();
            renderMemoryDrawer();
        }
    });
    return el;
}

function renderMemoryDrawer() {
    normalizeMemory();
    const factsList = document.getElementById('memory-facts-list');
    factsList.innerHTML = '';
    session.memory.facts.forEach(f => {
        const item = document.createElement('div');
        item.className = 'flex flex-col gap-1 py-1 border-b border-[#272030]/60';
        item.innerHTML = `<div class="flex items-start gap-1.5"><span class="text-[#F28AB2] font-semibold flex-shrink-0">${escapeHtml(f.key)}:</span><span class="text-[#E9E2EE] flex-1">${escapeHtml(f.value)}</span><span class="fact-priority-badge px-1 rounded bg-[#D29922]/20 text-[#F2C275]">P${f.priority}</span></div><div class="flex items-center gap-1 flex-wrap"><span class="text-[9px] text-[#A79BB3]">${(f.tags || []).map(t => `<span class="inline-block px-1 rounded bg-[#1F6FEB]/20 text-[#79C0FF] mr-1">${escapeHtml(t)}</span>`).join('')}</span><input class="fact-priority flex-1" type="range" min="1" max="10" value="${f.priority}" data-fact-id="${escapeHtml(f.id)}"></div>`;
        const slider = item.querySelector('.fact-priority'), badge = item.querySelector('.fact-priority-badge');
        slider.addEventListener('input', e => {
            f.priority = Number(e.target.value);
            badge.textContent = 'P' + f.priority;
        });
        slider.addEventListener('change', () => {
            f.updatedAt = Date.now();
            addMemoryEvent(`priority ${f.key} → P${f.priority}`, ['priority'], 2);
            renderMemoryDrawer();
        });
        factsList.appendChild(item);
    });
    document.getElementById('facts-count-text').textContent = `${session.memory.facts.length} ข้อ`;
    const eventsList = document.getElementById('memory-events-list');
    eventsList.innerHTML = '';
    const events = session.memory.events;
    const tierCounts = { hot: 0, warm: 0, cold: 0 };
    events.forEach(e => {
        const t = e.tier || 'warm';
        if (tierCounts[t] !== undefined)
            tierCounts[t]++;
    });
    eventsList.appendChild(renderMemorySearchBar());
    const stats = document.createElement('div');
    stats.style.cssText = 'font-size:10px;color:#A79BB3;padding:4px 0;border-bottom:1px solid #272030;margin-bottom:4px;font-family:monospace';
    stats.textContent = `Total: ${events.length} · Hot: ${tierCounts.hot} · Warm: ${tierCounts.warm} · Cold: ${tierCounts.cold} · Summaries: ${session.memory.summaries.length}`;
    eventsList.appendChild(stats);
    const vis = memoryGetVisibleEvents();
    if (!vis.length) {
        const e = document.createElement('div');
        e.style.cssText = 'padding:8px;text-align:center;color:#A79BB3;font-size:10px';
        e.textContent = 'No events match filter';
        eventsList.appendChild(e);
    }
    else {
        vis.slice(0, 100).forEach(ev => eventsList.appendChild(renderMemoryEventRow(ev)));
    }
    document.getElementById('events-count-text').textContent = `${session.memory.events.length} รายการ`;
    const epList = document.getElementById('memory-episodic-list');
    if (epList) {
        epList.innerHTML = '';
        episodicStore.episodes.slice().reverse().slice(0, 30).forEach(ep => {
            const d = new Date(ep.timestamp);
            const item = document.createElement('div');
            item.className = 'flex items-start gap-2 py-0.5 text-[#A79BB3] border-b border-[#272030]/60';
            item.innerHTML = `<span class="text-[#C9A8F5] flex-shrink-0 text-[10px]">${d.toLocaleDateString('th-TH')}</span><span class="text-[#E9E2EE]">${escapeHtml((ep.text || '').slice(0, 100))}</span>`;
            epList.appendChild(item);
        });
        document.getElementById('episodic-count-text').textContent = `${episodicStore.episodes.length}`;
    }
    const diffsList = document.getElementById('memory-diffs-list');
    diffsList.innerHTML = '';
    session.diffs.slice().reverse().forEach(d => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'w-full text-left flex flex-col gap-1 py-1 border-b border-[#272030]/60 cursor-pointer';
        item.style.background = 'transparent';
        item.style.color = '#E9E2EE';
        const sign = d.delta >= 0 ? '+' : '';
        const color = d.delta > 0 ? '#9BE0BC' : d.delta < 0 ? '#F26D78' : '#A79BB3';
        item.innerHTML = `<span class="flex justify-between"><span>Turn ${d.turn} · ${escapeHtml(d.file)} · ${escapeHtml(d.type)}</span><b style="color:${color}">${sign}${d.delta}</b></span><pre class="hidden whitespace-pre-wrap text-[10px]" style="color:#79C0FF"></pre>`;
        item.querySelector('pre').textContent = d.snippet || '';
        item.addEventListener('click', () => item.querySelector('pre').classList.toggle('hidden'));
        diffsList.appendChild(item);
    });
    document.getElementById('diffs-count-text').textContent = `${session.diffs.length} รายการ`;
    updateBudgetUI();
}

let _phaseTimer = null, _phaseStartTime = 0;

function startPhaseUI() {
    const el = document.getElementById('phase-indicator');
    if (el) {
        el.classList.remove('hidden');
        el.classList.add('flex');
    }
    _phaseStartTime = Date.now();
    updatePhaseUI('รวบรวมบริบท...', 0.05);
    setTimeout(() => updatePhaseUI('ส่งคำขอ...', 0.15), 250);
}

