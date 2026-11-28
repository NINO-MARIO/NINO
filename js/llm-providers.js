'use strict';
const GEMINI_HOST = 'generativelanguage.googleapis.com';
const GEMINI_VERSIONS = ['v1beta', 'v1'];
const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }, { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' }, { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' }, { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
];
const GEMINI_FALLBACK = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-1.5-flash', 'gemini-1.5-pro'];
let _lastFinishReason = null;
const CHAIN_CONTINUE_MAX = 40;
const INTERRUPT_CONTINUE_MAX = 4;

function finishNeedsContinue(r) {
    return r === 'MAX_TOKENS' || r === 'INTERRUPTED';
}
// ไม่มีการแบนโมเดลถาวรแล้ว: ล้างค่าที่เคยบันทึกไว้ในเครื่องรุ่นเก่าครั้งเดียว
try {
    localStorage.removeItem('nino-invalid-models');
}
catch { }
// สถานะโมเดลอยู่ในหน่วยความจำของแท็บนี้เท่านั้น ไม่บันทึกลงเครื่อง และไม่มีการแบนถาวร
const OK_MODELS = new Map(); // โมเดลที่ผ่านการทดสอบหรือเคยตอบได้ล่าสุด: model -> เวลา
const BENCHED = new Set(); // โมเดลที่หมดโควตาหรือไม่พบแล้ว: ไม่เรียกจนกว่าการค้นหาโมเดลจะทดสอบผ่านอีกครั้ง
let _activeModel = null; // โมเดลที่ตอบได้ล่าสุดในแท็บนี้ ใช้เป็นตัวแรกของ pool
const MODEL_ERR = new Map(); // โมเดล -> ผลผิดพลาดล่าสุดจาก API (ใช้แสดงเหตุผลและวินิจฉัย)
const ERR_TH = { key: 'คีย์ไม่ถูกต้องหรือไม่มีสิทธิ์', quota: 'โควตาหมดหรือเรียกถี่เกินไป', notfound: 'ไม่พบโมเดลนี้หรือไม่รองรับ', busy: 'เซิร์ฟเวอร์ไม่ว่างชั่วคราว', badreq: 'คำขอไม่ถูกต้อง', network: 'เครือข่ายขัดข้องหรือหมดเวลา', empty: 'ตอบว่างหรือสตรีมขาด', other: 'ข้อผิดพลาดอื่น' };
function classifyErr(status, errStatus, msg) {
    const m = String(msg || ''), es = String(errStatus || '');
    if (status === 429 || es === 'RESOURCE_EXHAUSTED' || /quota|rate limit|too many requests/i.test(m)) return 'quota';
    if (status === 401 || status === 403 || es === 'PERMISSION_DENIED' || es === 'UNAUTHENTICATED' || /api key|api_key|permission denied|unauthenticated/i.test(m)) return 'key';
    if (status === 404 || es === 'NOT_FOUND' || /not found|not supported/i.test(m)) return 'notfound';
    if (status === 500 || status === 503 || status === 504 || es === 'UNAVAILABLE' || es === 'INTERNAL' || es === 'DEADLINE_EXCEEDED') return 'busy';
    if (status === 400 || es === 'INVALID_ARGUMENT') return 'badreq';
    if (!status && /abort|timeout|network|fetch|failed|load/i.test(m)) return 'network';
    return 'other';
}
function noteModelErr(model, status, errStatus, msg, forceCode) {
    if (!model) return;
    const code = forceCode || classifyErr(status, errStatus, msg);
    MODEL_ERR.set(model, { code, status: Number(status) || 0, errStatus: String(errStatus || ''), msg: String(msg || '').slice(0, 200), at: Date.now() });
    if (code === 'key') { OK_MODELS.clear(); saveModelState(); } // คีย์ที่ถูกปฏิเสธใช้กับทุกโมเดลไม่ได้ ผลตรวจ OK เดิมจึงไม่น่าเชื่อถืออีก
}
function diagnoseModels() {
    const cfg = getCfg();
    const now = Date.now();
    const rows = [...MODEL_ERR].filter(([, e]) => now - e.at < 10 * 60 * 1000).map(([model, e]) => ({ model, code: e.code, th: ERR_TH[e.code], status: e.status, errStatus: e.errStatus, msg: e.msg, at: e.at, benched: BENCHED.has(model) }));
    const counts = {};
    rows.forEach(r => { counts[r.code] = (counts[r.code] || 0) + 1; });
    const ok = [...OK_MODELS.keys()].filter(m => !BENCHED.has(m));
    let headline;
    if (!cfg.apiKey) headline = 'ยังไม่ได้ใส่คีย์ API';
    else if (ok.length) headline = 'มีโมเดลใช้ได้ ' + ok.length + ' ตัว';
    else if (counts.key) headline = 'คีย์ไม่ถูกต้องหรือไม่มีสิทธิ์ (ตรวจคีย์ในหน้าตั้งค่า)';
    else if (rows.length && rows.every(r => r.code === 'quota')) headline = 'โควตาหมดทุกโมเดลที่ทดสอบ';
    else if (rows.length) headline = 'ล้มเหลวหลายสาเหตุ ดูรายการด้านล่าง';
    else headline = 'ยังไม่มีผลการทดสอบ';
    return { headline, ok, benched: [...BENCHED], counts, rows, pool: getModelPool() };
}
function failReason() {
    const d = diagnoseModels();
    const latest = d.rows.slice().sort((a, b) => b.at - a.at)[0];
    if (!latest) return d.headline;
    return d.headline + ' · ล่าสุด: ' + latest.th + (latest.status ? ' (' + latest.status + ')' : '') + (latest.msg ? ' — ' + latest.msg.slice(0, 90) : '');
}
const STATE_KEY = 'nino-model-state-v2';
function loadModelState() {
    try {
        const st = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
        if (!st || typeof st !== 'object')
            return;
        Object.entries(st.ok || {}).forEach(([m, t]) => { if (m) OK_MODELS.set(m, Number(t) || 0); });
        Object.entries(st.red || {}).forEach(([m, e]) => { if (m && e) { BENCHED.add(m); MODEL_ERR.set(m, e); } });
    }
    catch (e) { /* ไม่มีผลค้างที่อ่านได้ เริ่มใหม่ */ }
}
function saveModelState() {
    try {
        const red = {};
        BENCHED.forEach(m => { red[m] = MODEL_ERR.get(m) || { code: 'other', status: 0, errStatus: '', msg: '', at: Date.now() }; });
        localStorage.setItem(STATE_KEY, JSON.stringify({ v: 2, ok: Object.fromEntries(OK_MODELS), red }));
    }
    catch (e) { /* เก็บไม่ได้ก็ยังทำงานต่อในหน่วยความจำ */ }
}
function markModelOk(m) { if (!m) return; OK_MODELS.set(m, Date.now()); BENCHED.delete(m); MODEL_ERR.delete(m); saveModelState(); }
function markModelFailed(m) { if (!m) return; OK_MODELS.delete(m); BENCHED.add(m); if (_activeModel === m) _activeModel = null; saveModelState(); }
const FETCH_TIMEOUT = 45000;

