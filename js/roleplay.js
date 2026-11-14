'use strict';

const RP_LEVELS = {
    normal: { label: 'ปกติ', paras: '3-5', minChars: 0, ext: 0 },
    long: { label: 'ยาว', paras: '6-9', minChars: 2000, ext: 1 },
    xlong: { label: 'ยาวมาก', paras: '10-15', minChars: 4000, ext: 2 },
    epic: { label: 'มหากาพย์', paras: '16-25', minChars: 8000, ext: 4 }
};

function rpLenSpec() {
    const k = String(getCfg().rpLength || 'xlong');
    const key = RP_LEVELS[k] ? k : 'xlong';
    return Object.assign({ key }, RP_LEVELS[key]);
}

function buildRoleplaySystemPrompt(ch) {
    const mem = retrieveContext(session.memory.lastQuery || '');
    const recentEpisodic = episodicStore.getRecent(30).slice(-8).map(ep => `- ${ep.text.slice(0, 100)}`).join('\n') || '(none)';
    const ragBlock = mem.rag && mem.rag.length ? mem.rag.map(r => `- ${(r.text || '').slice(0, 120)}`).join('\n') : '(none)';
    const name = ch.name || 'NINO';
    const persona = ch.persona || '';
    const scenario = ch.scenario || '';
    const examples = ch.examples || '';
    const description = ch.description || '';
    const L = rpLenSpec();
    const lenLine = L.minChars
        ? `- เขียนเป็นร้อยแก้วยาว ${L.paras} ย่อหน้าต่อการตอบ (เป้าหมายอย่างน้อย ~${L.minChars.toLocaleString('en-US')} ตัวอักษร) ห้ามรีบจบ ขยายฉากให้ลึก: ความคิดภายใน ปฏิกิริยาของทุกคนในฉาก บทสนทนาต่อเนื่อง ประสาทสัมผัส จังหวะการเคลื่อนไหว`
        : '- เขียนเป็นร้อยแก้วยาว 3-5 ย่อหน้าต่อการตอบ';
    return `[บทบาท]
คุณคือ ${name}${description ? ' — ' + description : ''}

[เพอร์โซน่า]
${persona || '(ไม่ระบุ — ตีความจากชื่อและคำอธิบาย)'}

[ฉากปัจจุบัน]
${scenario || '(ไม่ระบุ — สร้างบรรยากาศจากบริบท)'}

[ตัวอย่างบทสนทนา]
${examples || '(ไม่มี)'}

[แนวการเขียน — สำคัญมาก]
${lenLine}
- ใช้ *ตัวเอียง* สำหรับการกระทำ ท่าทาง การเคลื่อนไหว
- ใช้ "อัญประกาศ" สำหรับบทสนทนา
- บรรยายอารมณ์ ความคิด สีหน้า แววตา น้ำเสียง กลิ่น บรรยากาศ
- พัฒนาเนื้อเรื่องไปข้างหน้า ไม่ต้องรอคำสั่งหรือถามว่า "ต้องการอะไรต่อ"
- ห้ามสรุปตอนจบ ห้ามตัดฉาก ห้ามข้ามเวลา
- ตัวละครต้องมีข้อบกพร่อง มีความขัดแย้ง มีแรงจูงใจ
- หากมีการต่อสู้ ให้บรรยายจังหวะ ความเจ็บปวด ผลที่ตามมา
- ห้ามแสดงตัวว่าเป็น AI ห้ามพูดถึง "การตอบ" "การพิมพ์" "ข้อความ"
- ห้ามถามคำถามปลายเปิดเพื่อจบเทิร์น — ปล่อยให้ผู้ใช้เป็นคนเลือกจังหวะ
- ใช้สรรพนามบุรุษที่ 1 กับตัวละคร ใช้ "คุณ" กับผู้ใช้
- หากผู้ใช้ใช้ *italic* แทนการกระทำ ให้ตอบกลับในสไตล์เดียวกัน
- หากผู้ใช้แนบรูปภาพ ให้ตอบเหมือนคุณเห็นรูปนั้นจริงๆ ในบทบาทของตัวละคร

[ความทรงจำ]
${mem.facts.map(f => `- ${f.key}: ${f.value}`).join('\n') || '(none)'}

[เหตุการณ์ล่าสุด]
${recentEpisodic}

[RAG Recall]
${ragBlock}

[SENSORY CUE — ช่องทางที่ 3 บังคับทุกครั้ง]
ในทุกคำตอบ ให้แทรกแท็ก [[SENSORY_CUE: ข้อความสั้นภาษาไทย]] ไว้ที่ใดก็ได้ในคำตอบ (แนะนำต้นหรือท้ายข้อความ) โดยข้อความในแท็กคือบรรยากาศ ท่าที สีหน้า ความรู้สึก สภาพแวดล้อม หรือสถานะของ ${name} ขณะนี้ สั้นกระชับไม่เกิน 1 ประโยค เลือกเนื้อหาได้อย่างอิสระตามธรรมชาติของตัวละคร ห้ามใส่คำว่า SENSORY_CUE ซ้ำในเนื้อเรื่องปกติ แท็กนี้จะถูกดึงออกไปแสดงแยกต่างหากและจะไม่ปรากฏต่อผู้ใช้ในบทสนทนา ตัวอย่าง: [[SENSORY_CUE: สายฝนเริ่มหนักขึ้น มือของเธอกำแก้วไวน์แน่นกว่าเดิมเล็กน้อย]]

ตอบเป็นข้อความธรรมชาติเท่านั้น ห้ามใช้ JSON ห้ามใช้ markdown code fence ในเนื้อหา' แต่ tag tool เป็นข้อยกเว้น

${rpAgentBlocks()}${window.ninoHud ? window.ninoHud.spec('roleplay') : ''}`;
}

