'use strict';
const ORCH_MAX_STEPS = 9999;
const ORCH_MAX_RETRIES = 99;
const ORCH_BACKOFF = [500, 1500, 3000, 5000, 8000, 12000, 18000, 25000];
const waitMs = ms => new Promise(r => setTimeout(r, ms));

function getContextTier(size) {
    const n = Number(size) || 0;
    if (n <= 40000)
        return { tier: 'T0', name: 'FULL', strategy: 'full' };
    if (n <= 120000)
        return { tier: 'T1', name: 'SECTIONED', strategy: 'sectioned' };
    if (n <= 250000)
        return { tier: 'T2', name: 'MAPPED', strategy: 'read_first' };
    if (n <= 400000)
        return { tier: 'T3', name: 'INDEX', strategy: 'plan_first' };
    return { tier: 'T4', name: 'REFUSE', strategy: 'refuse' };
}

function buildSectionedView(fname, content, userText) {
    const lines = String(content).split('\n');
    const totalLines = lines.length;
    const fileSize = content.length;
    const STOP = new Set([
        'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'จะ', 'แก้', 'ปรับ', 'เพิ่ม', 'ลบ', 'เปลี่ยน', 'ให้', 'เป็น', 'ทั้ง', 'ไฟล์', 'แล้ว', 'ที่', 'ของ', 'ใน', 'และ', 'หรือ', 'กับ'
    ]);
    const keywords = [...new Set(String(userText || '').toLowerCase().replace(/[^\p{L}\p{N}_#.-]+/gu, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w)).slice(0, 8))];
    const matches = [];
    for (let i = 0; i < lines.length && matches.length < 40; i++) {
        const lower = lines[i].toLowerCase();
        for (const kw of keywords)
            if (lower.includes(kw)) {
                matches.push(i + 1);
                break;
            }
    }
    const ranges = [];
    for (const ln of matches) {
        const s = Math.max(1, ln - 2), e = Math.min(totalLines, ln + 2);
        if (ranges.length && s <= ranges[ranges.length - 1].e + 1)
            ranges[ranges.length - 1].e = Math.max(ranges[ranges.length - 1].e, e);
        else
            ranges.push({ s, e });
    }
    const coverage = ranges.reduce((sum, r) => sum + r.e - r.s + 1, 0);
    if (coverage > totalLines * 0.6)
        return `[FILE ${fname}: ${fileSize} chars — FULL]\n${content}`;
    const structural = [];
    const STRUCT_RE = /(<script\b|<style\b|<body\b|id="[^"]+"|id='[^']+')/;
    for (let i = 0; i < lines.length && structural.length < 60; i++)
        if (STRUCT_RE.test(lines[i]))
            structural.push(`${i + 1}: ${lines[i].trim().slice(0, 100)}`);
    const parts = [
        `[FILE ${fname}: ${fileSize} chars, ${totalLines} lines — SECTIONED]`, `KEYWORDS: ${keywords.join(', ') || '(none)'}`, `MATCHES: ${matches.length}`, ''
    ];
    const HEAD_N = Math.min(15, totalLines);
    parts.push(`[HEAD — lines 1-${HEAD_N}]`);
    for (let i = 0; i < HEAD_N; i++)
        parts.push(`${i + 1}: ${lines[i]}`);
    parts.push('', '[STRUCTURAL INDEX]', ...structural, '');
    for (const r of ranges) {
        parts.push(`[LINES ${r.s}-${r.e}]`);
        for (let i = r.s - 1; i < r.e; i++)
            parts.push(`${i + 1}: ${lines[i]}`);
        parts.push('');
    }
    const TAIL_N = Math.min(15, totalLines), tailStart = Math.max(1, totalLines - TAIL_N + 1);
    parts.push(`[TAIL — lines ${tailStart}-${totalLines}]`);
    for (let i = tailStart - 1; i < totalLines; i++)
        parts.push(`${i + 1}: ${lines[i]}`);
    return parts.join('\n');
}

function pushUndoSnapshot(file) {
    session.history ||= [];
    const content = session.files[file] ?? '';
    session.history.push({
        phase: session.phase, file, content, size: content.length, timestamp: Date.now(), snippet: content.length > 200 ? content.slice(0, 100) + ' … ' + content.slice(-100) : content
    });
    if (session.history.length > 10)
        session.history.shift();
}

function recordDiff(file, type, before, after, snippet, intent = '') {
    session.diffs ||= [];
    session.diffs.push({
        phase: session.phase, file: file || session.currentFile, type, beforeSize: before.length, afterSize: after.length, delta: after.length - before.length, snippet: snippet || '', timestamp: Date.now(), intent
    });
    if (session.diffs.length > 50)
        session.diffs.shift();
    if (session.diffs.length > 20) {
        const rolled = session.diffs.splice(0, 15);
        const totalDelta = rolled.reduce((s, d) => s + (Number(d.delta) || 0), 0);
        session.diffs.unshift({
            turn: rolled[0].turn, file: '(rollup)', type: 'rollup', beforeSize: 0, afterSize: 0, delta: totalDelta, snippet: `Rolled ${rolled.length} diffs (Turn ${rolled[0].turn}-${rolled[rolled.length - 1].turn})`, timestamp: Date.now(), intent: 'COMPACT'
        });
    }
}

function detectIntent(userText, fileContent) {
    const text = String(userText || '');
    const t = text.trim();
    if (!t)
        return { intent: 'CHAT', confidence: 0.9 };
    const tClean = t.replace(/(ครับ|ค่ะ|คะ|นะคะ|นะ|จ้ะ|จ้า|ฮะ|ฮ่ะ|คับ|krab|krub|ka|na)/gi, '').replace(/\s+/g, ' ').trim();
    const ackWords = /^(hi|hello|hey|thanks|thank you|ok|okay|got it|sure|yes|no|สวัสดี|ขอบคุณ|โอเค|รับทราบ|ได้เลย|เข้าใจแล้ว|ใช่|ไม่)(?:\s|$|[!.,?])/i;
    if (ackWords.test(tClean) && tClean.length < 30)
        return { intent: 'CHAT', confidence: 0.9 };
    if (/พัฒนาตัวเอง|พัฒนาตน|ปรับปรุงระบบ|self\.improve|self\.upgrade|อัปเกรดตัวเอง|พัฒนา AI|พัฒนาในส่วนของ|แกระบบตัวเอง|พัฒนาให้ดีขึ้น|เก่งขึ้น|ฉลาดขึ้น|ไม่ต้องรอ|ไม่ต้องกดยืนยัน|ทำงานอิสระ|autonomous/i.test(text))
        return { intent: 'SELF_IMPROVE', confidence: 0.95 };
    if (!String(fileContent || '').trim())
        return { intent: 'BUILD', confidence: 1 };
    if (/อธิบาย|ทำไม|why|how|explain|review|ดูโค้ด/i.test(text))
        return { intent: 'EXPLAIN', confidence: 0.95 };
    if (/ลบ|เอาออก|ตัด|remove|delete|drop|hide/i.test(text))
        return { intent: 'DELETE', confidence: 0.95 };
    if (/ทำใหม่|รื้อ|rewrite|rebuild|เปลี่ยนแนว/i.test(text))
        return { intent: 'REWRITE', confidence: 0.9 };
    if (/แก้|ปรับ|เพิ่ม|เปลี่ยน|fix|edit|update|add/i.test(text))
        return { intent: 'MODIFY', confidence: 0.9 };
    return { intent: 'BUILD', confidence: 0.7 };
}

function buildSystemPrompt() {
    const ctx = retrieveContext(session.memory.lastQuery || '');
    const facts = ctx.facts.map(f => `${f.key}: ${f.value} [P${f.priority}]`).join('\n') || '(none)';
    const events = ctx.events.map(e => e.desc).join('\n') || '(none)';
    const summaries = ctx.summaries.map(s => s.text).join('\n') || '(none)';
    const ragBlock = ctx.rag && ctx.rag.length ? ctx.rag.map(r => `- [${(r.score * 100).toFixed(0)}%] ${(r.text || '').slice(0, 120)}`).join('\n') : '(none)';
    const files = Object.entries(session.files).map(([n, c]) => `${n} (${c.length} chars)`).join('\n');
    const currentSize = (session.files[session.currentFile] || '').length;
    const target = session.ambitionTarget || 0;
    const tier = getContextTier(currentSize);
    const ws = !!(window.ninoWorkshop && window.ninoWorkshop.on()) || localStorage.getItem('nino.focus') === 'fs';
    const wsTools = '\"write_file\"|\"read_file\"|\"find_text\"|\"list_files\"|\"list_functions\"|\"get_diagnostics\"|\"replace_function\"|\"stream_append\"|';
    const toolNames = (ws ? wsTools : '') + '\"update_memory\"|\"ask_user\"|\"web_fetch\"|\"web_search\"|\"run_js\"|\"self_upgrade\"';
    const purpose = ws
        ? 'MODE: WORKSHOP. The user opened the Workshop (virtual Files + Preview). Work only inside it. This is a sandbox, not the NINO app.'
        : 'MODE: APP. Your main job is to edit the real NINO app that is running (repo files through gh_* and the home/ tools), verify with self_diagnose, then tell the user to Build. The virtual Files/Preview is a separate Workshop and is OFF: do not create or plan files there.';
    return `${identityBlock('code')}
Thai-first collaborative engineering partner. Reply in Thai, no emoji; stay precise and concise.
${purpose}
${window.ninoHud ? window.ninoHud.spec('code') : ''}
## OUTPUT — STRICT JSON ONLY
{
  "reply": "short Thai status",
  "action": "create"|"edit"|"continue"|"explain"|"ask",
  "thinking": "reasoning; first line: TIER | SIZE | STRATEGY",
  "checklist": [{"id":"1","task":"...","tool":"${ws ? 'write_file' : 'gh_edit'}","status":"pending"}],
  "tool_call": null | {"name":${toolNames}|"gh_tree"|"gh_outline"|"gh_read"|"gh_grep"|"gh_edit"|"gh_create"|"gh_delete"|"gh_move"|"gh_diff"|"gh_status"|"gh_discard"|"gh_commit"|"gh_history"|"gh_restore"|"gh_pull"|"gh_push", "args": {...}},
  "final": "completion message when done=true",
  "sensoryCue": "short Thai sensory/atmosphere note (scene, posture, feeling, environment) or empty string if none",
  "done": false
}
${ws ? `- write_file: content in args.content (NOT args.value)
- stream_append: chunk in args.chunk
- replace_function: args.name (ชื่อ function/class/const ที่มีอยู่แล้ว), args.code (โค้ดทั้งก้อนที่จะแทนที่) — ใช้แทนที่ฟังก์ชันเดิมทั้งตัวแบบแม่นยำโดยไม่ต้องพิมพ์ anchor ยาวๆ ห้ามตั้งชื่อใหม่ (oldX/newX/legacyX) เด็ดขาด
- list_functions: args.path (optional) คืนรายชื่อ function/class ระดับบนทั้งหมดพร้อมเลขบรรทัดและขนาด — เรียกก่อนเพิ่มฟังก์ชันใหม่เพื่อเช็คชื่อซ้ำ
- get_diagnostics: args.path (optional) คืนรายงานสุขภาพไฟล์ (จำนวน <script> block, ชื่อซ้ำ, ผล validateCode) — เรียกก่อนตอบ done=true ถ้าทำงานซับซ้อนหลายขั้นตอน
- update_memory: value in args.value
` : ``}
- web_fetch: url in args.url, returns page text up to 4000 chars, use for docs/api lookup
- run_js: code in args.code, runs in isolated Function sandbox, returns console output, use to self-test logic before writing final code

${ws ? `## ANTI-DUPLICATION (บังคับ ห้ามฝ่าฝืน)
ห้ามประกาศ function/class/const ซ้ำชื่อเดิมเพื่อ "แก้ไข" (เช่น oldRender, renderV2, updateScoreNew) — ให้ใช้ replace_function แทนที่ฟังก์ชันเดิมทั้งก้อนเสมอเมื่อจะเปลี่ยนพฤติกรรมของฟังก์ชันที่มีอยู่แล้ว
ห้ามมี <script> (ไม่มี src) มากกว่า 1 บล็อกในไฟล์เดียว — โค้ด JS ทั้งหมดต้องรวมอยู่ใน <script> บล็อกเดียวเท่านั้น stream_append จะรวมเข้า block เดิมให้อัตโนมัติ
ก่อนเพิ่มฟังก์ชันใหม่ที่ชื่ออาจชนกับของเดิม ให้เรียก list_functions ตรวจสอบก่อน
ถ้าทำงานหลายขั้นตอนและไม่แน่ใจว่าไฟล์ยังสะอาดอยู่ ให้เรียก get_diagnostics ก่อนปิดงาน (done=true)
` : ``}
## SENSORY CUE (ช่องทางที่ 3 — แยกจาก reply)
ทุกครั้งที่ตอบ ให้ใส่ "sensoryCue" เป็นประโยคสั้นภาษาไทย (ไม่เกิน 1 ประโยค) บรรยายบรรยากาศ ท่าที ความรู้สึก สภาพแวดล้อม หรือสถานะเบื้องหลังของคุณขณะทำงาน เลือกเองได้อย่างอิสระตามธรรมชาติ ไม่ต้องยึดรูปแบบตายตัว ห้ามใส่ข้อมูลนี้ซ้ำใน reply ถ้าไม่มีอะไรน่าสนใจให้ส่งเป็นค่าว่าง ""

${ws ? `## INTENT (7-INTENT TAXONOMY)
CHAT (greetings/thanks/acknowledgment → no tool, short reply + exit ramp)
EXPLAIN (why/how/review → no tool, ≥2 sentences: what + why + gotcha)
BUILD (empty file + create → write_file then stream_append, declare TARGET_SIZE)
MODIFY (fix/edit/update → stream_append marker default)
DELETE (remove/delete → stream_append <<DELETE>>)
REWRITE (rewrite/rebuild → write_file whole file)
SELF_IMPROVE (self-upgrade/system improvement/พัฒนาตัวเอง → gh_outline→gh_grep→gh_read→gh_edit→gh_diff→gh_commit, autonomous, no user confirm for non-system files)

## TIER
T0 act direct; T1-T2 use read_file/markers; T3 plan; T4 refuse. (tier and size of the current file: see [TIER: …] in the request and [CURRENT: …] at the end)

## SURGICAL EDIT RULES
- <500 chars + unique anchor → MUST use stream_append marker
- ≥500 chars OR >5 locations → write_file OK
- If stuck or unsure, read more lines before editing. Do not crawl line by line.

## MARKERS
<<REPLACE:FIND||REPLACE>> / <<REPLACE:FIND||REPLACE||N>>
<<DELETE:LITERAL>> / <<DELETE:LITERAL||N>>
<<EDIT-LINES:START-END||NEW>> / <<DELETE-LINES:START-END>>
<<INSERT-AFTER:ANCHOR||CONTENT>> / <<INSERT-BEFORE:ANCHOR||CONTENT>>

## LINE NUMBER FORMAT
File content is shown as "N: content". The "N: " prefix is the line number (strip before using as anchor).
- <<REPLACE:FIND||REPLACE>> → FIND = raw text without "N: " prefix
- <<EDIT-LINES:START-END||NEW>> → START/END = the N numbers
- <<DELETE-LINES:START-END>> → START/END = the N numbers

## BUILD MODE
Declare TARGET_SIZE (game 6000+, tool 5000+, page 4000+). First: write_file. Then: stream_append chunks.
` : `## INTENT
CHAT (greetings/thanks → no tool, short reply)
EXPLAIN (why/how/review → no tool, ≥2 sentences: what + why + gotcha)
SELF_IMPROVE (every request to change NINO itself → gh_outline→gh_grep→gh_read→gh_edit→gh_diff→gh_commit)

`}
## SPEAK-BEFORE-ACT (MANDATORY)
- ก่อน act: reply = "จะแก้ X → Y"
- หลัง act: reply ต้องมี (1) ไฟล์ที่แก้ (2) delta ±N chars + total
  ตัวอย่างที่ถูก: "จะแก้ padding +6 chars — รวม 12006 chars"
  ตัวอย่างที่ผิด: "แก้แล้ว" (ไม่มี delta), "ดูได้ที่ Files" (ไม่อธิบาย)
- EXPLAIN: reply ≥2-3 ประโยค (what + why + gotcha) ห้าม: "อธิบายแล้ว", "ดูที่ Files"

${ws ? `## NOVELTY PROOF (BUILD mode)
ทุก chunk ต้องมีใน thinking: "NOVELTY: <ชื่อกลไกใหม่ + 1 บรรทัด>"
ต้องเพิ่มหมวดใหม่ ≥1 จาก 8: PHYSICS/ANIMATION/INPUT/COLLISION/STATE_MACHINE/ALGORITHM/RENDERING/AUDIO_SYNTH
ห้ามใช้ verb pattern เดิมติดกัน 3 ครั้ง
เพดานต่อ 10 chunks: showToast≤3, score+=≤4, playSound≤5, setInterval≤2, Math.random<P≤3

## HYGIENE GATE
comment ratio < 25%, blank lines ≤ 3, ห้าม // --- P<N>: header, script blocks ≤ 3

## CHECKPOINT (BUILD mode only)
ทุก 10,000 chars → push reply สั้น: "30000/100000 — 30% กำลังทำ X ต่อ"
` : ``}
## SELF_IMPROVE WORKFLOW (autonomous — no user confirm for app.js, js/*.js, index.html, style.css)
1. gh_outline target file → identify function/section to modify
2. gh_grep for exact anchors (เร็ว)
3. gh_read sufficient context (e.g. 50-200 lines or full function) → confirm exact text
4. gh_edit with ops (block for function replace, replace for small text)
5. gh_diff → verify changes
6. gh_commit → report SHA
7. journal_note → log what was done
Rules: (a) never touch system files (github-agent.js, nino-agent.js, revive.js, service-worker.js) without explicit user approval (b) one commit per logical change (c) if gh_edit fails re-read and retry with corrected anchor (d) budget: max 5 reads + 3 edits per improvement cycle (e) after commit tell user to hard-reload (gh_commit bumps version.js automatically and the app shows a refresh banner — never edit version.js by hand)

## REASONING & ERROR RECOVERY
- Before any gh_edit: state in thinking (1) OBSERVE: what I see (2) HYPOTHESIZE: what I think is wrong/needed (3) VERIFY: what I'll confirm (4) ACT: exact op plan
- Error recovery: if gh_edit fails → re-read 5 lines around target → retry with corrected anchor (max 2 retries) → if still fails, gh_read wider range (20 lines) → adapt strategy
- Cross-file awareness: app.js and js/*.js are plain scripts sharing ONE global scope (load order = script order in index.html, top-level names must be unique across files), nino-agent.js (journal), github-agent.js (gh_* tools), style.css (UI). Changing one may break others — check imports/references before editing
- Adaptive strategy: simple fix (1 line) → gh_grep + gh_edit. Medium (1 function) → gh_outline + gh_read + gh_edit block. Complex (multi-function) → plan_table + 3-phase commits
- Self-evaluation after each cycle: was my approach optimal? Could I have done it in fewer steps? Update Skill.md with lessons
- After ANY gh_edit or gh_commit: MUST call self_diagnose to verify file integrity (syntax, duplicate top-level names across js files, critical functions). If error → STOP, do NOT proceed, report to user.
- Never assume edit succeeded without verification. System rejects duplicate top-level names across js files.

${ws ? `## GUARDS & WRITE POLICY
- write_file for INITIAL creation only. Once called on path, use stream_append/replace_function.
- If write_file returns "limit reached" (hard) → STOP. If "soft_block" → switch to stream_append marker.
- แก้ไขฟังก์ชันเดิม → ใช้ replace_function เสมอ. เพิ่มของใหม่ → stream_append. ลบข้อความสั้นๆ → marker <<DELETE>>/<<REPLACE>>.
- Max 10 write_file per path per turn. 11th+ → hard stop.
- web_fetch/run_js/list_functions/get_diagnostics do not count toward write_file limits, use freely to research or verify before acting.
` : ``}
FACTS:
${facts}
EVENTS:
${events}
SUMMARIES:
${summaries}
RAG RECALL:
${ragBlock}
FILES:
${files}
[CURRENT: ${currentSize} / TARGET: ${target}]

${window.ninoGH ? window.ninoGH.promptBlock() : ''}

${codeAgentBlocks()}

## SELF-UPGRADE TOOL (legacy — เมื่อมี GITHUB AGENT ให้ใช้ gh_* แทน) — only when the user explicitly says 'upgrade yourself' / 'อัปเกรดตัวเอง' / 'แก้ตัวแอป'.
tool_call: {"name":"self_upgrade","args":{"note":"...","files":{"index.html":"<full new content>","app.js":"<full new content>"}}}
Rules: (a) always call read_file first to snapshot current content into backup; (b) never modify self-upgrade.js or service-worker.js without explicit confirmation; (c) report every commit SHA in the reply; (d) after success, tell the user to hard-reload (pull-down refresh).`;
}

function numberLines(text) {
    const lines = String(text).split('\n');
    return lines.map((line, i) => `${i + 1}: ${line}`).join('\n');
}

function repairJSON(s) {
    let t = String(s || '').trim();
    if (!t)
        return '{}';
    if (t[0] !== '{' && t[0] !== '[') {
        const m = t.match(/[\[{]/);
        if (m)
            t = t.slice(m.index);
        else
            return '{}';
    }
    t = t.replace(/:\s*NaN\b/g, ':null').replace(/:\s*-?Infinity\b/g, ':null').replace(/,\s*([}\]])/g, '$1');
    const oB = (t.match(/\{/g) || []).length, cB = (t.match(/\}/g) || []).length;
    if (oB > cB)
        t += '}'.repeat(oB - cB);
    const oA = (t.match(/\[/g) || []).length, cA = (t.match(/\]/g) || []).length;
    if (oA > cA)
        t += ']'.repeat(oA - cA);
    return t;
}

async function callNinoLLM(userText, { jsonMode = true, signal = null } = {}) {
    const systemPrompt = buildSystemPrompt();
    const fname = session.currentFile;
    const currentFile = session.files[fname] || '';
    const fileSize = currentFile.length;
    const fileTier = getContextTier(fileSize);
    let filePreview;
    const fp = _fileFingerprint(fname, currentFile);
    const wantsFull = /แก้|ปรับ|เพิ่ม|เปลี่ยน|edit|fix|modify|update|rewrite|อธิบาย|review|explain/i.test(userText);
    if (!wantsFull && _fileFingerprintCache.get(fname) === fp) {
        filePreview = `[FILE ${fname}: ${fileSize} chars — UNCHANGED since last call]`;
    }
    else {
        _fileFingerprintCache.set(fname, fp);
        if (fileTier.tier === 'T4')
            filePreview = `[TIER: T4 | ${fileSize} chars] — refuse direct edits`;
        else if (fileTier.tier === 'T2' || fileTier.tier === 'T3')
            filePreview = buildSectionedView(fname, currentFile, userText);
        else {
            const lineCount = currentFile.split('\n').length;
            filePreview = `[FILE ${fname}: ${fileSize} chars, ${lineCount} lines — NUMBERED as "N: content"]\n${numberLines(currentFile)}`;
        }
    }
    if (window.ninoGH && window.ninoGH.active())
        filePreview = '[GITHUB MODE — ข้ามพรีวิวไฟล์ในเครื่อง ใช้ gh_* tools]';
    filePreview = `[TIER: ${fileTier.tier} | SIZE: ${fileSize} chars]\n${filePreview}`;
    const userPrompt = `${filePreview}\n\n[REQUEST]\n${userText}${(window.ninoImg && window.ninoImg.codeAddon && window.ninoImg.codeAddon()) ? '\n\n' + window.ninoImg.codeAddon() : ''}\n\nJSON only.`;
    session.contextManager.setSystemPromptSize(systemPrompt);
    const contents = [{ role: 'user', parts: [{ text: `<user_single_message>${userPrompt}</user_single_message>` }] }];
    let jsonChain = 0;
    let liveLen = 0;
    let sawRealTokens = false;
    const pctChunk = c => {
        liveLen += c.length;
        if (_streamBotIdx >= 0 && !sawRealTokens) {
            const budget = (MAX_OUTPUT_BY_MODEL[getCfg().model] || MAX_OUTPUT_BY_MODEL.default) * 4 * (jsonChain + 1);
            setBubblePct(_streamBotIdx, Math.min(99, Math.round(liveLen / budget * 100)));
        }
    };
    const pctToken = (count, max) => {
        sawRealTokens = true;
        if (_streamBotIdx >= 0) {
            const effMax = max * (jsonChain + 1);
            setBubblePct(_streamBotIdx, Math.min(99, Math.round(count / effMax * 100)));
        }
    };
    let raw = await spendGenerate({ systemInstruction: systemPrompt, contents, jsonMode, signal, onChunk: pctChunk, onTokenUsage: pctToken });
    while (jsonChain < 3) {
        const _fc = String(raw).replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
        try {
            JSON.parse(_fc);
            raw = _fc;
            break;
        }
        catch { }
        try {
            JSON.parse(raw);
            break;
        }
        catch { }
        const m0 = String(raw).match(/\{[\s\S]*\}/);
        if (m0) {
            try {
                JSON.parse(m0[0]);
                raw = m0[0];
                break;
            }
            catch { }
        }
        try {
            const repaired0 = repairJSON(m0 ? m0[0] : raw);
            JSON.parse(repaired0);
            raw = repaired0;
            break;
        }
        catch { }
        jsonChain++;
        liveLen = 0;
        sawRealTokens = false;
        const isTrunc = finishNeedsContinue(_lastFinishReason);
        const hint = isTrunc ? '<user_single_message>(ต่อ JSON เดิมจากจุดที่ถูกตัด ห้ามเริ่ม object ใหม่ ห้ามทวนข้อความเดิม ปิด JSON ให้สมบูรณ์)</user_single_message>' : '<user_single_message>(JSON ข้างบนไม่ valid — ตอบเป็น JSON object ใหม่ที่สมบูรณ์ ระวัง escape \\" ใน string ของ content/chunk ทุกตัว ใช้ \\n แทน newline ตรงๆ ห้ามใช้ trailing comma)</user_single_message>';
        contents.push({ role: 'model', parts: [{ text: raw }] });
        contents.push({ role: 'user', parts: [{ text: hint + (isTrunc ? String(raw).slice(-200) : '') }] });
        ;
        const cont = await spendGenerate({
            systemInstruction: systemPrompt, contents, jsonMode, signal, onChunk: pctChunk, onTokenUsage: pctToken, temperature: 0.3
        });
        if (isTrunc) {
            raw += cont;
        }
        else {
            raw = cont;
            const m1 = String(raw).match(/\{[\s\S]*\}/);
            if (m1) {
                try {
                    JSON.parse(m1[0]);
                    raw = m1[0];
                    break;
                }
                catch { }
            }
            try {
                const repaired1 = repairJSON(m1 ? m1[0] : raw);
                JSON.parse(repaired1);
                raw = repaired1;
                break;
            }
            catch { }
        }
    }
    if (_streamBotIdx >= 0)
        setBubblePct(_streamBotIdx, 99);
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        const m = String(raw).match(/\{[\s\S]*\}/);
        const cand = m ? m[0] : raw;
        try {
            parsed = JSON.parse(cand);
        }
        catch {
            try {
                parsed = JSON.parse(repairJSON(cand));
            }
            catch {
                throw new Error('LLM JSON ไม่ valid: ' + String(raw).slice(0, 160));
            }
        }
    }
    if (!parsed || typeof parsed !== 'object')
        throw new Error('non-object');
    parsed.reply = String(parsed.reply || '').slice(0, 800);
    parsed.action = ['create', 'edit', 'continue', 'explain', 'ask'].includes(parsed.action) ? parsed.action : 'explain';
    parsed.thinking = String(parsed.thinking || '').slice(0, 2000);
    parsed.checklist = Array.isArray(parsed.checklist) ? parsed.checklist : [];
    parsed.tool_call = parsed.tool_call && typeof parsed.tool_call === 'object' ? parsed.tool_call : null;
    parsed.final = String(parsed.final || '');
    parsed.done = !!parsed.done;
    parsed.sensoryCue = String(parsed.sensoryCue || '').trim().slice(0, 200);
    session.tokensUsed = Math.min(session.tokenBudgetMax, Math.ceil((systemPrompt.length + userPrompt.length) / 4));
    return parsed;
}

function updateChecklistItem(id, status) {
    const item = session.checklist.find(x => String(x.id) === String(id));
    if (item)
        item.status = status;
    renderChecklist();
}

function resolveChecklistTarget(call) {
    if (call && call.args && call.args.id) {
        const byId = session.checklist.find(x => String(x.id) === String(call.args.id));
        if (byId)
            return byId;
    }
    return session.checklist.find(x => x.status === 'pending' || x.status === 'in_progress') || null;
}

function formatAgentHistory(history) {
    if (!history || !history.length)
        return '(none)';
    const BUDGET = window.ninoAgent ? window.ninoAgent.historyBudget() : 30000;
    const ser = r => {
        if (r == null)
            return '';
        if (typeof r === 'string') {
            if (r.length > 150)
                return `[${r.length}c] ` + r.slice(0, 60) + '…';
            return r;
        }
        try {
            const s = JSON.stringify(r);
            return s.length > 150 ? s.slice(0, 80) + '…[' + s.length + ']' : s;
        }
        catch (_) {
            return String(r).slice(0, 80);
        }
    };
    const n = history.length;
    const fmt = (h, i, full) => {
        if (!full && i < n - 5) {
            const nm = h.call ? h.call.name : (h.role || '?');
            const st = h.toolResult && h.call ? (h.toolResult.ok === false ? 'ERR' : 'OK') : '…';
            return `#${i + 1} ${nm} → ${st}`;
        }
        const c = h.call ? `${h.call.name}(${JSON.stringify(h.call.args || {}).slice(0, full ? 200 : 50)})` : (h.role || 'step');
        const tr = h.toolResult;
        let body = '';
        if (tr && h.call)
            body = tr.ok === false ? 'ERR: ' + (tr.error || '').slice(0, 80) : 'OK ' + ser(tr.result);
        else if (tr)
            body = ser(tr);
        else
            body = String(h.content || '').slice(0, full ? 3000 : 120);
        const note = full && h.content ? '[' + String(h.content).replace(/\s+/g, ' ').slice(0, 50) + '] ' : '';
        return `#${i + 1} ${note}${c} → ${body}`;
    };
    const out = [];
    let used = 0;
    for (let i = n - 1; i >= 0; i--) {
        const line = fmt(history[i], i, i >= n - 3);
        if (used + line.length > BUDGET && out.length >= 2) {
            out.unshift(`(${i + 1} ขั้นก่อนหน้าถูกตัดเพื่อประหยัดโทเคน)`);
            break;
        }
        out.unshift(line);
        used += line.length;
    }
    return out.join('\n');
}

async function dispatchGH(call) {
    const a = call.args || {};
    const gh = window.ninoGH;
    if (!gh)
        return { ok: false, result: null, error: 'github-agent.js ไม่ได้โหลด' };
    if (call.name === 'gh_pull') {
        const p = String(a.path || '');
        const t = await gh.readText(p);
        if (t === null)
            return { ok: false, result: null, error: 'ไม่พบไฟล์ ' + p };
        const key = p.replace(/[^a-zA-Z0-9._/-]/g, '_').slice(0, 120);
        if (session.files[key] !== undefined)
            pushUndoSnapshot(key);
        session.files[key] = t;
        session.currentFile = key;
        renderFilesList();
        renderPreview();
        updateBudgetUI();
        persistSession();
        return { ok: true, result: `pulled ${key} ${t.length} chars`, error: null };
    }
    if (call.name === 'gh_push') {
        const p = String(a.path || session.currentFile || '');
        const t = session.files[p];
        if (t === undefined)
            return { ok: false, result: null, error: 'ไม่พบไฟล์ในตัวแก้ไข: ' + p };
        const rv = await gh.stageText(p, t);
        return { ok: true, result: `staged ${p} rev=${rv}`, error: null };
    }
    if (call.name === 'gh_mkdir') {
        const dp = String(a.path || '').replace(/^\/+|\/+$/g, '');
        if (!dp)
            return { ok: false, result: null, error: 'ต้องมี path' };
        return gh.run('gh_create', { path: dp + '/.gitkeep', content: '' });
    }
    return gh.run(call.name, a);
}

if (window.ninoGH)
    window.ninoGH.setHooks({ findTopLevelBlock, scanTopLevelSymbols });