async function _fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs || FETCH_TIMEOUT);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    }
    finally {
        clearTimeout(timeoutId);
    }
}

async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let i = 0;
    async function run() {
        while (i < items.length) {
            const idx = i++;
            results[idx] = await worker(items[idx], idx);
        }
    }
    const runners = [];
    for (let k = 0; k < Math.min(limit, items.length); k++)
        runners.push(run());
    await Promise.all(runners);
    return results;
}

function getModelPool() {
    const cfg = getCfg();
    const pool = [];
    const add = m => {
        if (m && !BENCHED.has(m) && !pool.includes(m))
            pool.push(m);
    };
    add(cfg.preferredModel);
    add(_activeModel);
    add(cfg.model);
    [...OK_MODELS.keys()].forEach(add); // ทุกโมเดลที่ผ่านการค้นหาในรอบนี้ใช้ได้ทันที ไม่ต้องรอให้อยู่ในรายการที่บันทึก
    (cfg.modelList || []).forEach(add);
    GEMINI_FALLBACK.forEach(add);
    return pool;
}

const TEST_TIMEOUT = 9000;

async function _probeModelVersion(apiKey, model, ver) {
    try {
        const res = await _fetchWithTimeout(`https://${GEMINI_HOST}/${ver}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 1 } })
        }, TEST_TIMEOUT);
        if (!res.ok) {
            const ed = await res.json().catch(() => ({}));
            const msg = ed.error?.message || '';
            noteModelErr(model, res.status, ed.error?.status, msg);
            if (/not found|not supported|is not supported/i.test(msg))
                return { ok: false, invalid: true };
            if (res.status === 429 || ed.error?.status === 'RESOURCE_EXHAUSTED')
                return { ok: false, quota: true };
            if (MODEL_ERR.get(model)?.code === 'key')
                return { ok: false, key: true };
            return { ok: false };
        }
        const data = await res.json();
        if (data.candidates)
            return { ok: true, version: ver };
        noteModelErr(model, 0, '', 'ไม่มี candidates ในผลตอบ', 'empty');
        return { ok: false };
    }
    catch (e) {
        noteModelErr(model, 0, '', e && e.message || String(e));
        return { ok: false };
    }
}

// ทดสอบทีละเวอร์ชัน (ประหยัดโควตา): ลองเวอร์ชันถัดไปเฉพาะเมื่อผิดที่ความไม่รองรับของเวอร์ชันนั้น
// ถ้าโควตาหมดหรือคีย์ไม่ถูกต้อง ไม่ต้องลองต่อ เพราะจะได้ผลเดิม
async function testModel(apiKey, model) {
    if (OK_MODELS.has(model))
        return { ok: true, cached: true };
    let last = { ok: false };
    for (const ver of GEMINI_VERSIONS) {
        last = await _probeModelVersion(apiKey, model, ver);
        if (last.ok) {
            markModelOk(model);
            return last;
        }
        if (last.quota || last.key)
            break;
    }
    if (last.invalid || last.quota)
        markModelFailed(model);
    if (last.key) {
        OK_MODELS.clear();
        saveModelState();
    }
    return last.invalid || last.quota || last.key ? last : { ok: false };
}

async function testNinearm(cfg) {
    const pf = compatProfile(cfg);
    if (!pf.key)
        return { ok: false, error: 'ยังไม่ได้ใส่ API Key' };
    try {
        const res = await _fetchWithTimeout(`${pf.base}/chat/completions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + pf.key }, body: JSON.stringify({ model: pf.models[0], messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 })
        }, TEST_TIMEOUT);
        if (!res.ok) {
            const ed = await res.json().catch(() => ({}));
            return { ok: false, error: (ed.error && (ed.error.message || ed.error)) || ('HTTP ' + res.status) };
        }
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: String(e && e.message || e) };
    }
}

