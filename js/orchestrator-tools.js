'use strict';

async function dispatchTool(call) {
    const a = call.args || {};
    try {
        if (COMMON_TOOLS.test(String(call.name || '')))
            return await dispatchCommon(call);
        if (String(call.name || '').indexOf('gh_') === 0)
            return await dispatchGH(call);
        if (call.name === 'write_file') {
            let content = String(a.content || a.value || '');
            let path = String(a.path || 'index.html').replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/^\/+|\/{2,}/g, '').slice(0, 120);
            if (!content)
                return { ok: false, result: null, error: 'content empty' };
            if (!path)
                return { ok: false, result: null, error: 'path empty' };
            session.fileWriteCounts = session.fileWriteCounts || {};
            session.fileWriteCounts[path] = (session.fileWriteCounts[path] || 0) + 1;
            if (session.fileWriteCounts[path] > 10)
                return {
                    ok: false, result: null, error: `write_file hard limit reached for [${path}] — switch to stream_append markers immediately`, blocked: true, hard: true, redirect: 'use_stream_append'
                };
            const existing = session.files[path] || '';
            const validation = validateCode(content, path);
            if (!validation.ok)
                return {
                    ok: false, result: null, error: 'validation failed: ' + validation.reason, validation: true, retry_hint: 'Fix HTML structure: ' + validation.reason + '. Retry write_file with corrected content, or use stream_append marker.'
                };
            const isOverwrite = existing.length > 0;
            const shrinkRatio = isOverwrite ? content.length / existing.length : 1;
            const allowShrink = /ลบ|เอาออก|ตัด|ซ่อน|remove|delete|drop|hide|ทำใหม่|รื้อ|rewrite|rebuild/i.test(String(session.memory.lastQuery || ''));
            if (isOverwrite && existing.length > 500 && shrinkRatio < 0.5 && !allowShrink)
                return {
                    ok: false, result: null, error: `shrink ratio ${shrinkRatio.toFixed(2)} blocked`, blocked: true, soft: true, redirect: 'use_stream_append'
                };
            if (/\.html?$/i.test(path) && isOverwrite && existing.length > 2000 && !/<!DOCTYPE/i.test(content))
                return {
                    ok: false, result: null, error: 'fragment overwriting >2000 chars', rejected: true, soft: true, redirect: 'use_stream_append'
                };
            pushUndoSnapshot(path);
            const before = session.files[path] || '';
            session.files[path] = content;
            recordDiff(path, 'write', before, content, computeDiffSnippet(before, content));
            session.currentFile = path;
            if (vectorStore)
                vectorStore.addDocument(`write ${path} ${content.slice(0, 100)}`, { phase: session.phase, type: 'write' });
            renderFilesList();
            renderPreview();
            updateBudgetUI();
            renderMemoryDrawer();
            recordMemoryEvent(`write [${path}] ${content.length} chars`, ['write'], 4);
            _broadcast('file-update', { path, content: session.files[path] });
            persistSession();
            return { ok: true, result: path, error: null };
        }
        if (call.name === 'replace_function') {
            const path = String(a.path || session.currentFile || 'index.html').replace(/[^a-zA-Z0-9._/-]/g, '_').slice(0, 120);
            const fname = String(a.name || '').trim();
            const code = String(a.code || '').trim();
            if (session.files[path] === undefined)
                return { ok: false, result: null, error: 'file not found: ' + path };
            if (!fname)
                return { ok: false, result: null, error: 'name required' };
            if (!code)
                return { ok: false, result: null, error: 'code required' };
            const before = session.files[path];
            const block = findTopLevelBlock(before, fname);
            if (!block)
                return {
                    ok: false, result: null, error: 'ไม่พบ function/class/const "' + fname + '" ในไฟล์ ใช้ find_text หรือ list_functions ตรวจชื่อก่อน หรือใช้ stream_append เพิ่มเป็นของใหม่'
                };
            const next = before.slice(0, block.start) + code + before.slice(block.end);
            const mv = validateCode(next, path);
            if (!mv.ok)
                return { ok: false, result: null, error: 'validation failed: ' + mv.reason, validation: true };
            pushUndoSnapshot(path);
            recordDiff(path, 'refactor', before, next, computeDiffSnippet(before, next));
            session.files[path] = next;
            session.currentFile = path;
            renderFilesList();
            renderPreview();
            updateBudgetUI();
            renderMemoryDrawer();
            const delta = next.length - before.length;
            recordMemoryEvent(`refactor [${path}] ${fname} ${delta >= 0 ? '+' : ''}${delta}`, ['refactor'], 4);
            _broadcast('file-update', { path, content: session.files[path] });
            persistSession();
            return { ok: true, result: path, error: null, marker: true, delta, size: next.length };
        }
        if (call.name === 'read_file') {
            const p = String(a.path || session.currentFile || 'index.html').replace(/[^a-zA-Z0-9._/-]/g, '_').slice(0, 120);
            const s = Number(a.startLine) || 0, e = Number(a.endLine) || 0;
            const full = session.files[p] ?? null;
            if (full && s > 0 && e >= s) {
                const arr = String(full).split('\n');
                const ss = Math.max(1, s), ee = Math.min(arr.length, e);
                return {
                    ok: true, result: `[FILE ${p} lines ${ss}-${ee}/${arr.length}]\n${arr.slice(ss - 1, ee).map((line, i) => `${ss + i}: ${line}`).join('\n')}`, error: null
                };
            }
            return { ok: true, result: full, error: null };
        }
        if (call.name === 'find_text') {
            const p = String(a.path || session.currentFile || 'index.html').replace(/[^a-zA-Z0-9._/-]/g, '_').slice(0, 120);
            const content = session.files[p] ?? null;
            if (content === null)
                return { ok: false, result: null, error: 'file not found: ' + p };
            const pattern = String(a.pattern || '');
            if (!pattern)
                return { ok: false, result: null, error: 'pattern required' };
            const cap = Math.max(1, Math.min(100, Number(a.maxResults) || 20));
            const text = String(content), lines = text.split('\n'), found = [];
            let regex = null;
            try {
                regex = new RegExp(pattern, 'gm');
            }
            catch (_) {
                regex = null;
            }
            if (regex) {
                let m;
                while ((m = regex.exec(text)) !== null && found.length < cap) {
                    const lineNum = offsetToLine(text, m.index);
                    found.push({ line: lineNum, text: lines[lineNum - 1].slice(0, 160) });
                    if (m.index === regex.lastIndex)
                        regex.lastIndex++;
                }
            }
            else {
                let idx = 0;
                while ((idx = text.indexOf(pattern, idx)) !== -1 && found.length < cap) {
                    const lineNum = offsetToLine(text, idx);
                    found.push({ line: lineNum, text: lines[lineNum - 1].slice(0, 160) });
                    idx += pattern.length;
                }
            }
            if (!found.length)
                return { ok: true, result: `0 matches for "${pattern}"`, error: null };
            const summary = found.map(f => `L${f.line}: ${f.text}`).join('\n');
            if (found.length === 1)
                return {
                    ok: true, result: `1 unique match at L${found[0].line}:\n${summary}\n\n(anchor ปลอดภัย — ใช้ <<REPLACE>> ได้เลย)`, error: null
                };
            return {
                ok: true, result: `${found.length} matches:\n${summary}\n\n(anchor ซ้ำ — ใช้ ||N หรือ refine pattern)`, error: null
            };
        }
        if (call.name === 'list_files')
            return { ok: true, result: Object.keys(session.files), error: null };
        if (call.name === 'list_functions') {
            const p = String(a.path || session.currentFile || 'index.html').replace(/[^a-zA-Z0-9._/-]/g, '_').slice(0, 120);
            const content = session.files[p];
            if (content === undefined)
                return { ok: false, result: null, error: 'file not found: ' + p };
            const syms = scanTopLevelSymbols(content);
            if (!syms.length)
                return { ok: true, result: '(no top-level functions/classes found)', error: null };
            const counts = {};
            syms.forEach(s => {
                counts[s.name] = (counts[s.name] || 0) + 1;
            });
            const lines = syms.map(s => `L${s.line} ${s.kind} ${s.name}${s.size ? ` (${s.size} chars)` : ''}${counts[s.name] > 1 ? ' DUPLICATE' : ''}`);
            return { ok: true, result: lines.join('\n'), error: null };
        }
        if (call.name === 'get_diagnostics') {
            const p = String(a.path || session.currentFile || 'index.html').replace(/[^a-zA-Z0-9._/-]/g, '_').slice(0, 120);
            const content = session.files[p];
            if (content === undefined)
                return { ok: false, result: null, error: 'file not found: ' + p };
            const v = validateCode(content, p);
            const scriptBlocks = (content.match(/<script(?![^>]*\bsrc=)[^>]*>/gi) || []).length;
            const styleBlocks = (content.match(/<style[^>]*>/gi) || []).length;
            const syms = scanTopLevelSymbols(content);
            const counts = {};
            syms.forEach(s => {
                counts[s.name] = (counts[s.name] || 0) + 1;
            });
            const dups = Object.keys(counts).filter(k => counts[k] > 1);
            const report = [
                `size: ${content.length} chars, ${content.split('\n').length} lines`, `validateCode: ${v.ok ? 'PASS' : 'FAIL — ' + v.reason}`, `inline <script> blocks: ${scriptBlocks}`, `<style> blocks: ${styleBlocks}`, `top-level symbols: ${syms.length}`, dups.length ? `DUPLICATE names: ${dups.join(', ')}` : 'no duplicate names'
            ];
            return { ok: true, result: report.join('\n'), error: null };
        }
        if (call.name === 'update_memory') {
            const value = String(a.value || '');
            const priority = Math.max(1, Math.min(10, Number(a.priority) || 5));
            const tags = Array.isArray(a.tags) ? a.tags : extractTags(`${a.key || ''} ${value}`);
            session.memory.facts.push({
                id: `fact-${Date.now()}`, key: String(a.key || ''), value, priority, tags, embedding: embedText(`${a.key || ''} ${value}`), createdAt: Date.now(), updatedAt: Date.now()
            });
            if (session.memory.facts.length > 50)
                session.memory.facts = session.memory.facts.slice(-50);
            addMemoryEvent(`memory: ${a.key}`, tags, 3);
            renderMemoryDrawer();
            return { ok: true, result: true, error: null };
        }
        if (call.name === 'stream_append') {
            const path = String(a.path || session.currentFile || 'index.html').replace(/[^a-zA-Z0-9._/-]/g, '_').slice(0, 120);
            let chunk = String(a.chunk || '');
            if (!path || !chunk || session.files[path] === undefined)
                return { ok: false, result: null, error: 'file/chunk required' };
            const before = session.files[path];
            const editLinesMarker = chunk.match(/<<EDIT-LINES:(\d+)-(\d+)\|\|([\s\S]*)>>/);
            const deleteLinesMarker = chunk.match(/<<DELETE-LINES:(\d+)-(\d+)>>/);
            const insertAfterMarker = parseDualMarker(chunk, 'INSERT-AFTER');
            const insertBeforeMarker = parseDualMarker(chunk, 'INSERT-BEFORE');
            const replaceMarker = parseDualMarker(chunk, 'REPLACE');
            const deleteMarker = parseSingleMarker(chunk, 'DELETE');
            const markerMatch = editLinesMarker || deleteLinesMarker || insertAfterMarker || insertBeforeMarker || replaceMarker || deleteMarker;
            if (/<<(?:EDIT-LINES|DELETE-LINES|INSERT-AFTER|INSERT-BEFORE|REPLACE|DELETE):/.test(chunk) && !markerMatch)
                return { ok: false, result: null, error: 'malformed edit marker' };
            if (markerMatch) {
                const reqIntent = session.memory.lastIntent || detectIntent(session.memory.lastQuery || '', before).intent;
                if (reqIntent === 'EXPLAIN' || reqIntent === 'CHAT')
                    return { ok: false, result: null, error: 'edit markers not allowed for CHAT/EXPLAIN intent' };
                let next = before, changed = false;
                if (editLinesMarker || deleteLinesMarker) {
                    const m = editLinesMarker || deleteLinesMarker;
                    const start = Number(m[1]), end = Number(m[2]);
                    const lines = before.split('\n');
                    if (start < 1 || end < 1 || start > lines.length || end > lines.length || start > end)
                        return { ok: false, result: null, error: 'EDIT-LINES range invalid' };
                    if (editLinesMarker)
                        lines.splice(start - 1, end - start + 1, editLinesMarker[3]);
                    else
                        lines.splice(start - 1, end - start + 1);
                    next = lines.join('\n');
                    changed = next !== before;
                }
                else if (insertAfterMarker || insertBeforeMarker) {
                    const m = insertAfterMarker || insertBeforeMarker;
                    const anchor = m[1], content = m[2], occIdx = m[3] ? Number(m[3]) : 0;
                    const kind = insertAfterMarker ? 'INSERT-AFTER' : 'INSERT-BEFORE';
                    if (!anchor)
                        return { ok: false, result: null, error: kind + ' anchor empty' };
                    const positions = countOccurrences(before, anchor);
                    if (!positions.length)
                        return { ok: false, result: null, error: kind + ' anchor not found' };
                    if (positions.length > 1 && !occIdx)
                        return { ok: false, result: null, error: `${kind} anchor has ${positions.length} occurrences. Use ||N.` };
                    if (occIdx && (occIdx < 1 || occIdx > positions.length))
                        return { ok: false, result: null, error: `${kind} occ out of range` };
                    const at = occIdx ? positions[occIdx - 1] : positions[0];
                    const pos = at + (insertAfterMarker ? anchor.length : 0);
                    next = before.slice(0, pos) + content + before.slice(pos);
                    changed = next !== before;
                }
                else if (replaceMarker) {
                    const find = replaceMarker[1], replacement = replaceMarker[2], occIdx = replaceMarker[3] ? Number(replaceMarker[3]) : 0;
                    if (!find)
                        return { ok: false, result: null, error: 'REPLACE find empty' };
                    const positions = countOccurrences(before, find);
                    if (!positions.length)
                        return { ok: false, result: null, error: 'REPLACE target not found' };
                    if (positions.length > 1 && !occIdx)
                        return { ok: false, result: null, error: `REPLACE "${find.slice(0, 40)}" has ${positions.length} occurrences. Use ||N.` };
                    if (occIdx && (occIdx < 1 || occIdx > positions.length))
                        return { ok: false, result: null, error: `REPLACE occ out of range` };
                    const at = occIdx ? positions[occIdx - 1] : positions[0];
                    next = before.slice(0, at) + replacement + before.slice(at + find.length);
                    changed = true;
                }
                else {
                    const rule = deleteMarker[1], occIdx = deleteMarker[2] ? Number(deleteMarker[2]) : 0;
                    if (!rule)
                        return { ok: false, result: null, error: 'DELETE pattern empty' };
                    let pattern = null;
                    try {
                        pattern = new RegExp(rule, 'gm');
                    }
                    catch (_) {
                        pattern = null;
                    }
                    if (pattern) {
                        const allMatches = [...before.matchAll(pattern)];
                        if (!allMatches.length)
                            return { ok: false, result: null, error: 'DELETE target not found' };
                        if (allMatches.length > 1 && !occIdx)
                            return { ok: false, result: null, error: `DELETE matched ${allMatches.length}. Use ||N.` };
                        if (occIdx && (occIdx < 1 || occIdx > allMatches.length))
                            return { ok: false, result: null, error: `DELETE occ out of range` };
                        const target = allMatches[(occIdx || 1) - 1];
                        next = before.slice(0, target.index) + before.slice(target.index + target[0].length);
                        changed = next !== before;
                    }
                    else {
                        const positions = countOccurrences(before, rule);
                        if (!positions.length)
                            return { ok: false, result: null, error: 'DELETE literal not found' };
                        if (positions.length > 1 && !occIdx)
                            return { ok: false, result: null, error: `DELETE "${rule.slice(0, 40)}" has ${positions.length}. Use ||N.` };
                        if (occIdx && (occIdx < 1 || occIdx > positions.length))
                            return { ok: false, result: null, error: `DELETE occ out of range` };
                        const at = occIdx ? positions[occIdx - 1] : positions[0];
                        next = before.slice(0, at) + before.slice(at + rule.length);
                        changed = next !== before;
                    }
                }
                if (!changed)
                    return { ok: false, result: null, error: 'edit made no changes' };
                const removedRatio = Math.max(0, (before.length - next.length) / Math.max(1, before.length));
                const intentional = /(ลบ|เอาออก|ตัด|remove|delete|drop|hide|rewrite|rebuild|ทำใหม่|รื้อ)/i.test(session.memory.lastQuery || '');
                if (removedRatio > 0.5 && !intentional)
                    return { ok: false, result: null, error: 'edit removes over half the file' };
                const mv = validateCode(next, path);
                if (!mv.ok)
                    return { ok: false, result: null, error: 'validation failed: ' + mv.reason, validation: true };
                const hyM = checkHygieneGate(next);
                if (!hyM.passed && next.length > 500)
                    return {
                        ok: false, result: null, error: 'hygiene: ' + hyM.reason, retry_hint: 'rewrite edit per hygiene rules', validation: true
                    };
                pushUndoSnapshot(path);
                recordDiff(path, 'marker', before, next, computeDiffSnippet(before, next));
                session.files[path] = next;
                session.currentFile = path;
                renderFilesList();
                renderPreview();
                updateBudgetUI();
                renderMemoryDrawer();
                const delta = next.length - before.length;
                recordMemoryEvent(`marker [${path}] ${delta >= 0 ? '+' : ''}${delta}`, ['marker'], 4);
                _broadcast('file-update', { path, content: session.files[path] });
                persistSession();
                return { ok: true, result: path, error: null, marker: true, delta, size: next.length };
            }
            const hygiene = checkHygieneGate(before + chunk);
            if (!hygiene.passed && chunk.length > 500)
                return {
                    ok: false, result: null, error: 'hygiene: ' + hygiene.reason, retry_hint: 'rewrite chunk per hygiene rules', validation: true
                };
            session.files[path] = appendChunkSmart(session.files[path], chunk);
            const av = validateCode(session.files[path], path);
            if (!av.ok) {
                session.files[path] = before;
                return { ok: false, result: null, error: 'validation failed: ' + av.reason, validation: true };
            }
            const appended = session.files[path];
            session.files[path] = before;
            pushUndoSnapshot(path);
            session.files[path] = appended;
            recordDiff(path, 'append', before, appended, computeDiffSnippet(before, appended));
            session.currentFile = path;
            renderFilesList();
            renderPreview();
            updateBudgetUI();
            recordMemoryEvent(`append [${path}] +${chunk.length}`, ['append'], 3);
            if (session.ambitionDeclared && session.ambitionTarget > 0) {
                const curSize = session.files[path].length;
                const thisMark = Math.floor(curSize / 10000) * 10000;
                if (thisMark > (session._lastMilestone || 0)) {
                    session._lastMilestone = thisMark;
                    recordMemoryEvent(`milestone: ${curSize}/${session.ambitionTarget} (${Math.round(curSize / session.ambitionTarget * 100)}%)`, ['milestone'], 3);
                }
            }
            _broadcast('file-update', { path, content: session.files[path] });
            persistSession();
            return { ok: true, result: path, error: null };
        }
        if (call.name === 'ask_user') {
            const question = String(a.question || 'ขอรายละเอียดเพิ่มเติม');
            orchestratorState.pendingQuestion = question;
            session.messages.push({ sender: 'nino', phase: session.phase, action: 'ask', reply: question, reasoning: 'รอคำตอบ' });
            renderMessages();
            return { ok: true, result: 'paused', error: null, pause: true };
        }
        if (call.name === 'web_fetch') {
            const url = String(a.url || '');
            if (!/^https?:\/\//i.test(url))
                return { ok: false, result: null, error: 'invalid url' };
            try {
                const res = await _fetchWithTimeout(url, { method: 'GET' });
                const raw = await res.text();
                const stripped = raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
                recordMemoryEvent('web_fetch [' + url + '] ' + stripped.length + ' chars', ['web'], 3);
                return { ok: true, result: stripped || '(empty)', error: null };
            }
            catch (err) {
                return { ok: false, result: null, error: 'fetch failed: ' + String(err && err.message || err) };
            }
        }
        if (call.name === 'run_js') {
            const code = String(a.code || '');
            if (!code)
                return { ok: false, result: null, error: 'code empty' };
            const logs = [];
            const fakeConsole = {
                log: (...x) => logs.push(x.map(String).join(' ')), error: (...x) => logs.push('ERR:' + x.map(String).join(' ')), warn: (...x) => logs.push('WARN:' + x.map(String).join(' '))
            };
            try {
                const fn = new Function('console', code);
                const ret = fn(fakeConsole);
                logs.push('RETURN:' + String(ret));
                recordMemoryEvent('run_js ' + code.length + ' chars', ['runjs'], 2);
                return { ok: true, result: logs.join('\n').slice(0, 2000), error: null };
            }
            catch (err) {
                return { ok: false, result: null, error: 'run_js error: ' + String(err && err.message || err) };
            }
        }
        if (call.name === 'self_diagnose') {
            const r = await selfDiagnose();
            return { ok: true, result: JSON.stringify(r), error: null };
        }
        if (call.name === 'tool_recover') {
            const r = toolAutoRecover({ name: a.name || '', args: a.args || {} }, { ok: false, error: a.error || '' });
            return { ok: true, result: JSON.stringify(r), error: null };
        }
        if (call.name === 'self_test') {
            const r = await selfDiagnose();
            const boot = {
                gh: typeof window.ninoGH !== 'undefined', upgrade: typeof window.ninoSelfUpgrade !== 'undefined', sw: typeof navigator !== 'undefined' && !!navigator.serviceWorker
            };
            return { ok: true, result: JSON.stringify({ diagnosis: r, boot }), error: null };
        }
        if (call.name === 'self_upgrade') {
            if (window.ninoGH && window.ninoGH.configured())
                return {
                    ok: false, result: null, error: 'ปิด self_upgrade แล้ว (เขียนทับทั้งไฟล์เสี่ยงพังทั้งแอป) — ใช้ gh_edit แล้ว gh_commit'
                };
            if (!window.ninoSelfUpgrade)
                return { ok: false, result: null, error: 'ninoSelfUpgrade not loaded' };
            var results = await window.ninoSelfUpgrade.applyUpgrade({ files: call.args.files || {}, note: call.args.note || 'NINO self-upgrade' });
            return { ok: true, result: JSON.stringify(results), error: null };
        }
        return { ok: false, result: null, error: 'unknown tool' };
    }
    catch (err) {
        return { ok: false, result: null, error: String(err) };
    }
}