function renderRoleplayContent(text, forUser = false, meta = null) {
    if (!text)
        return '';
    const H = window.ninoHud;
    if (!forUser && H && (H.has(text) || H.stopped(text) || H.hasFeat(text)))
        return H.mixed(text, s => renderRoleplayContent(s, false), {
            mode: 'roleplay',
            name: (meta && meta.characterName) || (typeof currentCharacter !== 'undefined' && currentCharacter && currentCharacter.name) || '',
            avatar: (meta && meta.characterAvatar) || (typeof currentCharacter !== 'undefined' && currentCharacter && currentCharacter.avatar) || '',
            ts: meta && meta.ts
        });
    let s = escapeHtml(text);
    const emStyle = forUser ? ' style="color:#E6E0FF;font-style:italic;font-weight:400;"' : '';
    // stray markers the model leaves behind: "* *", lone "*", spaces inside an action
    s = s.replace(/\*\s*\*/g, '');
    s = s.replace(/\*\s*([^*\n]+?)\s*\*/g, `<em${emStyle}>$1</em>`);
    s = s.replace(/\*/g, '');
    s = s.replace(/(^|[^a-zA-Z0-9])_([^_\n]+?)_(?![a-zA-Z0-9])/g, `$1<em${emStyle}>$2</em>`);
    if (!forUser)
        s = s.replace(/&quot;([^\n]+?)&quot;/g, '<span class="quote">&quot;$1&quot;</span>');
    s = s.replace(/[ \t]{2,}/g, ' ');
    s = s.replace(/\n{2,}/g, '</p><p style="margin:10px 0 0;">');
    s = s.replace(/\n/g, '<br>');
    return '<p style="margin:0;">' + s + '</p>';
}