async function compatOnce(pf, model, o) {
    const body = { model, messages: o.messages, temperature: o.temp, stream: !!o.onChunk };
    if (o.jsonMode)
        body.response_format = { type: 'json_object' };
    let res;
    for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), Math.max(FETCH_TIMEOUT, 90000));
        if (o.signal) {
            if (o.signal.aborted)
                controller.abort();
            else
                o.signal.addEventListener('abort', () => controller.abort(), { once: true });
        }
        try {
            setStatus('busy', `${pf.label} (${model})`);
            res = await fetch(`${pf.base}/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + pf.key }, body: JSON.stringify(body), signal: controller.signal
            });
        }
        catch (e) {
            if (e.name === 'AbortError' && !(o.signal && o.signal.aborted))
                throw new Error(model + ': timeout');
            throw e;
        }
        finally {
            clearTimeout(timeoutId);
        }
        if (res.ok)
            break;
        const ed = await res.json().catch(() => ({}));
        const msg = (ed.error && (ed.error.message || ed.error)) || `${pf.label} HTTP ${res.status}`;
        if (attempt === 0 && body.response_format && res.status === 400 && /response_format|json/i.test(String(msg))) {
            delete body.response_format;
            continue;
        }
        _lastFinishReason = null;
        const e = new Error(`${model}: ${String(msg).slice(0, 160)}`);
        if (res.status === 401 || res.status === 403)
            e.noFallback = true;
        throw e;
    }
    if (!o.onChunk) {
        const data = await res.json();
        const ch = data.choices && data.choices[0];
        const text = (ch && ch.message && ch.message.content) || '';
        _lastFinishReason = ch && ch.finish_reason === 'length' ? 'MAX_TOKENS' : null;
        if (window.ninoPC && data.usage)
            window.ninoPC.usage(data.usage);
        if (o.onTokenUsage && data.usage && data.usage.completion_tokens != null)
            o.onTokenUsage(data.usage.completion_tokens, 65536);
        if (!text)
            throw new Error(model + ': empty response');
        setStatus('on', `พร้อม (${model})`);
        updateModelBadge(model);
        return cleanResponse(text);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', fullText = '', lastLen = 0, streamFinish = null, streamBlock = '', _lastChunkT = 0, streamErr = null;
    const handleLine = (line) => {
        if (!line.startsWith('data:'))
            return;
        const js = line.slice(5).trim();
        if (!js || js === '[DONE]')
            return;
        try {
            const d = JSON.parse(js);
            const c0 = d.choices && d.choices[0];
            const chunk = (c0 && c0.delta && c0.delta.content) || '';
            if (c0 && c0.finish_reason)
                streamFinish = c0.finish_reason;
            if (d.usage && window.ninoPC)
                window.ninoPC.usage(d.usage);
            if (d.usage && d.usage.completion_tokens != null && o.onTokenUsage)
                o.onTokenUsage(d.usage.completion_tokens, 65536);
            fullText += chunk;
            const cleaned = cleanResponse(fullText);
            if (cleaned.length > lastLen) {
                const _now = performance.now();
                if (_now - _lastChunkT > 80) {
                    o.onChunk(cleaned.slice(lastLen));
                    lastLen = cleaned.length;
                    _lastChunkT = _now;
                }
            }
        }
        catch (_) { }
    };
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            lines.forEach(handleLine);
        }
        if (buffer.trim())
            handleLine(buffer.trim());
    }
    catch (se) {
        if (se && se.name === 'AbortError')
            throw se;
        streamErr = se;
    }
    if (!fullText)
        throw streamErr || new Error(model + ': stream ended without content');
    {
        const _fin = cleanResponse(fullText);
        if (_fin.length > lastLen)
            o.onChunk(_fin.slice(lastLen));
    }
    _lastFinishReason = streamErr ? 'INTERRUPTED' : (streamFinish === 'length' ? 'MAX_TOKENS' : null);
    setStatus('on', `พร้อม (${model})`);
    updateModelBadge(model);
    return cleanResponse(fullText);
}

async function _imagesToCaptionText(messages, signal) {
    const out = [];
    for (const m of messages) {
        if (!Array.isArray(m.content)) {
            out.push(m);
            continue;
        }
        const text = m.content.filter(x => x.type === 'text').map(x => x.text).join('');
        const urls = m.content.filter(x => x.type === 'image_url').map(x => x.image_url && x.image_url.url).filter(Boolean);
        let addon = '';
        try {
            if (window.ninoImg && window.ninoImg.captionAddonFor)
                addon = await window.ninoImg.captionAddonFor(urls, signal);
        }
        catch (_) { }
        out.push({ role: m.role, content: text + (addon ? '\n\n' + addon : '\n\n[ผู้ใช้แนบรูปมา แต่โมเดลนี้อ่านรูปไม่ได้และไม่มีตาช่วย — บอกผู้ใช้ตรงๆ]') });
    }
    return out;
}

async function compatGenerate({ systemInstruction, contents, jsonMode = false, onChunk = null, onTokenUsage = null, signal = null, temperature = null }) {
    const cfg = getCfg();
    const pf = compatProfile(cfg);
    if (!pf.key)
        throw new Error('ยังไม่ได้ตั้งค่า ' + pf.label + ' API Key');
    let messages = [];
    let hasImg = false;
    if (systemInstruction)
        messages.push({ role: 'system', content: systemInstruction });
    for (const c of contents || []) {
        const ps = c.parts || [];
        const imgs = c.role === 'model' ? [] : ps.filter(p => p && p.inlineData && p.inlineData.data);
        const txt = ps.map(p => p.text || '').join('');
        if (imgs.length) {
            hasImg = true;
            const arr = [{ type: 'text', text: txt }];
            imgs.forEach(p => arr.push({ type: 'image_url', image_url: { url: 'data:' + (p.inlineData.mimeType || 'image/jpeg') + ';base64,' + p.inlineData.data } }));
            messages.push({ role: 'user', content: arr });
        }
        else
            messages.push({ role: c.role === 'model' ? 'assistant' : 'user', content: txt });
    }
    const temp = temperature != null ? temperature : pf.temp;
    let lastErr = null;
    for (const model of pf.models) {
        if (signal && signal.aborted)
            throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        for (let attempt = 0; attempt < 2; attempt++) {
            if (signal && signal.aborted)
                throw Object.assign(new Error('aborted'), { name: 'AbortError' });
            try {
                return await compatOnce(pf, model, { messages, temp, jsonMode, onChunk, onTokenUsage, signal });
            }
            catch (err) {
                if (signal && signal.aborted)
                    throw err;
                lastErr = err;
                if (hasImg && /image|vision|multimodal|multi-modal|content.*(type|array)|expected.*string|unsupported.*(input|modal)/i.test(String(err && err.message || ''))) {
                    hasImg = false;
                    try {
                        if (window.ninoImg && window.ninoImg.markNoVision)
                            window.ninoImg.markNoVision(model);
                    }
                    catch (_) { }
                    messages = await _imagesToCaptionText(messages, signal);
                    continue;
                }
                if (err.noFallback)
                    break;
                if (attempt === 0)
                    await new Promise(r => setTimeout(r, 2000));
            }
        }
    }
    setStatus('err', String(lastErr && lastErr.message || 'ล้มเหลว').slice(0, 80));
    throw lastErr || new Error(pf.label + ' ล้มเหลว');
}

async function healthCheck() {
    const cfg = getCfg();
    if (isCompat(cfg.provider)) {
        if (!providerHasKey(cfg))
            return false;
        const t = await testNinearm(cfg);
        if (t.ok) {
            updateModelBadge(activeModelName(cfg));
            setStatus('on', 'พร้อม');
            return true;
        }
        setStatus('err', providerLabel(cfg.provider) + ' ล้มเหลว' + (t.error ? ': ' + t.error : ''));
        return false;
    }
    if (!cfg.apiKey)
        return false;
    const pool = getModelPool();
    for (const model of pool) {
        const test = await testModel(cfg.apiKey, model);
        if (test.ok) {
            _activeModel = model;
            updateModelBadge(model);
            return true;
        }
    }
    setStatus('err', failReason());
    return false;
}

let _bgSearchKey = null;
async function listGeminiModels(apiKey) {
    const verTries = GEMINI_VERSIONS.map(ver => _fetchWithTimeout(`https://${GEMINI_HOST}/${ver}/models?key=${encodeURIComponent(apiKey)}`, {}, TEST_TIMEOUT).then(res => res.ok ? res.json() : null).catch(() => null));
    const verResults = await Promise.all(verTries);
    for (const data of verResults) {
        if (data && data.models) {
            const found = data.models.filter(m => m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name.replace('models/', ''));
            if (found.length)
                return found;
            break;
        }
    }
    return GEMINI_FALLBACK.slice();
}
// งานอัตโนมัติพื้นหลัง: รอบเดียวต่อคีย์ต่อการเปิดแอป
// 1) ลองใหม่เฉพาะโมเดลที่โควตาหมด (เท่านั้นที่กลับมาได้เอง) 2) ทดสอบเฉพาะโมเดลที่ยังไม่รู้ผล
// โมเดลที่ผ่านแล้วไม่ถูกเรียกซ้ำ และไม่มีการเขียนทับรายการที่บันทึกไว้
async function ensureModelPool() {
    const cfg = getCfg();
    if (isCompat(cfg.provider) || !cfg.apiKey)
        return;
    if (_bgSearchKey === cfg.apiKey)
        return;
    _bgSearchKey = cfg.apiKey;
    const quotaRetry = [...BENCHED].filter(m => MODEL_ERR.get(m)?.code === 'quota');
    const listed = await listGeminiModels(cfg.apiKey);
    const unknown = listed.filter(m => !OK_MODELS.has(m) && !BENCHED.has(m));
    const toTest = [...new Set([...quotaRetry, ...unknown])];
    await mapLimit(toTest, 6, async (model) => testModel(cfg.apiKey, model));
}

function cleanResponse(raw) {
    if (!raw)
        return '';
    let c = raw.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').replace(/^```(?:html|javascript|json|css)?\s*/i, '').replace(/\s*```$/i, '').trim();
    c = c.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    return c;
}

async function geminiGenerate({ systemInstruction, contents, jsonMode = false, onChunk = null, onTokenUsage = null, signal = null, temperature = null, localOk = false, noLocal = false }) {
    const cfg = getCfg();
    if (isCompat(cfg.provider))
        return compatGenerate({ systemInstruction, contents, jsonMode, onChunk, onTokenUsage, signal, temperature });
    if (!cfg.apiKey) {
        // ไม่มี API Key: ใช้โมเดลในเครื่องถ้าเปิดไว้ (แชตโค้ดและโรลเพลย์เท่านั้น ผู้เรียกที่ส่ง noLocal จะไม่ใช้)
        const L = window.NINOLocalLLM;
        // โมเดลในเครื่องใช้ได้เฉพาะแชตโค้ดและโรลเพลย์ที่ส่ง localOk มาเอง (งานเสริม เช่น ตั้งชื่อหัวข้อ สรุปโน้ต ไม่ใช้)
        if (localOk && !noLocal && L) {
            if (L.isReady())
                return L.generate({ systemInstruction, contents, onChunk, signal, temperature });
            if (L.canAutoLoad() && L.status().state !== 'downloading')
                L.load().catch(() => { /* สถานะแสดงในแท็บ LLM ของคอนโซล */ });
            if (!L.consented() || L.interrupted()) L.panel();
        }
        throw new Error(localOk && !noLocal && L && L.canAutoLoad() ? 'กำลังเตรียมโมเดลในเครื่อง ลองอีกครั้งเมื่อโหลดเสร็จ' : 'ยังไม่ได้ตั้งค่า API Key');
    }
    const pool = getModelPool();
    if (!pool.length)
        throw new Error('ตอนนี้ไม่มีโมเดลที่ใช้ได้ (ถูกพักเพราะโควตาหรือไม่พบ) กดค้นหาโมเดลเพื่อทดสอบใหม่ · ' + diagnoseModels().headline);
    _lastFinishReason = null;
    let lastErr = null;
    for (const model of pool) {
        const maxOut = MAX_OUTPUT_BY_MODEL[model] || MAX_OUTPUT_BY_MODEL.default;
        const generationConfig = { maxOutputTokens: maxOut, temperature: temperature != null ? temperature : (Number(cfg.temperature) || 0.7), topP: 0.9 };
        if (/gemini-2\.5-flash/.test(model))
            generationConfig.thinkingConfig = { thinkingBudget: 0 };
        if (jsonMode)
            generationConfig.responseMimeType = 'application/json';
        const bodyBase = {
            contents, systemInstruction: { parts: [{ text: systemInstruction }] }, generationConfig, safetySettings: SAFETY_SETTINGS
        };
        for (const ver of GEMINI_VERSIONS) {
            const MAX_ATTEMPTS = 2;
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    setStatus('busy', `${model} (${ver})`);
                    const endpoint = onChunk ? 'streamGenerateContent' : 'generateContent';
                    const url = `https://${GEMINI_HOST}/${ver}/models/${model}:${endpoint}?key=${encodeURIComponent(cfg.apiKey)}${onChunk ? '&alt=sse' : ''}`;
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
                    const combinedSignal = signal;
                    if (combinedSignal) {
                        if (combinedSignal.aborted)
                            controller.abort();
                        else
                            combinedSignal.addEventListener('abort', () => controller.abort(), { once: true });
                    }
                    let res;
                    try {
                        res = await fetch(url, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyBase), signal: controller.signal
                        });
                    }
                    finally {
                        clearTimeout(timeoutId);
                    }
                    if (!res.ok) {
                        const ed = await res.json().catch(() => ({}));
                        const errStatus = ed.error?.status;
                        const msg = ed.error?.message || `HTTP ${res.status}`;
                        noteModelErr(model, res.status, errStatus, msg);
                        if (res.status === 404 || errStatus === 'NOT_FOUND' || /not found|not supported|is not supported/i.test(msg)) {
                            markModelFailed(model);
                            lastErr = new Error(msg);
                            break;
                        }
                        if (errStatus === 'RESOURCE_EXHAUSTED' || errStatus === 'UNAVAILABLE' || res.status === 429 || res.status === 503) {
                            lastErr = new Error(errStatus || msg);
                            if (attempt < MAX_ATTEMPTS) {
                                await new Promise(r => setTimeout(r, Math.min(5000, 200 * Math.pow(2, attempt - 1))));
                                continue;
                            }
                            if (errStatus === 'RESOURCE_EXHAUSTED' || res.status === 429)
                                markModelFailed(model); // โควตาหมด: พักจนกว่าจะค้นหาโมเดลใหม่
                            break;
                        }
                        throw new Error(msg);
                    }
                    if (!onChunk) {
                        const data = await res.json();
                        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
                        _lastFinishReason = data.candidates?.[0]?.finishReason || (data.promptFeedback?.blockReason ? 'PROMPT_BLOCKED_' + data.promptFeedback.blockReason : null);
                        if (window.ninoPC && data.usageMetadata)
                            window.ninoPC.usage(data.usageMetadata);
                        if (onTokenUsage && data.usageMetadata?.candidatesTokenCount != null)
                            onTokenUsage(data.usageMetadata.candidatesTokenCount, maxOut);
                        setStatus('on', `พร้อม (${model})`);
                        updateModelBadge(model);
                        _activeModel = model;
                        markModelOk(model);
                        return cleanResponse(text);
                    }
                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '', fullText = '', lastLen = 0, streamFinish = null, streamBlock = '', streamErr = null;
                    const handleLine = (line) => {
                        if (!line.startsWith('data:'))
                            return;
                        const js = line.slice(5).trim();
                        if (!js || js === '[DONE]')
                            return;
                        try {
                            const d = JSON.parse(js);
                            const chunk = (d.candidates?.[0]?.content?.parts || []).map(p => (p && !p.thought && p.text) || '').join('');
                            if (d.candidates?.[0]?.finishReason)
                                streamFinish = d.candidates[0].finishReason;
                            if (d.promptFeedback?.blockReason)
                                streamBlock = d.promptFeedback.blockReason;
                            if (d.usageMetadata && window.ninoPC)
                                window.ninoPC.usage(d.usageMetadata);
                            if (d.usageMetadata?.candidatesTokenCount != null && onTokenUsage)
                                onTokenUsage(d.usageMetadata.candidatesTokenCount, maxOut);
                            fullText += chunk;
                            const cleaned = cleanResponse(fullText);
                            if (cleaned.length > lastLen) {
                                onChunk(cleaned.slice(lastLen));
                                lastLen = cleaned.length;
                            }
                        }
                        catch (_) { }
                    };
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done)
                                break;
                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';
                            lines.forEach(handleLine);
                        }
                        if (buffer.trim())
                            handleLine(buffer.trim());
                    }
                    catch (se) {
                        if (se && se.name === 'AbortError')
                            throw se;
                        streamErr = se;
                    }
                    if (!fullText) {
                        noteModelErr(model, 0, '', streamErr ? (streamErr.message || String(streamErr)) : 'Stream ended without content', streamErr ? undefined : 'empty');
                        lastErr = streamErr || new Error('Stream ended without content');
                        if (attempt < MAX_ATTEMPTS) {
                            await new Promise(r => setTimeout(r, 1000));
                            continue;
                        }
                        break;
                    }
                    _lastFinishReason = streamErr ? 'INTERRUPTED' : (streamBlock && !streamFinish ? 'PROMPT_BLOCKED_' + streamBlock : (streamFinish || 'INTERRUPTED'));
                    setStatus('on', `พร้อม (${model})`);
                    updateModelBadge(model);
                    _activeModel = model;
                    markModelOk(model);
                    return cleanResponse(fullText);
                }
                catch (e) {
                    if (e.name === 'AbortError')
                        throw e;
                    noteModelErr(model, 0, '', e && e.message || String(e));
                    lastErr = e;
                    if (attempt < MAX_ATTEMPTS) {
                        await new Promise(r => setTimeout(r, Math.min(5000, 200 * Math.pow(2, attempt - 1))));
                        continue;
                    }
                    break;
                }
            }
        }
    }
    const why = failReason();
    setStatus('err', why);
    throw new Error(why);
}