function checkQualityGate(html) {
    html = html || '';
    const checks = {
        size: html.length >= 100, tags: /<!DOCTYPE/i.test(html) && /<html/i.test(html) && /<body/i.test(html) && /<\/html>/i.test(html), script: /<script/i.test(html) && /(requestAnimationFrame|setInterval|addEventListener|onclick)/i.test(html), interactive: (html.match(/<button|<input|<select|<canvas|addEventListener\s*\(\s*['"]click/gi) || []).length >= 3
    };
    const passed = Object.values(checks).every(Boolean);
    const failed = Object.entries(checks).filter(([_, v]) => !v).map(([k]) => k);
    const hasContainer = /<canvas|<div[^>]+id=["'](app|game|container|main|board|root)/i.test(html);
    return { passed, failed, size: html.length, hasContainer };
}

const RUNTIME_JS_PATH = /^(app\.js|js\/[\w.-]+\.js)$/;
const CRITICAL_FNS = ['orchestratorRun', 'detectIntent', 'buildSystemPrompt', 'checkQualityGate', 'dispatchTool', 'runRoleplayTurn'];

async function selfDiagnose() {
    const results = [];
    const gh = window.ninoGH;
    if (!gh || !gh.configured()) {
        results.push({ level: 'ok', msg: 'ยังไม่ได้ตั้งค่า GitHub — ไม่มีไฟล์รีโปให้ตรวจ' });
        return { ok: true, results, timestamp: Date.now() };
    }
    const staged = gh.stagedList();
    if (!staged.length)
        results.push({ level: 'ok', msg: 'ไม่มีไฟล์ staged' });
    for (const p of staged) {
        const t = await gh.readText(p);
        if (t === null) {
            results.push({ level: 'ok', msg: p + ': ถูกลบ' });
            continue;
        }
        const e = gh.check(p, t);
        results.push({ level: e ? 'error' : 'ok', msg: p + ': ' + (e ? 'ไวยากรณ์ผิด ' + e : 'ไวยากรณ์ผ่าน') });
    }
    if (staged.some(p => RUNTIME_JS_PATH.test(p))) {
        const files = gh.paths().filter(p => RUNTIME_JS_PATH.test(p));
        const seen = {};
        const dupes = [];
        for (const p of files) {
            const t = await gh.readText(p);
            if (t === null)
                continue;
            for (const m of t.matchAll(/^(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
                if (seen[m[1]] && seen[m[1]] !== p)
                    dupes.push(m[1] + ' (' + seen[m[1]] + ' + ' + p + ')');
                seen[m[1]] = seen[m[1]] || p;
            }
        }
        results.push({ level: dupes.length ? 'error' : 'ok', msg: dupes.length ? 'ชื่อระดับบนสุดซ้ำข้ามไฟล์: ' + dupes.join(', ') : 'ไม่มีชื่อซ้ำข้ามไฟล์ (' + Object.keys(seen).length + ' ชื่อ ใน ' + files.length + ' ไฟล์)' });
        const missing = CRITICAL_FNS.filter(f => !seen[f]);
        results.push({ level: missing.length ? 'error' : 'ok', msg: missing.length ? 'ฟังก์ชันหลักหาย: ' + missing.join(', ') : 'ฟังก์ชันหลักครบ' });
    }
    return { ok: results.every(r => r.level !== 'error'), results, timestamp: Date.now() };
}

function toolAutoRecover(call, result) {
    if (!result || result.ok)
        return null;
    const err = String(result.error || '');
    const name = String(call.name || '');
    if (name.indexOf('gh_') === 0) {
        if (/line.*out of range|line number/i.test(err))
            return {
                action: 'retry', hint: 'Line numbers shifted. Re-read target range with gh_read, then retry gh_edit with corrected line numbers.', retry: true
            };
        if (/not found|no such file/i.test(err))
            return { action: 'locate', hint: 'Path not found. Use gh_tree to list files, then retry with correct path.', retry: true };
        if (/rev mismatch|conflict/i.test(err))
            return { action: 'rebase', hint: 'Rev conflict. Re-read file for current rev, then retry.', retry: true };
        if (/rate.?limit|429|too many/i.test(err))
            return { action: 'wait', hint: 'Rate limited (429). Wait ~5s then retry the same call.', retry: true };
        if (/network|fetch failed|timeout|aborted|ECONNRESET|socket/i.test(err))
            return { action: 'retry', hint: 'Network error. Retry once. If fails again, report to user.', retry: true };
    }
    if (name === 'write_file' && result.blocked)
        return { action: 'redirect', hint: result.redirect || 'Use stream_append markers', retry: false };
    if (name === 'replace_function' && /not found/i.test(err))
        return { action: 'locate', hint: 'Function not found. Use list_functions to verify exact name, then retry.', retry: true };
    if (/context.*too long|token.*limit|exceed.*context|prompt.*too/i.test(err))
        return { action: 'compress', hint: 'Context overflow. Trim old history or split task into smaller steps.', retry: false };
    if (/invalid.*key|authentication|401|403|unauthorized/i.test(err))
        return { action: 'stop', hint: 'Auth error (401/403). Check API key in settings. Do not retry.', retry: false };
    if (/parse.*json|JSON\.parse|Unexpected token/i.test(err))
        return {
            action: 'retry', hint: 'JSON parse error. Ensure output is valid JSON. Retry once with cleaner formatting.', retry: true
        };
    return { action: 'stop', hint: 'No auto-recovery: ' + err.slice(0, 200), retry: false };
}

async function orchestratorRun(userText) {
    let ghTurn = !!(window.ninoGH && window.ninoGH.wantsGH(userText));
    if (window.ninoGH) {
        window.ninoGH.resetTurn();
        window.ninoGH.setActive(ghTurn);
        if (ghTurn)
            await window.ninoGH.ensureTree();
    }
    if (window.ninoAgent) {
        if (!_nestedRp)
            window.ninoAgent.begin('code');
        if (!/^(ต่อ|ทำต่อ|continue|)/i.test(String(userText).trim()))
            window.ninoAgent.journal.setTask(String(userText));
        if (window.ninoGH && window.ninoGH.configured()) {
            try {
                if (window.ninoAgent.skill.size() === 0) {
                    const _sk = await window.ninoGH.readText('Skill.md');
                    if (_sk)
                        window.ninoAgent.skill.set(_sk);
                }
                else if (typeof window.ninoSkillRefresh === 'function')
                    await window.ninoSkillRefresh();
            }
            catch (_) { }
        }
    }
    orchestratorState.step = 0;
    orchestratorState.history = [];
    orchestratorState.done = false;
    orchestratorState.planOnlyCount = 0;
    orchestratorState.validationRetries = 0;
    orchestratorState.hardBlockCount = 0;
    orchestratorState.llmCallCount = 0;
    orchestratorState.gateRetries = 0;
    orchestratorState.noopCount = 0;
    orchestratorState.phase = 'PLAN';
    const LLM_CALL_CAP = 999999;
    const history = orchestratorState.history;
    let output = { reply: '', action: 'explain', filename: '', code: '', reasoning: '', done: false };
    for (let step = 1; step <= ORCH_MAX_STEPS; step++) {
        if (_activeStreamController && _activeStreamController.signal.aborted) {
            output = { reply: 'ยกเลิกแล้ว', action: 'ask', done: true, reasoning: 'aborted' };
            break;
        }
        orchestratorState.step = step;
        if (history.length > 10) {
            const _old = history.splice(0, history.length - 10);
            history.unshift({
                role: 'system', content: '[COMPRESSED ' + _old.length + ' steps: ' + _old.map(h => (h.role || '?') + '→' + String(h.content || '').slice(0, 60)).join(' | ') + ' ]'
            });
        }
        const preFlight = detectIntent(userText, session.files[session.currentFile] || session.files['index.html'] || '');
        session.memory.lastIntent = preFlight.intent;
        const curDoc = session.files[session.currentFile] || session.files['index.html'] || '';
        if (preFlight.intent === 'CHAT' && step === 1 && !String(userText).includes('[ANSWER]')) {
            const _greeted = session.messages.some(m => m.sender === 'nino' && m.reasoning === 'greeting');
            const greetingReply = _greeted ? 'ค่ะ มีอะไรให้ช่วยต่อไหมคะ' : (currentCharacter.greeting || `สวัสดีค่ะ ฉันคือ ${currentCharacter.name || 'NINO'} — พร้อมช่วยเขียนโค้ดเสมอ บอกได้เลยว่าอยากสร้างอะไร`);
            return {
                reply: greetingReply, action: 'ask', thinking: `TIER: N/A | SIZE: ${curDoc.length} chars | STRATEGY: chat`, checklist: [], tool_call: null, final: '', done: true, reasoning: _greeted ? 'chat reply' : 'greeting'
            };
        }
        const qg = checkQualityGate(curDoc);
        const mem = retrieveContext(userText);
        const editIntent = /delete|remove|drop|hide|rewrite|rebuild|redo|fix|edit|change|tweak|update|modify|explain|why|how|review|ลบ|เอาออก|ตัด|ซ่อน|ทำใหม่|รื้อ|เขียนใหม่|แก้|ปรับ|เปลี่ยน|เพิ่ม|อธิบาย|ทำไม|ดู/i.test(userText) || ghTurn;
        const explainIntent = /explain|why|how|อธิบาย|ทำไม/i.test(userText);
        let hint = '';
        if (curDoc.length > 0 && editIntent && !ghTurn)
            hint = explainIntent ? '\nINTENT: EXPLAIN. No file changes.' : '\nINTENT: Existing-file. Prefer markers for <500 char edits. Report delta in reply.';
        else if (curDoc.length > 0 && session.ambitionDeclared && curDoc.length < session.ambitionTarget)
            hint = `\nAPPEND: ${curDoc.length}/${session.ambitionTarget} (need +${session.ambitionTarget - curDoc.length}). Use stream_append. Checkpoint every 10k chars.`;
        const context = `${userText}

[INTENT: ${preFlight.intent}]
[FILE: ${session.currentFile} (${curDoc.length} chars), QG: ${qg.passed ? 'PASS' : 'MISSING ' + qg.failed.join(',')}]${hint}

[FACTS]
${mem.facts.map(f => f.key + ': ' + f.value).join('\n') || '(none)'}
[RECENT]
${mem.events.map(e => e.desc).join('\n') || '(none)'}
${window.ninoAgent ? window.ninoAgent.statusLine() : ''}
[HISTORY]
${formatAgentHistory(history)}`;
        let payload;
        let retry = 0;
        const signal = _activeStreamController ? _activeStreamController.signal : null;
        const genIdx = session.messages.length;
        session.messages.push({ sender: 'nino', phase: session.phase, action: 'explain', reply: '', thinking: '', reasoning: '', streaming: true });
        renderMessages();
        _streamBotIdx = genIdx;
        while (retry <= ORCH_MAX_RETRIES) {
            var _g = window.ninoAgent ? window.ninoAgent.guard() : { phase: 'idle', hardStop: false };
            if (_g.hardStop) {
                payload = landPayload(_g);
                break;
            }
            if (orchestratorState.llmCallCount >= (LLM_CALL_CAP)) {
                payload = {
                    reply: `ถึงขีดจำกัด ${LLM_CALL_CAP} LLM calls ในเทิร์นนี้ — หยุดเพื่อประหยัด token`, action: 'ask', thinking: '', checklist: [], tool_call: null, final: '', done: true
                };
                break;
            }
            orchestratorState.llmCallCount++;
            try {
                payload = await callNinoLLM(context, { signal });
                break;
            }
            catch (err) {
                if (err.name === 'AbortError' || (signal && signal.aborted)) {
                    payload = { reply: 'ยกเลิกแล้ว', action: 'ask', thinking: '', checklist: [], tool_call: null, final: '', done: true };
                    break;
                }
                retry++;
                recordMemoryEvent(`orch: retry ${retry} — ${String(err.message).slice(0, 80)}`, ['error'], 2);
                if (retry > ORCH_MAX_RETRIES)
                    payload = {
                        reply: 'LLM ล้มเหลว: ' + String(err.message).slice(0, 200), action: 'ask', thinking: '', checklist: [], tool_call: null, final: '', done: true
                    };
                else
                    await waitMs(ORCH_BACKOFF[Math.min(retry - 1, ORCH_BACKOFF.length - 1)]);
            }
        }
        _streamBotIdx = -1;
        if (session.messages[genIdx])
            session.messages.splice(genIdx, 1);
        if (_activeStreamController && _activeStreamController.signal.aborted) {
            output = { reply: 'ยกเลิกแล้ว', action: 'ask', done: true, reasoning: 'aborted' };
            break;
        }
        if (payload.sensoryCue)
            updateSensoryBanner(payload.sensoryCue);
        else
            requestSensoryCueFallback('code', userText);
        if (payload.thinking)
            session.messages.push({ sender: 'nino', phase: session.phase, action: 'explain', reply: '', thinking: payload.thinking, reasoning: 'Thinking' });
        if (!session.ambitionDeclared && payload.thinking) {
            const text = String(payload.thinking);
            const deltaMatch = text.match(/TARGET_DELTA[:\s]+\+?(\d{2,6})/i);
            const sizeMatch = text.match(/TARGET_SIZE[:\s]+(\d{3,6})/i) || text.match(/(\d{3,6})\s*(chars|ตัวอักษร)/i);
            const curLen = curDoc.length;
            if (deltaMatch) {
                const d = parseInt(deltaMatch[1], 10);
                if (d >= 200 && d <= 100000) {
                    session.ambitionTarget = curLen + d;
                    session.ambitionDeclared = true;
                    session._lastMilestone = Math.floor(curLen / 10000) * 10000;
                }
            }
            else if (sizeMatch) {
                const n = parseInt(sizeMatch[1], 10);
                if (n >= 3000 && n <= 500000) {
                    session.ambitionTarget = n;
                    session.ambitionDeclared = true;
                    session._lastMilestone = 0;
                }
            }
        }
        output = {
            reply: payload.reply || '', action: payload.action, filename: payload.filename || '', code: payload.code || '', reasoning: payload.reasoning || payload.thinking || '', editPlan: payload.editPlan || '', done: !!payload.done
        };
        if (Array.isArray(payload.checklist) && payload.checklist.length) {
            const incoming = payload.checklist.map(x => ({
                id: String(x.id || Math.random()), task: String(x.task || ''), tool: String(x.tool || 'write_file'), status: ['pending', 'in_progress', 'done', 'failed'].includes(x.status) ? x.status : 'pending'
            }));
            session.checklist = incoming.map(x => {
                const existing = session.checklist.find(y => String(y.id) === x.id);
                return existing && existing.status === 'done' ? existing : x;
            });
            renderChecklist();
        }
        const call = payload.tool_call;
        if (call && String(call.name || '').indexOf('gh_') === 0 && window.ninoGH) {
            ghTurn = true;
            window.ninoGH.setActive(true);
        }
        if (call) {
            orchestratorState.phase = 'BUILD';
            updatePhaseUI('BUILD · ' + call.name, null);
            recordMemoryEvent(`orch: step ${step} tool=${call.name}`, ['orch'], 2);
            const item = resolveChecklistTarget(call);
            if (item)
                updateChecklistItem(item.id, 'in_progress');
            const _t0 = Date.now();
            const result = await dispatchTool(call);
            if (window.ninoAgent)
                window.ninoAgent.noteTool(call.name, JSON.stringify(result && result.result != null ? result.result : '').length, Date.now() - _t0);
            if (item) {
                if (result.ok)
                    updateChecklistItem(item.id, 'done');
                else if (result.blocked && result.soft)
                    updateChecklistItem(item.id, 'pending');
                else
                    updateChecklistItem(item.id, 'failed');
            }
            if (result.ok && ['write_file', 'stream_append'].includes(call.name) && session.memory.lastIntent !== 'BUILD') {
                const checked = validateCode(session.files[session.currentFile] || '', session.currentFile);
                if (!checked.ok) {
                    const snap = session.history[session.history.length - 1];
                    if (snap && snap.file === session.currentFile)
                        session.files[session.currentFile] = snap.content;
                    session.history.pop();
                    history.push({
                        role: 'assistant', content: payload.thinking, toolResult: {
                            validation_error: checked.reason, retry_hint: 'Re-emit the SAME action with corrected content. Do not switch tool.'
                        }
                    });
                    orchestratorState.validationRetries = (orchestratorState.validationRetries || 0) + 1;
                    if (orchestratorState.validationRetries <= 6)
                        continue;
                    output = {
                        reply: 'โค้ดไม่ผ่านตรวจสอบหลังพยายามแก้ 30 ครั้ง: ' + checked.reason, action: 'explain', filename: session.currentFile, code: '', reasoning: checked.reason, done: true
                    };
                    break;
                }
            }
            if (result.validation && result.retry_hint) {
                history.push({ role: 'assistant', content: payload.thinking, toolResult: { validation_error: result.error, hint: result.retry_hint } });
                orchestratorState.validationRetries = (orchestratorState.validationRetries || 0) + 1;
                if (orchestratorState.validationRetries <= 6)
                    continue;
            }
            if (result.blocked || result.rejected) {
                if (result.hard) {
                    orchestratorState.hardBlockCount = (orchestratorState.hardBlockCount || 0) + 1;
                    if (orchestratorState.hardBlockCount >= 5) {
                        history.push({ role: 'assistant', content: payload.thinking, toolResult: result });
                        orchestratorState.done = true;
                        output = {
                            reply: `ไม่สามารถเขียนไฟล์ [${session.currentFile}] ซ้ำเกิน 10 ครั้งในรอบเดียว ลองพิมพ์บอก NINO ให้แก้ทีละจุด เช่น "เพิ่ม X ใน header" หรือ "ลบปุ่ม Y" ระบบจะใช้ marker แทนการเขียนทั้งไฟล์`, action: 'ask', filename: session.currentFile, code: '', reasoning: 'hard block x2', done: true
                        };
                        break;
                    }
                    history.push({
                        role: 'assistant', content: payload.thinking, toolResult: {
                            guard: 'hard_block', reason: result.error, instruction: 'write_file HARD LIMIT. You MUST pivot to stream_append NOW. Use exactly ONE marker: <<REPLACE:find||replacement>> or <<DELETE:text>>. DO NOT call write_file again.'
                        }
                    });
                    continue;
                }
                const curSize = (session.files[session.currentFile] || '').length;
                if (item)
                    updateChecklistItem(item.id, 'pending');
                history.push({
                    role: 'assistant', content: payload.thinking, toolResult: {
                        guard: 'soft_block', reason: result.error, instruction: `Guard soft_block: ${result.error}. EDIT intent: retry via stream_append with exactly one marker. Use <<REPLACE:old||new>> or <<DELETE:regex or text>>. Current file: ${curSize} chars. Report signed delta.`
                    }
                });
                if ((orchestratorState.softBlocks = (orchestratorState.softBlocks || 0) + 1) > 4) {
                    output = { reply: 'เครื่องมือเขียนไฟล์ถูกบล็อกซ้ำหลายครั้ง — ใช้ edit_batch แก้ทีละจุดแทน หรือบอกผมว่าจะแก้จุดไหน', action: 'ask', filename: session.currentFile, code: '', reasoning: 'soft block x4', done: true };
                    break;
                }
                continue;
            }
            if (result.pause) {
                history.push({ role: 'assistant', content: payload.thinking, toolResult: result });
                orchestratorState.pendingUserText = userText;
                output = {
                    reply: String(call.args?.question || 'รอคำตอบ'), action: 'ask', filename: '', code: '', reasoning: 'รอคำตอบ', done: false, paused: true
                };
                break;
            }
            history.push({ role: 'assistant', content: payload.thinking, call: { name: call.name, args: call.args }, toolResult: result });
            const cur = session.files[session.currentFile] || session.files['index.html'] || '';
            const qgNow = checkQualityGate(cur);
            const targetMet = session.ambitionDeclared && cur.length >= session.ambitionTarget;
            const nothingChanged = cur.length === session._lastSeenSize;
            const delta = cur.length - session._lastSeenSize;
            session._lastSeenSize = cur.length;
            if (result.ok && ['write_file', 'stream_append'].includes(call.name) && !editIntent && !payload.reply.match(/[+\-−]\d+\s*(chars|ตัวอักษร)/i)) {
                payload.reply = (payload.reply || '') + ` (${delta >= 0 ? '+' : ''}${delta} chars — รวม ${cur.length} chars)`;
            }
            orchestratorState.phase = 'VERIFY';
            if (qgNow.passed && targetMet && step >= 4 && !nothingChanged) {
                orchestratorState.phase = 'DONE';
                updatePhaseUI('DONE', 0.98);
                orchestratorState.done = true;
                output = {
                    reply: payload.final || `เสร็จสมบูรณ์ — ${cur.length} ตัวอักษร`, action: 'explain', filename: session.currentFile, code: '', reasoning: 'quality gate passed', done: true
                };
                break;
            }
            continue;
        }
        if (payload.final || payload.done) {
            const cur = session.files[session.currentFile] || session.files['index.html'] || '';
            const qgNow = checkQualityGate(cur);
            const _wsGate = !!(window.ninoWorkshop && window.ninoWorkshop.on()) || localStorage.getItem('nino.focus') === 'fs';
            const _selfStopNow = payload.stop === true || (window.ninoHud && window.ninoHud.stopped(String(payload.reply || '') + String(payload.final || '')));
            const targetNotMet = _wsGate && !editIntent && session.ambitionDeclared && cur.length < session.ambitionTarget;
            const noChangeYet = _wsGate && !editIntent && session._lastSeenSize === cur.length && step === 1;
            if (_wsGate && !_selfStopNow && !payload._land && ((!qgNow.passed && !editIntent) || targetNotMet || noChangeYet)) {
                orchestratorState.gateRetries = (orchestratorState.gateRetries || 0) + 1;
                if (orchestratorState.gateRetries <= 2) {
                    history.push({
                        role: 'assistant', content: payload.thinking || payload.reply, toolResult: {
                            phase: 'VERIFY_FAILED', gate: 'failed', missing: qgNow.failed, currentSize: cur.length, targetSize: session.ambitionTarget, instruction: 'ยังไม่ผ่าน VERIFY phase — แก้ไขต่อด้วย tool_call จนกว่าจะผ่านจริง ห้ามตอบ final/done ถ้ายังไม่ผ่าน'
                        }
                    });
                    continue;
                }
            }
            orchestratorState.done = true;
            output = {
                reply: payload.final || (qgNow.passed ? `เสร็จ — ${cur.length} ตัวอักษร` : payload.reply) || 'เสร็จแล้ว', action: payload.action || 'explain', filename: session.currentFile, code: '', reasoning: payload.reasoning || payload.thinking || '', done: true
            };
            break;
        }
        const curFile = session.files[session.currentFile] || session.files['index.html'] || '';
        const _wsGate2 = !!(window.ninoWorkshop && window.ninoWorkshop.on()) || localStorage.getItem('nino.focus') === 'fs';
        const _selfStop = payload.stop === true || (window.ninoHud && window.ninoHud.stopped(String(payload.reply || '') + String(payload.final || '')));
        const targetNotMet = _wsGate2 && !_selfStop && !editIntent && session.ambitionDeclared && curFile.length < session.ambitionTarget;
        if (targetNotMet && step < ORCH_MAX_STEPS) {
            const gap = session.ambitionTarget - curFile.length;
            history.push({
                role: 'assistant', content: payload.thinking, toolResult: {
                    warning: 'PLAN_ONLY', message: `Current: ${curFile.length} / Target: ${session.ambitionTarget} (need +${gap}). Emit tool_call.`
                }
            });
            orchestratorState.planOnlyCount++;
            if (orchestratorState.planOnlyCount >= 5) {
                history.push({ role: 'user', content: `STOP planning. Emit stream_append chunk now. Need +${gap}.`, toolResult: null });
                orchestratorState.planOnlyCount = 0;
            }
            continue;
        }
        const _noopIntent = preFlight.intent === 'CHAT' || preFlight.intent === 'EXPLAIN';
        const _pendingItems = Array.isArray(payload.checklist) && payload.checklist.some(c => c && c.status && c.status !== 'done' && c.status !== 'skipped');
        if (!_noopIntent && !_selfStop && (_wsGate2 || _pendingItems)) {
            orchestratorState.noopCount = (orchestratorState.noopCount || 0) + 1;
            if (orchestratorState.noopCount <= 3) {
                history.push({
                    role: 'assistant', content: payload.thinking || payload.reply, toolResult: {
                        phase: 'CONTINUE', instruction: 'ไม่มี tool_call และยังไม่ done — ภารกิจ ' + preFlight.intent + ' ยังไม่จบ ให้เรียก tool_call ต่อทันที หรือถ้างานเสร็จจริงให้ตอบ done:true พร้อม final สรุปผล ห้ามหยุดเฉยๆ'
                    }
                });
                continue;
            }
        }
        output = {
            reply: payload.final || payload.reply || 'ไม่มีผลลัพธ์', action: _selfStop ? 'explain' : 'ask', filename: '', code: '', reasoning: _selfStop ? 'self stop' : 'no actionable output', done: true
        };
        break;
    }
    if (orchestratorState.step >= ORCH_MAX_STEPS && !orchestratorState.done)
        output = { reply: 'ถึงขีดจำกัดขั้นตอน', action: 'explain', filename: '', code: '', reasoning: 'max steps', done: true };
    orchestratorState.paused = !!output.paused;
    if (window.ninoGH)
        window.ninoGH.setActive(false);
    if (ghTurn && !_nestedRp && window.ninoUpdate) {
        try {
            await window.ninoUpdate.offerCommit();
        }
        catch (_) { }
    }
    return output;
}

async function resumeOrchestrator(userReply) {
    const question = orchestratorState.pendingQuestion;
    orchestratorState.pendingQuestion = null;
    orchestratorState.paused = false;
    orchestratorState.history.push({ role: 'user', content: userReply, toolResult: { question } });
    return orchestratorRun(orchestratorState.pendingUserText + '\n\n[ANSWER]\n' + userReply);
}
