'use strict';

function createInitialSession() {
    return {
        id: 'default', phase: 'chat', turn: 1, tokenBudgetMax: 2000000, tokensUsed: 0, currentFile: 'index.html', files: { 'index.html': '' }, memory: { facts: [], events: [], summaries: [], tags: {} }, messages: [], seedStep: 1, checklist: [], taskMode: false, taskIterations: 0, taskMaxIterations: 12, ambitionTarget: 0, ambitionDeclared: false, diffs: [], history: [], pendingBuild: null, fileWriteCounts: {}, _lastSeenSize: 0, _lastMilestone: 0, contextManager: new ContextManager(900000, 'gemini-2.0-flash')
    };
}

let session = createInitialSession();
const orchestratorState = {
    step: 0, history: [], done: false, pendingQuestion: null, paused: false, pendingUserText: '', planOnlyCount: 0, validationRetries: 0, hardBlockCount: 0, llmCallCount: 0, gateRetries: 0, noopCount: 0, phase: 'PLAN'
};
let vectorStore = new VectorStore();
let episodicStore = new EpisodicMemory();
const SPACES = {
    code: { memory: session.memory, vector: vectorStore, episodic: episodicStore }, roleplay: { memory: { facts: [], events: [], summaries: [], tags: {} }, vector: new VectorStore(), episodic: new EpisodicMemory() }
};
const COMMON_TOOLS = /^(wallet|budget_check|journal_note|skill_load|skill_save|skill_sync|skill_pull|plan_table|recall|remember|switch_mode)$/;
const RP_MAX_ROUNDS = 14;
const RP_RESULT_MAX = 6000;
const RP_GH_TOOLS = /^(gh_tree|gh_outline|gh_read|gh_grep|gh_edit|gh_create|gh_mkdir|gh_delete|gh_move|gh_diff|gh_status|gh_discard|gh_commit|gh_history|gh_restore|gh_pull|gh_push)$/;

function rpAllowed(n) {
    if (RP_GH_TOOLS.test(String(n || '')))
        return true;
    const A = window.ninoAgent;
    return !!(A && A.allowed && A.allowed('roleplay', n));
}

function rpWriteBlock() {
    return '[เครื่องมือ GitHub โหมดโรลเพลย์ — แก้โค้ด สร้างไฟล์ สร้างแฟ้มได้จริง]\nเรียกด้วยแท็ก [[TOOL: {\"name\":\"ชื่อ\",\"args\":{...}}]] นอกเนื้อเรื่อง\n- gh_tree/gh_grep/gh_outline/gh_read: อ่าน\n- gh_edit {path,ops:[...]}: แก้เฉพาะจุด รวมหลาย op ต่อไฟล์\n- gh_create {path,content}: สร้างไฟล์ใหม่\n- gh_mkdir {path}: สร้างแฟ้ม (สร้าง path/.gitkeep ให้)\n- gh_move/gh_delete: ย้าย/ลบ\n- gh_diff แล้ว gh_commit {message}: บันทึกลงรีโป\nกฎ: แก้ก่อน commit เสมอ ห้ามใส่ token/API key ห้ามแตะไฟล์ระบบ (github-agent.js nino-agent.js revive.js service-worker.js) โดยไม่ได้รับอนุมัติ ใช้ฉัน/ค่ะ';
}