async function discoverModelsUI(apiKey) {
    const cfg0 = getCfg();
    if (isCompat(cfg0.provider)) {
        const c = document.getElementById('model-list-container');
        const pf = compatProfile(cfg0);
        if (c)
            c.innerHTML = '<div class="model-item pending">กำลังทดสอบ ' + pf.label + '...</div>';
        const good = [];
        const rows = await mapLimit(pf.models, 3, async (m) => {
            const t = await testNinearm({ ...cfg0, tokenmeModel: m, ninearmModel: m });
            if (t.ok)
                good.push(m);
            return `<div class="model-item ${t.ok ? 'active' : 'failed'}">${t.ok ? '[OK]' : '[FAIL]'} ${m}</div>`;
        });
        if (c)
            c.innerHTML = rows.join('');
        return good;
    }
    MODEL_ERR.clear(); // การค้นหาแต่ละครั้งวินิจฉัยใหม่ ไม่ใช้ผลเก่า
    const container = document.getElementById('model-list-container');
    if (container)
        container.innerHTML = '<div class="model-item pending">กำลังค้นหา...</div>';
    const verTries = GEMINI_VERSIONS.map(ver => _fetchWithTimeout(`https://${GEMINI_HOST}/${ver}/models?key=${encodeURIComponent(apiKey)}`, {}, TEST_TIMEOUT).then(res => res.ok ? res.json() : null).catch(() => null));
    const verResults = await Promise.all(verTries);
    let discovered = null;
    for (const data of verResults) {
        if (data && data.models) {
            discovered = data.models.filter(m => m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name.replace('models/', ''));
            break;
        }
    }
    if (!discovered || !discovered.length) {
        discovered = GEMINI_FALLBACK.slice();
        if (container)
            container.innerHTML = '<div class="model-item failed">ไม่พบโมเดล — ใช้ fallback</div>';
    }
    if (container)
        container.innerHTML = '';
    const board = makeModelBoard(container, apiKey);
    const itemMap = new Map();
    _modelItemEls = [];
    for (const model of discovered) {
        const item = document.createElement('div');
        item.className = 'model-item pending';
        item.textContent = 'ทดสอบ ' + model;
        item._model = model;
        item._state = 'pending';
        board.green.appendChild(item);
        itemMap.set(model, item);
        _modelItemEls.push(item);
    }
    const cfg = getCfg();
    const tested = await mapLimit(discovered, 6, async (model) => {
        const t0 = performance.now();
        const result = await testModel(apiKey, model);
        const ms = Math.round(performance.now() - t0);
        const item = itemMap.get(model);
        if (result.ok) {
            if (item)
                showModelOk(item, model, ms, board);
            return model;
        }
        if (item)
            showModelFail(item, model, ms, board, apiKey);
        return null;
    });
    const results = tested.filter(Boolean);
    const diag = diagnoseModels();
    if (container) {
        const h = document.createElement('div');
        h.className = 'model-item ' + (results.length ? 'active' : 'failed');
        h.textContent = 'สรุป: ' + diag.headline;
        container.insertBefore(h, container.firstChild);
    }
    if (!results.length)
        setStatus('err', failReason());
    if (results.length) {
        document.getElementById('cfg-model-list').value = results.join(', ');
        updateModelSelectionUI(container, cfg.model);
    }
    return results;
}

