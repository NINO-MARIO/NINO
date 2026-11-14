'use strict';
const MEMORY_STOPWORDS = new Set(['the', 'is', 'a', 'an', 'and', 'or', 'html', 'css', 'js', 'code', 'ระบบ', 'และ', 'คือ', 'เป็น', 'ที่', 'ของ', 'ใน']);
const EMB_DIM = 256;
const EMB_STOP = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'and', 'or', 'but', 'if', 'then', 'so', 'as', 'it', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'not', 'no', 'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'และ', 'หรือ', 'ที่', 'ของ', 'ใน', 'เป็น', 'คือ', 'ได้', 'ให้', 'กับ', 'จาก', 'ไป', 'มา', 'อยู่', 'มี', 'ไม่', 'จะ', 'ก็', 'แต่', 'ถ้า', 'เพราะ', 'ว่า', 'ซึ่ง', 'อัน', 'ตัว', 'แบบ', 'แล้ว', 'นี้', 'นั้น', 'เขา', 'ฉัน', 'คุณ', 'เรา', 'พวก'
]);
const _tabId = Math.random().toString(36).slice(2, 10);
const _bc = ('BroadcastChannel' in window) ? new BroadcastChannel('nino-memory-v1') : null;
let _bcReady = false;

function _broadcast(type, payload) {
    if (!_bc)
        return;
    try {
        _bc.postMessage({ type, payload, ts: Date.now(), origin: _tabId });
    }
    catch (_) { }
}

function _onBroadcastMessage(ev) {
    if (!_bcReady)
        return;
    const msg = ev && ev.data;
    if (!msg || msg.origin === _tabId)
        return;
    try {
        if (msg.type === 'memory-event') {
            const e = msg.payload && msg.payload.event;
            if (e && e.id && !session.memory.events.find(x => x.id === e.id)) {
                session.memory.events.push(e);
                recomputeTiers();
                updateBudgetUI();
            }
        }
        else if (msg.type === 'file-update') {
            const p = msg.payload || {};
            if (p.path && typeof p.content === 'string') {
                session.files[p.path] = p.content;
                _fileFingerprintCache.delete(p.path);
                if (session.currentFile === p.path && fileEditorTextarea && document.activeElement !== fileEditorTextarea) {
                    fileEditorTextarea.value = p.content;
                    updateLineNumbers();
                }
                renderFilesList();
                if (session.phase === 'preview')
                    renderPreview();
            }
        }
        else if (msg.type === 'file-delete') {
            const p = msg.payload || {};
            if (p.path && session.files[p.path] !== undefined) {
                delete session.files[p.path];
                _fileFingerprintCache.delete(p.path);
                if (session.currentFile === p.path)
                    session.currentFile = 'index.html';
                renderFilesList();
                if (session.phase === 'preview')
                    renderPreview();
            }
        }
    }
    catch (_) { }
}

if (_bc)
    _bc.addEventListener('message', _onBroadcastMessage);