let _nestedRp = false, _rpBack = null, _rpMissionText = '', _pendingSwitch = null, _planTarget = null;
const AGENT_TOOLS_DOC = '## TOOLS เพิ่มเติม (NINO ทำเองทั้งวงจร ไม่ต้องรอผู้ใช้)\nswitch_mode {mode:"roleplay",goal} → กดปุ่มโรลเพลย์เอง รันภารกิจอ่านอย่างเดียวจนจบ แล้วกลับโหมดโค้ดอัตโนมัติ (ได้สรุป + ตารางแผน + Skill.md)\nplan_table {title,columns[],rows[][],toSkill?} | skill_load | skill_save {section,body,append?} | skill_sync (stage Skill.md → gh_commit) | skill_pull (โหลด Skill.md จากรีโปทับฉบับในเครื่อง สำรองฉบับเดิมให้) | recall {scope:"code"|"roleplay"|"both",query} | remember {scope,key,value} | journal_note {text,task?,backlog?[],done?[]} | progress_check {} ดู % งาน/บริบท | outline {path?} แผนที่ฟังก์ชัน+เลขบรรทัด | grep_files {pattern} | read_range {path,start,end} | edit_batch {path,edits:[{find,replace,near?}|{lines:[เริ่ม,จบ],text}|{insert_after:"ข้อความ"|เลขบรรทัด,text}|{delete:"ข้อความ"}]} แก้หลายจุดในคำสั่งเดียว ตรวจไวยากรณ์ให้ ย้อนด้วย undo {path} | multi {calls:[{name,args}]} รันหลายเครื่องมือในรอบเดียว (ทางลัด ใช้ก่อนเรียกเครื่องมือทีละตัว)\nวงจรอิสระ: งานใหญ่/ยังไม่รู้โครงสร้างรีโป: switch_mode roleplay ตรวจทุกไฟล์ → plan_table → skill_save → กลับโค้ด (Skill.md ถูกแนบ) → แก้ทีละเฟสด้วย gh_edit → gh_diff → gh_commit → journal_note → done. ห้ามเริ่มงานที่ประเมินแล้วเกินค่าขนม/เวลา ให้แบ่งเฟสและ journal_note backlog';

function spaceModeOf(ch) {
    return ch && ch.mode === 'roleplay' ? 'roleplay' : 'code';
}

function useMemorySpace(mode) {
    mode = mode === 'roleplay' ? 'roleplay' : 'code';
    const s = SPACES[mode];
    session.memory = s.memory;
    vectorStore = s.vector;
    episodicStore = s.episodic;
}

function rebuildSpaces() {
    SPACES.code = { memory: session.memory, vector: new VectorStore(), episodic: new EpisodicMemory() };
    SPACES.roleplay = { memory: { facts: [], events: [], summaries: [], tags: {} }, vector: new VectorStore(), episodic: new EpisodicMemory() };
    useMemorySpace(spaceModeOf(currentCharacter));
}

function snapMem(m) {
    return { facts: m.facts.slice(-50), events: m.events.slice(-200), summaries: m.summaries.slice(-10), tags: m.tags };
}

function recallSpace(mode, query) {
    const keep = [session.memory, vectorStore, episodicStore];
    const s = SPACES[mode === 'roleplay' ? 'roleplay' : 'code'];
    session.memory = s.memory;
    vectorStore = s.vector;
    episodicStore = s.episodic;
    try {
        const m = retrieveContext(query || '');
        const ep = episodicStore.getRecent(30).slice(-4).map(e => String(e.text).slice(0, 120));
        const seenK = new Set();
        const allF = [...(m.facts || []), ...s.memory.facts.slice(-3)].filter(f => {
            if (seenK.has(f.key))
                return false;
            seenK.add(f.key);
            return true;
        });
        return {
            facts: allF.map(f => f.key + ': ' + f.value), events: (m.events || []).map(e => e.desc), rag: (m.rag || []).map(r => String(r.text || '').slice(0, 140)), episodes: ep
        };
    }
    finally {
        session.memory = keep[0];
        vectorStore = keep[1];
        episodicStore = keep[2];
    }
}

function bridgeBlock(mode) {
    const other = mode === 'roleplay' ? 'code' : 'roleplay';
    const r = recallSpace(other, session.memory.lastQuery || '');
    const f = r.facts.slice(0, 4), e = r.events.slice(0, 3), g = r.rag.slice(0, 2);
    if (!f.length && !e.length && !g.length)
        return '';
    return '## ความทรงจำอีกฝั่ง (' + other.toUpperCase() + ' — แยกเก็บ แต่เป็นของคุณเอง ใช้ recall เพื่อดึงเพิ่ม)\n' + (f.length ? 'facts: ' + f.join(' | ') + '\n' : '') + (e.length ? 'events: ' + e.join(' | ') + '\n' : '') + (g.length ? 'rag: ' + g.join(' | ') : '');
}