// สองคอลัมน์: ซ้ายเขียว = ใช้ได้, ขวาแดง = ใช้ไม่ได้/พัก (มีปุ่มทดสอบอีกครั้ง)
let _modelItemEls = [];
function makeModelBoard(container, apiKey) {
    const board = { container, green: null, red: null, apiKey };
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start;';
    const green = document.createElement('div');
    const red = document.createElement('div');
    const gh = document.createElement('div');
    gh.className = 'model-item';
    gh.textContent = 'เขียว · ใช้ได้';
    gh.style.cssText = 'color:#00ff88;font-weight:bold;';
    green.appendChild(gh);
    const rh = document.createElement('div');
    rh.className = 'model-item';
    rh.textContent = 'แดง · ใช้ไม่ได้';
    rh.style.cssText = 'color:#ff5577;font-weight:bold;';
    const rall = document.createElement('button');
    rall.textContent = 'ทดสอบแดงทั้งหมด';
    rall.style.cssText = 'display:block;margin:4px 0;font-size:11px;';
    red.appendChild(rh);
    red.appendChild(rall);
    wrap.appendChild(green);
    wrap.appendChild(red);
    if (container)
        container.appendChild(wrap);
    board.green = green;
    board.red = red;
    rall.onclick = async () => {
        const reds = _modelItemEls.filter(it => it._state === 'fail');
        await mapLimit(reds, 6, async (it) => retestModelItem(it, board));
    };
    return board;
}
function showModelOk(item, model, ms, board) {
    item._state = 'ok';
    item.className = 'model-item active';
    item.textContent = '[OK] ' + model + ' · ' + ms + 'ms';
    item.style.cssText = 'color:#00ff88;';
    item.onclick = () => {
        document.getElementById('cfg-model').value = model;
        updateModelSelectionUI(board.container, model);
    };
    board.green.appendChild(item);
}
function showModelFail(item, model, ms, board, apiKey) {
    item._state = 'fail';
    item.className = 'model-item failed';
    item.onclick = null;
    const e = MODEL_ERR.get(model);
    item.textContent = '[FAIL] ' + model + ' · ' + ms + 'ms';
    item.style.cssText = 'color:#ff5577;';
    const why = document.createElement('div');
    why.textContent = e ? ERR_TH[e.code] + (e.status ? ' (' + e.status + ')' : '') : 'ไม่ทราบสาเหตุ';
    why.style.cssText = 'font-size:11px;opacity:.85;';
    item.appendChild(why);
    const rb = document.createElement('button');
    rb.textContent = 'ทดสอบอีกครั้ง';
    rb.style.cssText = 'font-size:11px;margin-top:2px;';
    rb.onclick = (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); return retestModelItem(item, board); };
    item.appendChild(rb);
    board.red.appendChild(item);
}
async function retestModelItem(item, board) {
    const model = item._model;
    item._state = 'pending';
    item.className = 'model-item pending';
    item.textContent = 'ทดสอบอีกครั้ง ' + model + ' ...';
    item.style.cssText = '';
    const t0 = performance.now();
    const r = await testModel(board.apiKey, model);
    const ms = Math.round(performance.now() - t0);
    if (r.ok)
        showModelOk(item, model, ms, board);
    else
        showModelFail(item, model, ms, board, board.apiKey);
    return r.ok;
}