function fnv1a(text) {
    let h = 2166136261;
    for (const c of String(text)) {
        h ^= c.charCodeAt(0);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function extractTags(text) {
    return [...new Set(String(text || '').toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, ' ').split(/\s+/).filter(x => x.length > 1 && !MEMORY_STOPWORDS.has(x)).slice(0, 8))];
}

class VectorStore {
    constructor() {
        this.documents = [];
        this.vectors = [];
        this.dim = EMB_DIM;
    }
    textToVector(text) {
        return Array.from(embedText(text));
    }
    addDocument(text, metadata) {
        const vec = this.textToVector(text);
        this.documents.push({ text, metadata, vector: vec });
        this.vectors.push(vec);
    }
    search(query, topK = 5) {
        const qVec = this.textToVector(query);
        const scores = this.vectors.map((v, i) => ({ idx: i, score: this._cosine(qVec, v) }));
        scores.sort((a, b) => b.score - a.score);
        return scores.slice(0, topK).map(s => ({ ...this.documents[s.idx], score: s.score })).filter(r => r.score > 0.15);
    }
    _cosine(a, b) {
        let dot = 0;
        for (let i = 0; i < a.length; i++)
            dot += a[i] * b[i];
        return dot;
    }
    async load(key) {
        const d = await DB.get('vectors', key);
        if (d) {
            this.documents = d.documents || [];
            this.vectors = d.vectors || [];
        }
    }
    async save(key) {
        await DB.put('vectors', { id: key, documents: this.documents.slice(-200), vectors: this.vectors.slice(-200) });
    }
}

function embedText(text) {
    const v = new Float32Array(EMB_DIM);
    const raw = String(text || '').toLowerCase().slice(0, 2000);
    if (!raw)
        return v;
    const tokens = [];
    const wordRe = /[a-z0-9]+|[\u0E00-\u0E7F]+/g;
    let m;
    while ((m = wordRe.exec(raw))) {
        const w = m[0];
        if (w.length >= 2 && !EMB_STOP.has(w))
            tokens.push(w);
        if (/^[a-z0-9]+$/.test(w) && w.length >= 3) {
            for (let i = 0; i <= w.length - 3; i++)
                tokens.push('#' + w.slice(i, i + 3));
        }
    }
    for (let i = 0; i < raw.length - 1; i++) {
        const ch = raw[i];
        if (ch === ' ' || ch === '\n' || ch === '\t')
            continue;
        if (/[\u0E00-\u0E7F]/.test(ch) && /[\u0E00-\u0E7F]/.test(raw[i + 1] || ''))
            tokens.push('$' + raw.slice(i, i + 2));
    }
    const tf = {};
    for (const t of tokens)
        tf[t] = (tf[t] || 0) + 1;
    for (const t in tf) {
        const w = 1 + Math.log(tf[t]);
        const h1 = fnv1a(t);
        const idx = h1 % EMB_DIM;
        const sign = ((h1 >>> 16) & 1) ? 1 : -1;
        v[idx] += w * sign;
        const h2 = fnv1a(t + '\x00');
        const idx2 = h2 % EMB_DIM;
        const sign2 = ((h2 >>> 16) & 1) ? 1 : -1;
        v[idx2] += w * sign2 * 0.7;
    }
    let n = 0;
    for (let i = 0; i < EMB_DIM; i++)
        n += v[i] * v[i];
    n = Math.sqrt(n);
    if (n > 0)
        for (let i = 0; i < EMB_DIM; i++)
            v[i] /= n;
    return v;
}

function cosineSim(a, b) {
    if (!a || !b)
        return 0;
    const len = Math.min(a.length, b.length);
    let s = 0;
    for (let i = 0; i < len; i++)
        s += (a[i] || 0) * (b[i] || 0);
    return s;
}

function memoryText(x) {
    return x.key ? `${x.key} ${x.value}` : (x.desc || x.text || '');
}

function normalizeMemory() {
    const m = session.memory || {};
    m.facts = Array.isArray(m.facts) ? m.facts : [];
    m.events = Array.isArray(m.events) ? m.events : [];
    m.summaries = Array.isArray(m.summaries) ? m.summaries : [];
    m.facts = m.facts.map((f, i) => ({
        ...f, id: f.id || `fact-${i}-${Date.now()}`, priority: Math.max(1, Math.min(10, Number(f.priority) || 5)), tags: Array.isArray(f.tags) ? f.tags : extractTags(memoryText(f)), embedding: (f.embedding && f.embedding.length === EMB_DIM) ? f.embedding : embedText(memoryText(f)), createdAt: f.createdAt || Date.now(), updatedAt: f.updatedAt || Date.now()
    }));
    m.events = m.events.map((e, i) => ({
        ...e, id: e.id || `event-${i}-${Date.now()}`, tags: Array.isArray(e.tags) ? e.tags : extractTags(e.desc), importance: Math.max(1, Math.min(5, Number(e.importance) || 3)), embedding: (e.embedding && e.embedding.length === EMB_DIM) ? e.embedding : embedText(e.desc)
    }));
    m.summaries = m.summaries.map((s, i) => ({
        ...s, id: s.id || `summary-${i}-${Date.now()}`, createdAt: s.createdAt || Date.now(), layer: s.layer || 1, importance: Math.max(1, Math.min(5, Number(s.importance) || 3)), tags: Array.isArray(s.tags) ? s.tags : extractTags(s.text || ''), embedding: (s.embedding && s.embedding.length === EMB_DIM) ? s.embedding : embedText(s.text || '')
    }));
    session.memory = m;
    return m;
}

function recomputeTiers() {
    const evs = session.memory.events;
    const n = evs.length;
    for (let i = 0; i < n; i++) {
        const fromEnd = n - 1 - i;
        evs[i].tier = fromEnd < 20 ? 'hot' : fromEnd < 200 ? 'warm' : 'cold';
    }
}

function addMemoryEvent(desc, tags, importance) {
    normalizeMemory();
    const text = String(desc || '');
    if (importance === undefined || importance === null)
        importance = 3;
    const now = Date.now();
    for (const e of session.memory.events.slice(-5))
        if (e.desc === text && (now - (e.createdAt || 0)) < 60000)
            return null;
    const e = {
        id: `event-${now}-${Math.random().toString(36).slice(2, 6)}`, timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }), createdAt: now, desc: text, tags: Array.isArray(tags) ? tags : extractTags(text), importance: Math.max(1, Math.min(5, Number(importance) || 3)), embedding: embedText(text)
    };
    session.memory.events.push(e);
    recomputeTiers();
    if (session.memory.events.length > 500)
        session.memory.events.splice(0, session.memory.events.length - 500);
    _broadcast('memory-event', { event: e });
    return e;
}