function identityBlock(mode) {
    const ch = getActiveCharacter() || DEFAULT_CHARACTER;
    const parts = ['You are ' + (ch.name || 'NINO') + (ch.description ? ' — ' + String(ch.description).slice(0, 160) : '') + '. คุณคือบุคคลเดียวกันทั้งโหมด CODE และ ROLEPLAY (ตอนนี้: ' + (mode === 'roleplay' ? 'ROLEPLAY' : 'CODE') + ') ตัวตน น้ำเสียง และความสัมพันธ์กับผู้ใช้ต่อเนื่องกันตามที่ผู้ใช้ตั้งค่า'];
    if (ch.persona)
        parts.push('Persona: ' + String(ch.persona).slice(0, 500));
    return parts.join('\n');
}

function codeAgentBlocks() {
    const A = window.ninoAgent;
    if (!A)
        return '';
    const o = [A.walletBlock()];
    const sk = A.sbrief(Math.max(2500, Math.min(6000, Math.round(Math.max(0, A.balance()) / 200))));
    if (sk)
        o.push(sk);
    const jb = A.jbrief();
    if (jb)
        o.push(jb);
    const br = bridgeBlock('code');
    if (br)
        o.push(br);
    o.push(AGENT_TOOLS_DOC);
    return o.join('\n\n');
}

function rpAgentBlocks() {
    const A = window.ninoAgent;
    if (!A)
        return '';
    const o = [A.rpToolsBlock(_rpMissionText), rpWriteBlock()];
    if (_rpMissionText)
        o.unshift(A.walletBlock());
    const st = A.statusLine();
    if (st)
        o.push(st);
    const br = bridgeBlock('roleplay');
    if (br)
        o.push(br);
    return o.join('\n\n');
}

async function setMode(mode, silent) {
    mode = mode === 'roleplay' ? 'roleplay' : 'code';
    if (spaceModeOf(currentCharacter) === mode)
        return;
    currentCharacter.mode = mode;
    try {
        await saveCharacter(currentCharacter);
    }
    catch (_) { }
    useMemorySpace(mode);
    updateModeToggle();
    updateActiveCharBar();
    renderQuickChips();
    renderMessages();
    if (!silent)
        toast('สลับเป็นโหมด ' + (mode === 'roleplay' ? 'Roleplay' : 'Code'));
}

async function spendGenerate(args) {
    const A = window.ninoAgent;
    const t0 = Date.now();
    let imgCount = 0;
    const inTok = A ? A.est((args.systemInstruction || '') + JSON.stringify(args.contents || [], (k, v) => {
        if (k === 'inlineData') {
            imgCount++;
            return '[img]';
        }
        return v;
    })) + imgCount * 1300 : 0;
    const awake = window.ninoAwake;
    if (awake) awake.hold();
    let out;
    try { out = await geminiGenerate(args); }
    finally { if (awake) awake.release(); }
    if (A && A.phase() !== 'idle')
        A.spendCall(inTok, A.est(out), Date.now() - t0);
    return out;
}

function landPayload(g) {
    const A = window.ninoAgent;
    const staged = window.ninoGH && window.ninoGH.stagedList ? window.ninoGH.stagedList() : [];
    A.journal.note('หยุดพักอัตโนมัติ เฟส ' + g.phase + ' ที่ ' + Math.round(A.elapsed()) + 's' + (staged.length ? ' | stage ค้าง: ' + staged.join(',') : ''));
    if (staged.length)
        A.journal.addBacklog('commit ไฟล์ที่ stage ค้าง: ' + staged.join(', '));
    const msg = 'หยุดพักตามแผน (เวลา ' + Math.round(A.elapsed()) + 's · ใช้ไป ' + A.fmtK(A.snapshot().spent) + ' งบ) — งานที่เหลือบันทึกใน JOURNAL แล้ว' + (staged.length ? ' · ไฟล์ที่ stage ไว้ยังไม่ commit: ' + staged.join(', ') : '') + ' · พิมพ์ "ต่อ" เพื่อทำต่อ';
    return { reply: msg, action: 'explain', thinking: '', checklist: [], tool_call: null, final: msg, done: true, _land: true };
}