async function runRoleplayTurn(text, opts = {}) {
    if (window.ninoAgent && !_nestedRp)
        window.ninoAgent.begin('roleplay');
    const A = window.ninoAgent;
    const appendToIdx = (typeof opts.appendToIdx === 'number') ? opts.appendToIdx : -1;
    const ch = getActiveCharacter();
    const cfg = getCfg();
    const hasKey = providerHasKey(cfg);
    if (!hasKey) {
        toast('ยังไม่ได้ตั้งค่า API Key', 'err');
        return;
    }
    const signal = _activeStreamController ? _activeStreamController.signal : null;
    let botMsg;
    let initialReply = '';
    if (appendToIdx >= 0 && session.messages[appendToIdx] && session.messages[appendToIdx].sender === 'nino') {
        botMsg = session.messages[appendToIdx];
        initialReply = botMsg.reply || '';
        session.messages.splice(appendToIdx + 1);
    }
    else {
        botMsg = {
            sender: 'nino', phase: session.phase + 1, action: 'explain', reply: '', reasoning: 'roleplay', characterId: ch.id, characterName: ch.name, characterAvatar: ch.avatar || ''
        };
        session.messages.push(botMsg);
    }
    botMsg.streaming = true;
    botMsg.notice = '';
    const botIdx = appendToIdx >= 0 ? appendToIdx : session.messages.length - 1;
    const historyEnd = appendToIdx >= 0 ? appendToIdx : (session.messages.length - 2);
    let imgMsg = null;
    if (appendToIdx < 0) {
        for (let k = botIdx - 1; k >= 0; k--) {
            const m = session.messages[k];
            if (m && m.sender === 'user') {
                if (m.image)
                    imgMsg = m;
                break;
            }
        }
    }
    const imgNote = m => (m.sender === 'user' && m.image && window.ninoImg) ? window.ninoImg.historyNote(m.image) : '';
    const historyForAI = session.messages.slice(0, historyEnd).filter(m => (m.sender === 'user' || m.sender === 'nino') && !m._hidden).map(m => ({ role: m.sender === 'user' ? 'user' : 'model', text: ((m.text || m.reply || '') + imgNote(m)).trim() })).filter(m => m.text);
    const sys = buildRoleplaySystemPrompt(ch);
    session.contextManager.setSystemPromptSize(sys);
    const trimmed = session.contextManager.trimHistoryToFit(historyForAI);
    const contents = trimmed.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    const temp = ch.temperature != null ? ch.temperature : (Number(cfg.roleplayTemperature) || 1.0);
    renderMessages();
    let _lastRenderedIdx = -1;
    let _lastRenderedDiv = null;
    let _cueTagCount = 0;
    let _lastCk = 0;
    const checkpoint = (force) => {
        const now = Date.now();
        if (!force && now - _lastCk < 2500)
            return;
        _lastCk = now;
        if (currentCharacter && currentCharacter.id === ch.id && session.messages.includes(botMsg)) {
            try {
                saveChatForCharacter(ch.id, session.messages);
            }
            catch (_) { }
        }
    };
    const updateStream = (partial) => {
        const cueMatches = partial.match(/\[\[SENSORY_CUE:[\s\S]*?\]\]/gi) || [];
        if (cueMatches.length > _cueTagCount) {
            const lastTag = cueMatches[cueMatches.length - 1];
            const cueBody = lastTag.replace(/^\[\[SENSORY_CUE:/i, '').replace(/\]\]$/, '').trim();
            if (cueBody)
                updateSensoryBanner(cueBody);
            _cueTagCount = cueMatches.length;
        }
        botMsg.reply = stripSensoryCueForDisplay(initialReply + partial);
        if (_lastRenderedIdx !== appendToIdx || !_lastRenderedDiv) {
            const botDivs = chatContainer.querySelectorAll('.flex.flex-col.items-start');
            _lastRenderedDiv = botDivs[botDivs.length - 1];
            _lastRenderedIdx = appendToIdx;
        }
        checkpoint(false);
        if (!_lastRenderedDiv)
            return;
        let rp = _lastRenderedDiv.querySelector('.roleplay-msg');
        if (!rp) {
            const wrap = _lastRenderedDiv.querySelector('.msg-wrap');
            if (wrap) {
                const contentDiv = wrap.querySelector('.whitespace-pre-wrap');
                if (contentDiv) {
                    contentDiv.className = 'roleplay-msg';
                    rp = contentDiv;
                }
            }
        }
        if (rp)
            rp.innerHTML = renderRoleplayContent(botMsg.reply) + '<span class="streaming-cursor"></span>';
        chatContainer.scrollTop = chatContainer.scrollHeight;
    };
    let acc = '';
    let chainCount = 0;
    let sawRealTokens = false;
    let segStart = 0;
    let usedGH = false;
    const pctUpdate = () => {
        if (sawRealTokens)
            return;
        const budget = (MAX_OUTPUT_BY_MODEL[getCfg().model] || MAX_OUTPUT_BY_MODEL.default) * 4 * (chainCount + 1);
        setBubblePct(botIdx, Math.min(99, Math.round(acc.length / budget * 100)));
    };
    const pctToken = (count, max) => {
        sawRealTokens = true;
        const effMax = max * (chainCount + 1);
        setBubblePct(botIdx, Math.min(99, Math.round(count / effMax * 100)));
    };
    const callModel = () => spendGenerate({
        systemInstruction: sys, contents, jsonMode: false, temperature: temp, signal, onChunk: (c) => {
            acc += c;
            updateStream(acc);
            pctUpdate();
        }, onTokenUsage: pctToken
    });
    const CONT_PROSE = '<user_single_message>(เขียนต่อจากคำตอบล่าสุดทันที ห้ามทวนประโยคเดิม ห้ามขึ้นต้นใหม่ ห้ามสรุปจบ ถ้าการ์ดเดิมยังไม่ปิดให้เขียนต่อในการ์ดนั้น ถ้าการ์ดปิดแล้วการ์ดมีครบหนึ่งใบแล้ว ห้ามเปิด [[CARD]] ใหม่เด็ดขาด ให้เขียนต่อเป็นข้อความธรรมดา หรือใช้ [[CODE]] [[TABLE]] [[WEB]] [[PLAN]] แทน)</user_single_message>';
    const contTag = (seg) => '<user_single_message>(ข้อความถูกตัดกลางแท็ก [[TOOL:...]] — เขียนต่อจากอักขระสุดท้ายเป๊ะๆ เพื่อให้ JSON ในแท็กสมบูรณ์ แล้วปิดด้วย ]] ห้ามเริ่มแท็กใหม่ ห้ามทวนของเดิม ห้ามเปิด [[CARD]] ใหม่ ท้ายข้อความที่ถูกตัดคือ: ' + seg.slice(-240) + ')</user_single_message>';
    /* ตาข่ายชั้นที่ 1: ถ้าโมเดลหยุดเพราะ MAX_TOKENS หรือสัญญาณหลุดกลางสตรีม ให้ต่อให้เองทุกช่วง (รวมช่วงหลังรันเครื่องมือ GitHub) */
    const settleSegment = async () => {
        const NC = window.ninoContinue;
        let intr = 0, empty = 0, soft = 0, pol = 0;
        while (!(signal && signal.aborted)) {
            if (window.ninoHud && window.ninoHud.stopped(acc.slice(segStart))) {
                if (botMsg.notice && /^ต่อให้อัตโนมัติ/.test(botMsg.notice))
                    botMsg.notice = '';
                return;
            }
            const fr = _lastFinishReason;
            const kind = NC.classify(fr);
            if (kind === 'done') {
                if (botMsg.notice && /^ต่อให้อัตโนมัติ/.test(botMsg.notice))
                    botMsg.notice = '';
                botMsg.blocked = '';
                return;
            }
            if (kind === 'policy' || kind === 'soft') {
                const n = kind === 'policy' ? ++pol : ++soft;
                if (n > NC.LIMIT[kind]) {
                    botMsg.notice = NC.finalNotice(kind, fr, NC.LIMIT[kind]);
                    botMsg.blocked = kind === 'policy' ? fr : '';
                    return;
                }
                botMsg.notice = NC.live(fr, n, NC.LIMIT[kind]);
                renderMessages();
                await NC.wait(300 * n, signal);
            }
            else {
                if (fr === 'INTERRUPTED' && ++intr > INTERRUPT_CONTINUE_MAX) {
                    botMsg.notice = 'สัญญาณหลุดซ้ำหลายครั้ง — กด เขียนต่อ เพื่อต่อจากตรงนี้';
                    return;
                }
                if (chainCount >= CHAIN_CONTINUE_MAX) {
                    botMsg.notice = 'ต่อข้อความครบ ' + CHAIN_CONTINUE_MAX + ' รอบแล้ว — กด เขียนต่อ ถ้ายังไม่จบ';
                    return;
                }
            }
            chainCount++;
            sawRealTokens = false;
            const seg = acc.slice(segStart);
            const hasSeg = seg.trim().length > 0;
            const open = A && hasSeg ? A.parseTools(seg).incomplete : false;
            let pushed = 0;
            if (hasSeg) {
                contents.push({ role: 'model', parts: [{ text: seg }] });
                contents.push({ role: 'user', parts: [{ text: open ? contTag(seg) : CONT_PROSE }] });
                pushed = 2;
            }
            const before = acc.length;
            updateStream(acc);
            pctUpdate();
            let added = 0;
            try {
                await callModel();
                added = acc.length - before;
                if (window.ninoHud) acc = window.ninoHud.oneCard(acc, 'roleplay');
            }
            catch (e) {
                if (e && e.name === 'AbortError')
                    throw e;
                botMsg.notice = 'ต่อข้อความไม่ได้ (' + String(e && e.message || e).slice(0, 90) + ') — กด เขียนต่อ';
                return;
            }
            finally {
                contents.length -= pushed;
            }
            if (kind === 'cut' && added < 3 && ++empty >= 2)
                return;
        }
    };
    /* ตาข่ายชั้นที่ 2 (ฟีดแบคความยาว): ถ้าจบเองแต่สั้นกว่าเป้าหมายระดับความยาวที่ตั้งไว้ ให้ขยายต่อในบับเบิลเดิม */
    const extendIfShort = async () => {
        if (botMsg.blocked)
            return;
        if (window.ninoHud && window.ninoHud.stopped(acc))
            return;
        const L = rpLenSpec();
        if (!L.minChars || opts.self || _nestedRp || appendToIdx >= 0)
            return;
        let ext = 0;
        while (ext < L.ext && !(signal && signal.aborted)) {
            if (A) {
                const ph = A.phase();
                if (ph !== 'idle' && ph !== 'work')
                    return;
                const pt = A.parseTools(acc.slice(segStart));
                if (pt.calls.length || pt.incomplete)
                    return;
            }
            const vis = stripSensoryCueForDisplay(acc).length;
            if (vis >= L.minChars)
                return;
            ext++;
            chainCount++;
            sawRealTokens = false;
            const seg = acc.slice(segStart);
            contents.push({ role: 'model', parts: [{ text: seg }] });
            contents.push({
                role: 'user', parts: [{ text: '<user_single_message>(ตอนนี้เขียนไปราว ' + vis.toLocaleString('en-US') + ' ตัวอักษร ยังสั้นกว่าเป้าหมาย ~' + L.minChars.toLocaleString('en-US') + ' — เขียนต่อจากจุดนี้ทันที ขยายฉากให้ลึกขึ้น: ความคิดภายใน ปฏิกิริยาของทุกคน บทสนทนา ประสาทสัมผัส จังหวะเหตุการณ์ ห้ามทวนประโยคเดิม ห้ามสรุปจบ ห้ามตัดฉาก ห้ามถามผู้ใช้ ห้ามเปิด [[CARD]] ใหม่ การ์ดมีแล้วหนึ่งใบ ให้เขียนเป็นข้อความธรรมดา)</user_single_message>' }]
            });
            const before = acc.length;
            if (!/\s$/.test(acc))
                acc += '\n\n';
            updateStream(acc);
            pctUpdate();
            let extAdded = 0;
            try {
                await callModel();
                extAdded = acc.length - before;
                if (window.ninoHud) acc = window.ninoHud.oneCard(acc, 'roleplay');
            }
            catch (e) {
                if (e && e.name === 'AbortError')
                    throw e;
                botMsg.notice = 'ขยายความยาวไม่สำเร็จ (' + String(e && e.message || e).slice(0, 90) + ') — กด เขียนต่อ';
                return;
            }
            finally {
                contents.length -= 2;
            }
            await settleSegment();
            if (extAdded < 40)
                return;
        }
    };
    try {
        let userParts = [{ text: `<user_single_message>${text}</user_single_message>` }];
        if (imgMsg && window.ninoImg) {
            renderMessages();
            try {
                const ictx = await window.ninoImg.buildContext(imgMsg, { mode: 'roleplay', signal });
                userParts = [{ text: `<user_single_message>${text}${ictx.addon ? '\n\n' + ictx.addon : ''}</user_single_message>` }].concat(ictx.parts || []);
            }
            catch (e) {
                if (e && e.name === 'AbortError')
                    throw e;
                userParts = [{ text: `<user_single_message>${text}\n\n[ผู้ใช้แนบรูปมา แต่อ่านรูปไม่สำเร็จ: ${String(e && e.message || e).slice(0, 80)} — บอกผู้ใช้ตรงๆ]</user_single_message>` }];
            }
        }
        contents.push({ role: 'user', parts: userParts });
        await callModel();
        await settleSegment();
        await extendIfShort();
        let rpRounds = 0;
        _rpBack = null;
        while (A && rpRounds < RP_MAX_ROUNDS && !(signal && signal.aborted)) {
            const seg = acc.slice(segStart);
            const pt = A.parseTools(seg);
            if (!pt.calls.length && !pt.incomplete)
                break;
            rpRounds++;
            const gd = A.guard();
            const outs = [];
            for (const c of pt.calls) {
                if (String(c.name).indexOf('gh_') === 0)
                    usedGH = true;
                outs.push(await runRpToolCall(c, botMsg));
                if (_rpBack)
                    break;
            }
            if (_rpBack)
                break;
            if (pt.incomplete)
                outs.push('[_truncated] ✗ แท็ก [[TOOL ล่าสุดของคุณถูกตัดกลางทาง (เอาต์พุตยาวเกินหรือสัญญาณหลุด) จึงไม่ได้รันอะไรสำหรับแท็กนั้น — ส่งใหม่เป็นก้อนเล็กลง: gh_edit ทีละไฟล์/ครั้งละ 1-3 ops, gh_create ไม่เกิน ~150 บรรทัดแล้วใช้ gh_edit append ต่อ');
            if (gd.hardStop) {
                botMsg.notice = 'ถึงเฟสหยุดพัก (' + gd.phase + ') — หยุดรันเครื่องมือเพื่อความปลอดภัย งานที่ stage ไว้ยังอยู่ พิมพ์ "ต่อ" เพื่อทำต่อ';
                break;
            }
            contents.push({ role: 'model', parts: [{ text: seg }] });
            contents.push({
                role: 'user', parts: [{ text: '<tool_results>\n' + outs.join('\n') + '\n</tool_results>\n' + A.statusLine() + '\n(เขียนต่อได้เลย — จบภารกิจแล้วให้เรียก switch_mode code)' }]
            });
            if (pt.incomplete && pt.tail && acc.endsWith(pt.tail))
                acc = acc.slice(0, acc.length - pt.tail.length);
            if (acc && !/\s$/.test(acc))
                acc += '\n\n';
            segStart = acc.length;
            sawRealTokens = false;
            try {
                await callModel();
                await settleSegment();
            }
            catch (e) {
                if (e && e.name === 'AbortError')
                    throw e;
                botMsg.notice = 'โมเดลหยุดตอบหลังรันเครื่องมือ (' + String(e && e.message || e).slice(0, 90) + ') — งานที่ stage ไว้ยังอยู่ ตรวจด้วย gh_status หรือพิมพ์ "ต่อ"';
                break;
            }
        }
        if (A && rpRounds >= RP_MAX_ROUNDS) {
            const ptEnd = A.parseTools(acc.slice(segStart));
            if (ptEnd.calls.length || ptEnd.incomplete)
                botMsg.notice = 'ครบโควตา ' + RP_MAX_ROUNDS + ' รอบเครื่องมือในเทิร์นเดียว — คำสั่งสุดท้ายยังไม่ถูกรัน พิมพ์ "ต่อ" เพื่อทำต่อ';
        }
        botMsg.streaming = false;
        botMsg.reply = stripSensoryCueForDisplay(initialReply + acc);
        if (_cueTagCount === 0 && !opts.self)
            requestSensoryCueFallback('roleplay', text);
        botMsg.reasoning = 'roleplay (' + ch.name + ')' + (chainCount ? ' x' + (chainCount + 1) + ' calls' : '');
        session.phase++;
        episodicStore.addEpisode(`[${ch.name}] ${text.slice(0, 80)} → ${botMsg.reply.slice(-200)}`, ['roleplay', ch.id]);
        if (episodicStore.episodes.length % 20 === 0)
            episodicStore.decayAndPrune();
        vectorStore.addDocument(text + ' ' + botMsg.reply.slice(-250), { character: ch.id, phase: session.phase });
        renderMessages();
        renderMemoryDrawer();
        persistSession();
        if (usedGH && !_nestedRp && !opts.self && window.ninoUpdate) {
            try {
                await window.ninoUpdate.offerCommit();
            }
            catch (_) { }
        }
    }
    catch (e) {
        botMsg.streaming = false;
        if (e.name === 'AbortError') {
            botMsg.reply = stripSensoryCueForDisplay(initialReply + (acc || (initialReply ? '' : '(ยกเลิก)')));
            botMsg.error = true;
            toast('ยกเลิกแล้ว', 'warn');
        }
        else {
            botMsg.reply = stripSensoryCueForDisplay(initialReply + acc) + (acc ? '\n\n' : '') + 'เกิดข้อผิดพลาด: ' + String(e.message || e);
            botMsg.error = true;
            toast('Roleplay ล้มเหลว: ' + String(e.message || e).slice(0, 100), 'err');
        }
        renderMessages();
        checkpoint(true);
    }
    finally {
        if (imgMsg && window.ninoImg) {
            try {
                window.ninoImg.endTurn(imgMsg.image);
            }
            catch (_) { }
        }
    }
}