function recordMemoryEvent(desc, tags, importance) {
    return addMemoryEvent(desc, tags, importance);
}

function semanticSearch(query, topK = 5) {
    normalizeMemory();
    const q = embedText(query);
    const pool = [...session.memory.facts, ...session.memory.events, ...session.memory.summaries];
    return pool.map(x => {
        const text = memoryText(x) || x.text || '';
        if (!x.embedding || x.embedding.length !== EMB_DIM)
            x.embedding = embedText(text);
        const sim = cosineSim(x.embedding, q);
        return { ...x, score: x.priority ? x.priority * 0.6 + sim * 0.4 : sim * 0.4, similarity: sim };
    }).filter(x => x.similarity > 0.15 || x.priority === 10).sort((a, b) => b.score - a.score).slice(0, topK);
}

function retrieveContext(query = '') {
    normalizeMemory();
    const ranked = semanticSearch(query, 8);
    const pinned = session.memory.facts.filter(f => f.priority === 10);
    const recentFacts = ranked.filter(x => x.key).filter(x => !x.createdAt || x.createdAt > (Date.now() - 86400000 * 7) || Number(x.priority) >= 7);
    const facts = [...new Map([...pinned, ...recentFacts].map(x => [x.id, x])).values()].slice(0, 5);
    const hot = session.memory.events.filter(e => (e.tier || 'warm') === 'hot').slice(-5);
    const warm = session.memory.events.filter(e => (e.tier || 'warm') === 'warm' && Number(e.importance) >= 4).sort((a, b) => (Number(b.importance) || 0) - (Number(a.importance) || 0) || (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 3);
    const events = [...new Map([...hot, ...warm].map(e => [e.id, e])).values()];
    const taskRecent = session.memory.events.filter(e => (e.tags || []).includes('task-done')).slice(-3);
    const mergedEvents = [...new Map([...events, ...taskRecent].map(e => [e.id, e])).values()].slice(-10);
    const l1 = session.memory.summaries.filter(s => (s.layer || 1) === 1).slice(-2);
    const l2 = session.memory.summaries.filter(s => s.layer === 2).slice(-1);
    const l3 = session.memory.summaries.filter(s => s.layer === 3).slice(-1);
    let rag = [];
    try {
        if (query && vectorStore && vectorStore.documents && vectorStore.documents.length)
            rag = vectorStore.search(query, 2);
    }
    catch (_) { }
    return { facts, events: mergedEvents, summaries: [...l1, ...l2, ...l3], rag };
}

async function llmSummarize(cold) {
    const cfg = getCfg();
    const hasKey = providerHasKey(cfg);
    if (!hasKey)
        return null;
    const text = cold.map(e => e.desc || '').filter(Boolean).join('\n').slice(0, 3000);
    if (!text)
        return null;
    try {
        const sys = 'Summarize these memory events in 2-4 sentences. Include key facts, decisions, and file changes. Output plain text only, no JSON.';
        const out = await spendGenerate({ systemInstruction: sys, contents: [{ role: 'user', parts: [{ text }] }], jsonMode: false, temperature: 0.3 });
        setStatus('on', 'พร้อม');
        return String(out || '').trim().slice(0, 500) || null;
    }
    catch (_) {
        setStatus('on', 'พร้อม');
        return null;
    }
}

function localExtractiveSummary(cold, tags) {
    const lines = cold.map(e => e.desc || '').filter(Boolean);
    const key = lines.slice(-5).map(s => s.slice(0, 80));
    return `Summary (${cold.length} events): ${tags.join(', ')} — ${key.join(' | ')}`.slice(0, 500);
}

async function compactMemory() {
    normalizeMemory();
    const events = session.memory.events;
    if (events.length <= 200 && session.memory.summaries.length <= 15)
        return 0;
    const cold = events.filter(e => e.tier === 'cold').slice(0, 50);
    if (cold.length < 10)
        return 0;
    const tags = [...new Set(cold.flatMap(e => e.tags || []))].slice(0, 6);
    let text = await llmSummarize(cold);
    let source = 'llm';
    if (!text) {
        text = localExtractiveSummary(cold, tags);
        source = 'local';
    }
    session.memory.summaries.push({
        id: `summary-${Date.now()}`, text, createdAt: Date.now(), layer: 1, importance: 3, tags, source, embedding: embedText(text)
    });
    const ids = new Set(cold.map(e => e.id));
    session.memory.events = session.memory.events.filter(e => !ids.has(e.id));
    const l1 = session.memory.summaries.filter(s => (s.layer || 1) === 1);
    if (l1.length > 15) {
        const batch = l1.slice(0, 10);
        const bid = new Set(batch.map(s => s.id));
        const btext = 'L2: ' + batch.map(s => s.text).join(' | ').slice(0, 500);
        session.memory.summaries.push({
            id: `summary-${Date.now()}-L2`, text: btext, coversEventIds: batch.flatMap(s => s.coversEventIds || []), createdAt: Date.now(), layer: 2, importance: Math.max(...batch.map(s => s.importance || 3)), tags: [...new Set(batch.flatMap(s => s.tags || []))].slice(0, 5), embedding: embedText(btext)
        });
        for (let i = session.memory.summaries.length - 1; i >= 0; i--)
            if (bid.has(session.memory.summaries[i].id))
                session.memory.summaries.splice(i, 1);
    }
    const l2 = session.memory.summaries.filter(s => s.layer === 2);
    if (l2.length > 5) {
        const batch = l2.slice(0, 5);
        const bid = new Set(batch.map(s => s.id));
        const btext = 'L3: ' + batch.map(s => s.text).join(' | ').slice(0, 500);
        session.memory.summaries.push({
            id: `summary-${Date.now()}-L3`, text: btext, coversEventIds: batch.flatMap(s => s.coversEventIds || []), createdAt: Date.now(), layer: 3, importance: Math.max(...batch.map(s => s.importance || 3)), tags: [...new Set(batch.flatMap(s => s.tags || []))].slice(0, 5), embedding: embedText(btext)
        });
        for (let i = session.memory.summaries.length - 1; i >= 0; i--)
            if (bid.has(session.memory.summaries[i].id))
                session.memory.summaries.splice(i, 1);
    }
    recomputeTiers();
    recordMemoryEvent(`compacted ${cold.length} cold events (${source})`, ['compaction'], 5);
    return cold.length;
}

function summarizeCompletedTask(taskLabel, filesTouched, intent, curSize) {
    normalizeMemory();
    const now = Date.now();
    const cutoff = now - 300000;
    const taskEvents = session.memory.events.filter(e => (e.createdAt || 0) >= cutoff && (['write', 'marker', 'append', 'milestone', 'orch'].includes((e.tags || [])[0])));
    if (taskEvents.length < 3)
        return null;
    const files = [...new Set(taskEvents.map(e => (e.desc.match(/\[([^\]]+)\]/) || [])[1]).filter(Boolean))];
    const ids = new Set(taskEvents.map(e => e.id));
    session.memory.events = session.memory.events.filter(e => !ids.has(e.id));
    const summary = {
        id: `task-${now}-${Math.random().toString(36).slice(2, 6)}`, timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }), createdAt: now, desc: `Task "${taskLabel}" เสร็จ — ${intent} | ${curSize} chars | ไฟล์: ${files.join(', ') || '-'} | ${taskEvents.length} ops`, tags: ['task-done', String(intent).toLowerCase()], importance: 4, tier: 'warm', embedding: embedText(`${taskLabel} ${intent} ${files.join(' ')}`)
    };
    session.memory.events.push(summary);
    recomputeTiers();
    return summary;
}