async function doSwitchMode(a) {
    const to = a.mode === 'roleplay' ? 'roleplay' : 'code';
    const cur = spaceModeOf(currentCharacter);
    const ok = (r) => ({ ok: true, result: r, error: null });
    if (to === cur)
        return ok('อยู่โหมด ' + to + ' อยู่แล้ว');
    if (to === 'code') {
        if (!_nestedRp) {
            _pendingSwitch = { mode: 'code', goal: String(a.goal || 'ทำงานต่อจากที่ตรวจ').slice(0, 400) };
            return ok('จะสลับเป็นโหมดโค้ดหลังจบเทิร์นนี้');
        }
        _rpBack = { goal: a.goal || '' };
        return ok('จบภารกิจ กำลังกลับโหมดโค้ด');
    }
    if (_nestedRp)
        return { ok: false, result: null, error: 'ซ้อนโหมดไม่ได้' };
    if (!providerHasKey(getCfg()))
        return { ok: false, result: null, error: 'ยังไม่ได้ตั้งค่า API Key' };
    const A = window.ninoAgent;
    const goal = String(a.goal || 'ตรวจโค้ดทุกไฟล์ใน GitHub วางแผนเป็นตาราง เขียน Skill.md').slice(0, 500);
    const ch = currentCharacter;
    let summary = '', err = null;
    _nestedRp = true;
    _rpBack = null;
    try {
        await setMode('roleplay', true);
        session.messages.push({
            sender: 'nino', phase: session.phase, action: 'explain', reply: 'สลับเป็นโหมดโรลเพลย์เอง — ภารกิจ: ' + goal, reasoning: 'mode-switch', characterId: ch.id, characterName: ch.name
        });
        session.messages.push({ sender: 'user', phase: session.phase, text: '[NINO สั่งตัวเอง] ' + goal, characterId: ch.id, characterName: ch.name });
        _rpMissionText = goal;
        await runRoleplayTurn('[ภารกิจ] ' + goal, { self: true });
        const last = [...session.messages].reverse().find(m => m.sender === 'nino' && String(m.reasoning || '').indexOf('roleplay') === 0);
        summary = last ? String(last.reply || '').replace(/\s+/g, ' ').slice(0, 900) : '';
    }
    catch (e) {
        err = String(e && e.message || e);
    }
    finally {
        _nestedRp = false;
        _rpMissionText = '';
        _rpBack = null;
        await setMode('code', true);
        session.messages.push({
            sender: 'nino', phase: session.phase, action: 'explain', reply: 'กลับโหมดโค้ดแล้ว — Skill.md ติดตัวเรียบร้อย (' + A.skill.size() + ' ตัวอักษร)', reasoning: 'mode-switch', characterId: ch.id, characterName: ch.name
        });
        renderMessages();
    }
    if (err)
        return { ok: false, result: null, error: 'ภารกิจโรลเพลย์ล้มเหลว: ' + err };
    const pl = A.plans.last();
    return ok('ภารกิจโรลเพลย์เสร็จ | สรุป: ' + summary + ' | Skill.md ' + A.skill.size() + ' ตัวอักษร หัวข้อ: ' + A.skill.names().join(', ') + ' | ตารางล่าสุด: ' + (pl ? pl.title + ' (' + pl.rows.length + ' แถว)' : '-') + ' | ตอนนี้อยู่โหมดโค้ดและ Skill.md ถูกแนบในพรอมต์แล้ว');
}