async function regenerateRoleplay(botIdx) {
    if (session.taskMode)
        return;
    const botMsg = session.messages[botIdx];
    if (!botMsg || botMsg.sender !== 'nino')
        return;
    let userIdx = botIdx - 1;
    while (userIdx >= 0 && session.messages[userIdx].sender !== 'user')
        userIdx--;
    if (userIdx < 0) {
        toast('ไม่พบข้อความผู้ใช้ก่อนหน้า', 'warn');
        return;
    }
    const userText = session.messages[userIdx].text;
    session.messages.splice(botIdx);
    renderMessages();
    enterTaskMode();
    _activeStreamController = new AbortController();
    try {
        await runRoleplayTurn(userText);
    }
    finally {
        exitTaskMode();
    }
    persistSession();
}

async function continueRoleplay(botIdx) {
    if (session.taskMode)
        return;
    const botMsg = session.messages[botIdx];
    if (!botMsg || botMsg.sender !== 'nino')
        return;
    enterTaskMode();
    _activeStreamController = new AbortController();
    try {
        await runRoleplayTurn('(เขียนต่อจากข้อความล่าสุดของคุณทันที ไม่ต้องทวน ไม่ต้องขึ้นต้นใหม่ ไม่ต้องสรุป)', { appendToIdx: botIdx });
    }
    finally {
        exitTaskMode();
    }
    persistSession();
}

async function deleteRoleplay(botIdx) {
    if (session.taskMode)
        return;
    if (!confirm('ลบข้อความนี้และข้อความผู้ใช้ก่อนหน้า?'))
        return;
    const botMsg = session.messages[botIdx];
    if (!botMsg || botMsg.sender !== 'nino')
        return;
    let userIdx = botIdx - 1;
    while (userIdx >= 0 && session.messages[userIdx].sender !== 'user')
        userIdx--;
    const startIdx = userIdx >= 0 ? userIdx : botIdx;
    session.messages.splice(startIdx, botIdx - startIdx + 1);
    renderMessages();
    persistSession();
}

document.addEventListener('visibilitychange', () => {
    try {
        if (document.hidden && session && session.taskMode && currentCharacter && currentCharacter.mode === 'roleplay')
            saveChatForCharacter(currentCharacter.id, session.messages);
    }
    catch (_) { }
});