class EpisodicMemory {
    constructor() {
        this.episodes = [];
        this.maxEpisodes = 800;
        this.importanceDecay = 0.98;
        this.minImportance = 0.6;
        this.retentionFloor = 100;
    }
    static tokenize(t) {
        const words = String(t || '').toLowerCase().replace(/[^\u0E00-\u0E7Fa-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);
        const tf = {};
        words.forEach(w => {
            tf[w] = (tf[w] || 0) + 1;
        });
        const norm = Math.sqrt(Object.values(tf).reduce((s, v) => s + v * v, 0));
        if (norm > 0)
            Object.keys(tf).forEach(k => {
                tf[k] /= norm;
            });
        return tf;
    }
    static cosineSim(a, b) {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        let dot = 0, nA = 0, nB = 0;
        keys.forEach(k => {
            const va = a[k] || 0, vb = b[k] || 0;
            dot += va * vb;
            nA += va * va;
            nB += vb * vb;
        });
        if (nA === 0 || nB === 0)
            return 0;
        return dot / (Math.sqrt(nA) * Math.sqrt(nB));
    }
    calcImportance(text) {
        let score = 1;
        if (text.length > 200)
            score *= 1.2;
        if (text.length > 500)
            score *= 1.4;
        return Math.min(score, 5);
    }
    addEpisode(text, tags) {
        const ep = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 8), timestamp: Date.now(), text: String(text).slice(0, 400), tags: tags || [], importance: this.calcImportance(text)
        };
        this.episodes.push(ep);
        if (this.episodes.length > this.maxEpisodes)
            this.episodes = this.episodes.slice(-this.maxEpisodes);
        return ep;
    }
    decayAndPrune() {
        const now = Date.now();
        this.episodes.forEach(ep => {
            const ageDays = (now - ep.timestamp) / 86400000;
            if (ageDays > 0)
                ep.importance *= Math.pow(this.importanceDecay, ageDays);
        });
        const recent = this.episodes.slice(-this.retentionFloor);
        const old = this.episodes.slice(0, -this.retentionFloor).filter(ep => ep.importance >= this.minImportance);
        this.episodes = [...old, ...recent];
    }
    getRecent(days) {
        const cut = Date.now() - days * 86400000;
        return this.episodes.filter(e => e.timestamp >= cut);
    }
    async load(key) {
        const d = await DB.get('episodic', key);
        if (d) {
            this.episodes = d.episodes || [];
        }
    }
    async save(key) {
        await DB.put('episodic', { id: key, episodes: this.episodes.slice(-this.maxEpisodes) });
    }
}