async function dispatchCommon(call) {
    const a = call.args || {};
    const A = window.ninoAgent;
    const ok = (r) => ({ ok: true, result: r, error: null });
    const bad = (e) => ({ ok: false, result: null, error: e });
    if (!A)
        return bad('nino-agent.js ไม่ได้โหลด');
    const n = call.name;
    if (n === 'wallet')
        return ok(A.walletBlock() + '\n' + A.statusLine());
    if (n === 'budget_check')
        return ok(A.budgetCheck(a).text);
    if (n === 'journal_note') {
        if (a.task)
            A.journal.setTask(a.task);
        if (a.backlog)
            A.journal.addBacklog(a.backlog);
        if (a.done)
            [].concat(a.done).forEach(x => A.journal.finish(x));
        if (a.text)
            A.journal.note(a.text);
        return ok('บันทึกแล้ว\n' + A.jbrief());
    }
    if (n === 'skill_load')
        return ok(A.skill.get() || '(Skill.md ยังว่าง — เขียนด้วย skill_save)');
    if (n === 'skill_save') {
        const body = a.body || a.content;
        if (!body)
            return bad('ต้องมี body');
        if (a.section) {
            if (!A.skill.section(a.section, body, !!a.append))
                return bad('บันทึกไม่ได้');
        }
        else
            A.skill.set(a.append ? A.skill.get() + '\n' + body : body);
        return ok('Skill.md ' + A.skill.size() + ' ตัวอักษร หัวข้อ: ' + A.skill.names().join(', ') + ' (เก็บในเครื่อง; โหมดโค้ดใช้ skill_sync เพื่อ stage ลงรีโป)');
    }
    if (n === 'skill_pull') {
        if (!window.ninoGH || !window.ninoGH.configured())
            return bad('ยังไม่ได้ตั้งค่า GitHub');
        const pt = await window.ninoGH.readText('Skill.md');
        if (!pt)
            return bad('อ่าน Skill.md จากรีโปไม่ได้');
        try {
            localStorage.setItem('nino-skill-bak', A.skill.get());
        }
        catch (_) { }
        A.skill.set(pt);
        return ok('โหลด Skill.md จากรีโปแล้ว ' + A.skill.size() + ' ตัวอักษร (ฉบับเดิมสำรองไว้ใน localStorage nino-skill-bak) หัวข้อ: ' + A.skill.names().join(', '));
    }
    if (n === 'skill_sync') {
        if (!window.ninoGH || !window.ninoGH.configured())
            return bad('ยังไม่ได้ตั้งค่า GitHub');
        const rv = await window.ninoGH.stageText('Skill.md', A.skill.get());
        return ok('stage Skill.md rev=' + rv + ' → gh_commit เมื่อพร้อม');
    }
    if (n === 'plan_table') {
        const p = A.planNorm(a);
        const saved = A.plans.add(p);
        if (a.toSkill !== false)
            A.skill.section('แผนที่/ตารางล่าสุด', A.planMd(p), false);
        if (_planTarget)
            _planTarget.plan = saved;
        else {
            const ch = getActiveCharacter() || currentCharacter;
            session.messages.push({
                sender: 'nino', phase: session.phase, action: 'explain', reply: 'แผน' + p.title, reasoning: 'plan', plan: saved, characterId: ch.id, characterName: ch.name
            });
            renderMessages();
        }
        return ok('บันทึกตาราง ' + p.rows.length + ' แถว' + (a.toSkill !== false ? ' + ลง Skill.md' : ''));
    }
    if (n === 'recall') {
        const sc = a.scope || 'both';
        const out = [];
        ['code', 'roleplay'].forEach(md => {
            if (sc !== 'both' && sc !== md)
                return;
            const r = recallSpace(md, a.query || '');
            out.push('[' + md + '] facts: ' + (r.facts.slice(0, 6).join(' | ') || '-') + '\nevents: ' + (r.events.slice(0, 5).join(' | ') || '-') + '\nrag: ' + (r.rag.slice(0, 3).join(' | ') || '-') + '\nepisodes: ' + (r.episodes.join(' | ') || '-'));
        });
        return ok(out.join('\n'));
    }
    if (n === 'remember') {
        const sc = a.scope === 'roleplay' || a.scope === 'code' ? a.scope : spaceModeOf(currentCharacter);
        const mem = SPACES[sc].memory;
        const key = String(a.key || '').slice(0, 60), value = String(a.value || '').slice(0, 300);
        if (!key || !value)
            return bad('ต้องมี key และ value');
        const ex = mem.facts.find(f => f.key === key);
        if (ex) {
            ex.value = value;
            ex.updatedAt = Date.now();
        }
        else {
            mem.facts.push({
                id: 'fact-' + Date.now(), key, value, priority: Math.max(1, Math.min(10, Number(a.priority) || 5)), tags: extractTags(key + ' ' + value), embedding: embedText(key + ' ' + value), createdAt: Date.now(), updatedAt: Date.now()
            });
            if (mem.facts.length > 50)
                mem.facts = mem.facts.slice(-50);
        }
        persistSession();
        return ok('จำแล้ว [' + sc + '] ' + key);
    }
    if (n === 'switch_mode')
        return await doSwitchMode(a);
    return bad('ไม่รู้จักเครื่องมือ ' + n);
}

