'use strict';
const CFG_KEY = 'nino-config-v3';
const DB_NAME = 'NINO_v3';
const DB_VER = 1;
const DEFAULT_CFG = {
    apiKey: '', model: 'gemini-2.0-flash', modelList: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'], temperature: 0.7, roleplayTemperature: 1.0, maxTokens: 900000, provider: 'gemini', ninearmApiKey: '', ninearmBaseUrl: 'https://gateway.9arm.co/v1', ninearmModel: 'qwen3.8-27b-fp8', ninearmTemperature: 0.7, tokenmeApiKey: '', tokenmeModel: 'deepseek-ai/deepseek-v4-flash-0731', tokenmeTemperature: 0.7, rpLength: 'xlong', visionMode: 'auto', imgTtlMin: 30
};

function getCfg() {
    try {
        const c = Object.assign({}, DEFAULT_CFG, JSON.parse(localStorage.getItem(CFG_KEY) || '{}'));
        if (!Array.isArray(c.modelList) || !c.modelList.length)
            c.modelList = [...DEFAULT_CFG.modelList];
        return c;
    }
    catch {
        return { ...DEFAULT_CFG };
    }
}

function setCfg(c) {
    localStorage.setItem(CFG_KEY, JSON.stringify(c));
}

const TOKENME_BASE = 'https://api.tokenme.limited/api/v1';
const TOKENME_MODELS = ['deepseek-ai/deepseek-v4-flash-0731', 'unsloth/qwen3.8-27b-nvfp4', 'google/gemma-4-31b-it'];

function isCompat(p) {
    return p === '9arm' || p === 'tokenme';
}

function providerHasKey(c) {
    return c.provider === 'local' ? !!c.localApiKey : c.provider === 'tokenme' ? !!c.tokenmeApiKey : c.provider === '9arm' ? !!c.ninearmApiKey : !!c.apiKey;
}

function providerLabel(p) {
    return p === 'local' ? 'Local AI' : p === 'tokenme' ? 'TokenMe' : p === '9arm' ? '9arm' : 'Gemini';
}

function activeModelName(c) {
    return c.provider === 'local' ? 'local:' + (c.localModel || '') : c.provider === 'tokenme' ? (c.tokenmeModel || TOKENME_MODELS[0]) : c.provider === '9arm' ? (c.ninearmModel || 'qwen') : c.model;
}

function compatProfile(c) {
    if (c.provider === 'tokenme') {
        const first = c.tokenmeModel || TOKENME_MODELS[0];
        return {
            label: 'TokenMe', base: TOKENME_BASE, key: c.tokenmeApiKey || '', models: [first, ...TOKENME_MODELS.filter(m => m !== first)], temp: Number(c.tokenmeTemperature) || 0.7
        };
    }
    return {
        label: '9arm', base: (c.ninearmBaseUrl || 'https://gateway.9arm.co/v1').replace(/\/+$/, ''), key: c.ninearmApiKey || '', models: [c.ninearmModel || 'qwen3.8-27b-fp8'], temp: Number(c.ninearmTemperature) || 0.7
    };
}

const DB = {
    _db: null, async open() {
        return new Promise(r => {
            const req = indexedDB.open(DB_NAME, DB_VER);
            req.onupgradeneeded = e => {
                const d = e.target.result;
                ['sessions', 'episodic', 'vectors', 'characters', 'character-chats'].forEach(s => {
                    if (!d.objectStoreNames.contains(s))
                        d.createObjectStore(s, { keyPath: s === 'character-chats' ? 'characterId' : 'id' });
                });
            };
            req.onsuccess = e => {
                this._db = e.target.result;
                r();
            };
            req.onerror = () => r(null);
        });
    }, async put(store, data) {
        if (!this._db)
            return;
        return new Promise(r => {
            const tx = this._db.transaction(store, 'readwrite');
            tx.objectStore(store).put(data).onsuccess = () => r();
        });
    }, async get(store, key) {
        if (!this._db)
            return null;
        return new Promise(r => {
            const tx = this._db.transaction(store, 'readonly');
            tx.objectStore(store).get(key).onsuccess = e => r(e.target.result || null);
        });
    }, async getAll(store) {
        if (!this._db)
            return [];
        return new Promise(r => {
            const tx = this._db.transaction(store, 'readonly');
            tx.objectStore(store).getAll().onsuccess = e => r(e.target.result || []);
        });
    }, async delete(store, key) {
        if (!this._db)
            return;
        return new Promise(r => {
            const tx = this._db.transaction(store, 'readwrite');
            tx.objectStore(store).delete(key).onsuccess = () => r();
        });
    }
};