function updateModelSelectionUI(container, selected) {
    if (!container)
        return;
    _modelItemEls.forEach(el => {
        if (el._model === selected) {
            el.classList.add('active');
            el.style.outline = '1px solid #00ff88';
        }
        else {
            el.style.outline = 'none';
        }
    });
}

let _lastStatusText = '';
function setStatus(state, text) {
    _lastStatusText = text || _lastStatusText;
    const dot = document.getElementById('status-dot');
    const ind = document.getElementById('status-indicator');
    if (dot)
        dot.className = state === 'on' ? 'on' : state === 'busy' ? 'busy' : state === 'err' ? 'err' : '';
    if (ind && text)
        ind.textContent = text;
}

function updateModelBadge(model) {
    const b = document.getElementById('model-badge');
    if (!b)
        return;
    const cfg = getCfg();
    if (isCompat(cfg.provider)) {
        b.textContent = providerLabel(cfg.provider) + ' · ' + String(model || activeModelName(cfg)).split('/').pop();
        b.style.background = 'rgba(137,87,229,0.2)';
        b.style.color = '#C9A8F5';
        b.style.borderColor = 'rgba(137,87,229,0.4)';
    }
    else {
        b.textContent = model || 'gemini';
        b.style.background = 'rgba(31,111,235,0.2)';
        b.style.color = '#F28AB2';
        b.style.borderColor = 'rgba(31,111,235,0.4)';
    }
}

loadModelState();
window.ninoDiagnose = () => diagnoseModels();
window.ninoFailReason = () => failReason();
window.ninoModelStatus = () => _lastStatusText;