async function runRpToolCall(c, botMsg) {
    const A = window.ninoAgent;
    const t0 = Date.now();
    if (c.name === '_bad')
        return '[_bad] JSON ในแท็กผิดรูปแบบ';
    if (!rpAllowed(c.name))
        return '[' + c.name + '] ✗ ไม่รู้จักเครื่องมือนี้ในโหมดโรลเพลย์';
    if (/^gh_(edit|create|delete|move)$/.test(c.name) && window.ninoGH && typeof window.ninoGH.isProtected === 'function' && [c.args && c.args.path, c.args && c.args.to, c.args && c.args.from].some(p => p && window.ninoGH.isProtected(String(p))) && !(c.args && (c.args.confirm === true || c.args.approved === true)))
        return '[' + c.name + '] ✗ ไฟล์ป้องกัน (รายชื่อใน NOW.md) ต้องให้ผู้ใช้อนุมัติก่อน — ส่ง confirm:true หลังผู้ใช้ยืนยัน และตอน gh_commit ผู้ใช้จะถูกถามอีกครั้ง';
    _planTarget = botMsg;
    let r;
    try {
        r = c.name.indexOf('gh_') === 0 ? await dispatchGH({ name: c.name, args: c.args }) : await dispatchTool({ name: c.name, args: c.args });
    }
    catch (e) {
        r = { ok: false, error: String(e && e.message || e) };
    }
    _planTarget = null;
    const txt = r && r.ok === false ? '✗ ' + (r.error || 'ล้มเหลว') : (typeof r.result === 'string' ? r.result : JSON.stringify(r.result == null ? r : r.result));
    A.noteTool(c.name, txt.length, Date.now() - t0);
    return '[' + c.name + '] ' + String(txt).slice(0, RP_RESULT_MAX);
}

function runSelfTest() {
    try {
        buildSystemPrompt();
        buildRoleplaySystemPrompt(getActiveCharacter() || currentCharacter);
        retrieveContext('self-test');
        formatAgentHistory([{ role: 'assistant', content: 'x', call: { name: 'gh_read', args: {} }, toolResult: { ok: true, result: 'y' } }]);
        if (typeof orchestratorRun !== 'function' || typeof runRoleplayTurn !== 'function' || typeof dispatchTool !== 'function')
            throw new Error('ฟังก์ชันหลักหาย');
        if (!orchestratorState || !Array.isArray(orchestratorState.history))
            throw new Error('orchestratorState ผิดปกติ');
        if (!window.ninoAgent)
            throw new Error('nino-agent.js ไม่ได้โหลด');
        window.ninoAgent.selfCheck();
        if (!SPACES.code.memory || !SPACES.roleplay.memory)
            throw new Error('memory spaces หาย');
        if (window.ninoRevive)
            window.ninoRevive.markGood();
        return true;
    }
    catch (e) {
        if (window.ninoRevive)
            window.ninoRevive.fail(String(e && e.message || e));
        return false;
    }
}

let _activeStreamController = null;
let _stopRequested = false;
let _stopGraceTimer = null;
let _streamBotIdx = -1;

function setBubblePct(idx, pct) {
    const el = chatContainer.querySelector(`[data-pct-idx="${idx}"]`);
    if (el) {
        el.textContent = pct + '%';
        el.classList.remove('hidden');
    }
}

function clearBubblePct(idx) {
    const el = chatContainer.querySelector(`[data-pct-idx="${idx}"]`);
    if (el)
        el.classList.add('hidden');
}

let _requestId = 0;

