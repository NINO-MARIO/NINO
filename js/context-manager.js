'use strict';
const MODEL_OVERHEAD = {
    default: 32768, 'gemini-2.5-flash': 32768, 'gemini-2.5-pro': 65536, 'gemini-2.0-flash': 32768, 'gemini-1.5-flash': 40960, 'gemini-1.5-pro': 65536
};
const MAX_OUTPUT_BY_MODEL = {
    default: 8192, 'gemini-2.0-flash': 8192, 'gemini-1.5-flash': 8192, 'gemini-1.5-pro': 8192, 'gemini-2.5-flash': 65536, 'gemini-2.5-pro': 65536, 'gemini-2.5-flash-lite': 65536, 'gemini-flash-latest': 65536, 'gemini-flash-lite-latest': 65536
};

class ContextManager {
    constructor(maxTokens, model) {
        this.maxTokens = maxTokens || 900000;
        this.systemPromptTokens = 0;
        this.reservedOutput = 65536;
        this.reservedOverhead = MODEL_OVERHEAD[model] || MODEL_OVERHEAD.default;
    }
    availableForHistory() {
        return Math.max(0, this.maxTokens - this.systemPromptTokens - this.reservedOutput - this.reservedOverhead);
    }
    setSystemPromptSize(t) {
        this.systemPromptTokens = Math.ceil((t || '').length / 4);
    }
    trimHistoryToFit(messages) {
        const avail = this.availableForHistory();
        let used = 0;
        const kept = [];
        for (let i = messages.length - 1; i >= 0; i--) {
            const tok = Math.ceil((messages[i].text || '').length / 4);
            if (used + tok <= avail) {
                kept.unshift(messages[i]);
                used += tok;
            }
            else
                break;
        }
        return kept;
    }
    getStats(history) {
        const histTok = (history || []).reduce((s, m) => s + Math.ceil((m.text || '').length / 4), 0);
        const pct = Math.min(100, Math.round((this.systemPromptTokens + histTok) / this.maxTokens * 100));
        return { systemTokens: this.systemPromptTokens, historyTokens: histTok, maxTokens: this.maxTokens, usagePercent: pct };
    }
}
