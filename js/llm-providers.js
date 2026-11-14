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
const INVALID_KEY = 'nino-invalid-models';

function loadInvalidModels() {
    try {
        const arr = JSON.parse(localStorage.getItem(INVALID_KEY) || '[]');
        return new Set(Array.isArray(arr) ? arr : []);
    }
    catch {
        return new Set();
    }
}

function saveInvalidModels(set) {
    try {
        localStorage.setItem(INVALID_KEY, JSON.stringify([...set]));
    }
    catch { }
}

const INVALID_MODELS = loadInvalidModels();
const _origAddModel = INVALID_MODELS.add.bind(INVALID_MODELS);
INVALID_MODELS.add = function (m) {
    _origAddModel(m);
    saveInvalidModels(this);
    return this;
};
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
        if (m && !INVALID_MODELS.has(m) && !pool.includes(m))
            pool.push(m);
    };
    add(cfg.model);
    (cfg.modelList || []).forEach(add);
    GEMINI_FALLBACK.forEach(add);
    return pool;
}

const TEST_TIMEOUT = 9000;

async function testModel(apiKey, model) {
    if (INVALID_MODELS.has(model))
        return { ok: false, invalid: true };
    const tries = GEMINI_VERSIONS.map(async (ver) => {
        try {
            const res = await _fetchWithTimeout(`https://${GEMINI_HOST}/${ver}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 1 } })
            }, TEST_TIMEOUT);
            if (!res.ok) {
                const ed = await res.json().catch(() => ({}));
                const msg = ed.error?.message || '';
                if (/not found|not supported|is not supported/i.test(msg))
                    return { ok: false, invalid: true };
                return { ok: false };
            }
            const data = await res.json();
            if (data.candidates)
                return { ok: true, version: ver };
            return { ok: false };
        }
        catch (_) {
            return { ok: false };
        }
    });
    const settled = await Promise.all(tries);
    const hit = settled.find(r => r.ok);
    if (hit)
        return hit;
    const inv = settled.find(r => r.invalid);
    if (inv)
        return inv;
    return { ok: false };
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
            if (cfg.model !== model) {
                cfg.model = model;
                setCfg(cfg);
                updateModelBadge(model);
            }
            return true;
        }
        if (test.invalid)
            INVALID_MODELS.add(model);
    }
    setStatus('err', 'ทุกโมเดลล้มเหลว');
    return false;
}

async function ensureModelPool() {
    const cfg = getCfg();
    if (isCompat(cfg.provider))
        return;
    if (!cfg.apiKey)
        return;
    if ((cfg.modelList || []).filter(m => !INVALID_MODELS.has(m)).length >= 2)
        return;
    const verTries = GEMINI_VERSIONS.map(ver => _fetchWithTimeout(`https://${GEMINI_HOST}/${ver}/models?key=${encodeURIComponent(cfg.apiKey)}`, {}, TEST_TIMEOUT).then(res => res.ok ? res.json() : null).catch(() => null));
    const verResults = await Promise.all(verTries);
    let discovered = [];
    for (const data of verResults) {
        if (data && data.models) {
            discovered = data.models.filter(m => m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name.replace('models/', '')).filter(m => !INVALID_MODELS.has(m));
            break;
        }
    }
    if (!discovered.length)
        discovered = GEMINI_FALLBACK.slice();
    const tested = await mapLimit(discovered, 8, async (model) => {
        if (INVALID_MODELS.has(model))
            return null;
        const test = await testModel(cfg.apiKey, model);
        if (test.ok)
            return model;
        if (test.invalid)
            INVALID_MODELS.add(model);
        return null;
    });
    const valid = tested.filter(Boolean).slice(0, 3);
    if (valid.length) {
        cfg.modelList = [...new Set([...(cfg.modelList || []), ...valid])].filter(m => !INVALID_MODELS.has(m));
        setCfg(cfg);
    }
}

function cleanResponse(raw) {
    if (!raw)
        return '';
    let c = raw.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').replace(/^```(?:html|javascript|json|css)?\s*/i, '').replace(/\s*```$/i, '').trim();
    c = c.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    return c;
}

async function geminiGenerate({ systemInstruction, contents, jsonMode = false, onChunk = null, onTokenUsage = null, signal = null, temperature = null }) {
    const cfg = getCfg();
    if (isCompat(cfg.provider))
        return compatGenerate({ systemInstruction, contents, jsonMode, onChunk, onTokenUsage, signal, temperature });
    if (!cfg.apiKey)
        throw new Error('ยังไม่ได้ตั้งค่า API Key');
    const pool = getModelPool();
    if (!pool.length)
        throw new Error('ไม่มีโมเดลใน pool');
    _lastFinishReason = null;
    let lastErr = null;
    for (const model of pool) {
        if (INVALID_MODELS.has(model))
            continue;
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
                        if (res.status === 404 || errStatus === 'NOT_FOUND' || /not found|not supported|is not supported/i.test(msg)) {
                            INVALID_MODELS.add(model);
                            lastErr = new Error(msg);
                            break;
                        }
                        if (errStatus === 'RESOURCE_EXHAUSTED' || errStatus === 'UNAVAILABLE' || res.status === 429 || res.status === 503) {
                            lastErr = new Error(errStatus || msg);
                            if (attempt < MAX_ATTEMPTS) {
                                await new Promise(r => setTimeout(r, Math.min(5000, 200 * Math.pow(2, attempt - 1))));
                                continue;
                            }
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
                    if (cfg.model !== model) {
                        cfg.model = model;
                        setCfg(cfg);
                    }
                    return cleanResponse(fullText);
                }
                catch (e) {
                    if (e.name === 'AbortError')
                        throw e;
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
    setStatus('err', 'ทุกโมเดลล้มเหลว');
    throw lastErr || new Error('ทุกโมเดลล้มเหลว');
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
    else if (container)
        container.innerHTML = '';
    const itemMap = new Map();
    if (container) {
        for (const model of discovered) {
            const item = document.createElement('div');
            item.className = 'model-item pending';
            item.textContent = 'ทดสอบ ' + model;
            container.appendChild(item);
            itemMap.set(model, item);
        }
    }
    const cfg = getCfg();
    const tested = await mapLimit(discovered, 6, async (model) => {
        const t0 = performance.now();
        const result = await testModel(apiKey, model);
        const ms = Math.round(performance.now() - t0);
        const item = itemMap.get(model);
        if (result.ok) {
            if (item) {
                item.className = 'model-item active';
                item.textContent = '[OK] ' + model + ' · ' + ms + 'ms';
                item.onclick = () => {
                    document.getElementById('cfg-model').value = model;
                    updateModelSelectionUI(container, model);
                };
            }
            return model;
        }
        else {
            if (item) {
                item.className = 'model-item failed';
                item.textContent = '[FAIL] ' + model + ' · ' + ms + 'ms';
                setTimeout(() => {
                    if (item.parentNode)
                        item.remove();
                }, 900);
            }
            if (result.invalid)
                INVALID_MODELS.add(model);
            return null;
        }
    });
    const results = tested.filter(Boolean);
    let selected = '';
    if (results.length) {
        selected = cfg.model && results.includes(cfg.model) ? cfg.model : results[0];
        document.getElementById('cfg-model').value = selected;
        document.getElementById('cfg-model-list').value = results.join(', ');
        updateModelSelectionUI(container, selected);
    }
    return results;
}

function updateModelSelectionUI(container, selected) {
    if (!container)
        return;
    Array.from(container.children).forEach(el => {
        const name = el.textContent.replace(/^\[(OK|FAIL)\]\s*/, '');
        if (name === selected) {
            el.classList.add('active');
            el.style.border = '1px solid #00ff88';
        }
        else {
            el.classList.remove('active');
            el.style.border = '1px solid transparent';
        }
    });
}

function setStatus(state, text) {
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