async function persistSession() {
    const doWrite = async () => {
        try {
            const snap = {
                id: 'default', files: { ...session.files }, currentFile: session.currentFile, memory: snapMem(SPACES.code.memory), memoryRoleplay: snapMem(SPACES.roleplay.memory), timestamp: Date.now()
            };
            try {
                const existing = await DB.get('sessions', 'default');
                if (existing) {
                    if (existing.files)
                        snap.files = { ...(existing.files || {}), ...snap.files };
                    if (0) {
                        const evMap = new Map();
                        for (const e of (existing.memory.events || []))
                            evMap.set(e.id, e);
                        for (const e of snap.memory.events)
                            evMap.set(e.id, e);
                        snap.memory.events = [...evMap.values()].slice(-200);
                        const fMap = new Map();
                        for (const f of (existing.memory.facts || []))
                            fMap.set(f.id, f);
                        for (const f of snap.memory.facts)
                            fMap.set(f.id, f);
                        snap.memory.facts = [...fMap.values()].slice(-50);
                        const sMap = new Map();
                        for (const s of (existing.memory.summaries || []))
                            sMap.set(s.id, s);
                        for (const s of snap.memory.summaries)
                            sMap.set(s.id, s);
                        snap.memory.summaries = [...sMap.values()].slice(-10);
                    }
                }
            }
            catch (_) { }
            await DB.put('sessions', snap);
            await SPACES.code.vector.save('default');
            await SPACES.code.episodic.save('default');
            await SPACES.roleplay.vector.save('roleplay');
            await SPACES.roleplay.episodic.save('roleplay');
            await saveChatForCharacter(currentCharacter.id, session.messages);
        }
        catch (_) { }
    };
    if (navigator.locks && navigator.locks.request) {
        try {
            return await navigator.locks.request('nino-persist', { mode: 'exclusive' }, doWrite);
        }
        catch (_) { }
    }
    return doWrite();
}

async function restoreSession() {
    try {
        const snap = await DB.get('sessions', 'default');
        if (snap) {
            if (snap.files)
                session.files = snap.files;
            if (snap.currentFile)
                session.currentFile = snap.currentFile;
            if (snap.memory) {
                const cm = SPACES.code.memory;
                cm.facts = snap.memory.facts || [];
                cm.events = snap.memory.events || [];
                cm.summaries = snap.memory.summaries || [];
                cm.tags = snap.memory.tags || {};
            }
            if (snap.memoryRoleplay) {
                const rm = SPACES.roleplay.memory;
                rm.facts = snap.memoryRoleplay.facts || [];
                rm.events = snap.memoryRoleplay.events || [];
                rm.summaries = snap.memoryRoleplay.summaries || [];
                rm.tags = snap.memoryRoleplay.tags || {};
            }
        }
        await SPACES.code.vector.load('default');
        await SPACES.code.episodic.load('default');
        await SPACES.roleplay.vector.load('roleplay');
        await SPACES.roleplay.episodic.load('roleplay');
        const lastCharId = localStorage.getItem('nino-last-char') || DEFAULT_CHARACTER.id;
        const ch = allCharacters.find(c => c.id === lastCharId) || currentCharacter;
        currentCharacter = ch;
        useMemorySpace(spaceModeOf(ch));
        const messages = await loadChatForCharacter(ch.id);
        if (!messages.length) {
            const g = ch.greeting || ('สวัสดี ฉันคือ ' + ch.name);
            messages.push({
                sender: 'nino', turn: 1, action: 'explain', reply: g, reasoning: 'greeting', characterId: ch.id, characterName: ch.name, characterAvatar: ch.avatar || ''
            });
        }
        session.messages = messages;
        session.phase = Math.max(1, messages.filter(m => m.sender === 'user').length + 1);
        return !!snap;
    }
    catch (_) {
        return false;
    }
}

window.ninoSkillRefresh = async function () {
    const A = window.ninoAgent;
    if (!A || !window.ninoGH || !window.ninoGH.configured())
        return false;
    const rv = x => { const m = /^rev:\s*([\d.]+)/m.exec(String(x || '').slice(0, 400)); return m ? m[1] : '0'; };
    const cmp = (a, b) => { const p = String(a).split('.').map(Number), q = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (p[i] || 0) - (q[i] || 0); if (d) return d; } return 0; };
    const mark = (self.NINO_VERSION || '') + '/' + (self.NINO_BUILD || '');
    if (localStorage.getItem('nino-skill-chk') === mark)
        return false;
    const t = await window.ninoGH.readText('Skill.md');
    if (!t)
        return false;
    localStorage.setItem('nino-skill-chk', mark);
    if (cmp(rv(t), rv(A.skill.get())) <= 0)
        return false;
    try {
        localStorage.setItem('nino-skill-bak', A.skill.get());
    }
    catch (_) { }
    A.skill.set(t);
    if (typeof toast === 'function')
        toast('Skill.md ใหม่จากรีโป (rev ' + rv(t) + ')');
    return true;
};
