'use strict';

function validateCode(code, filename = 'index.html') {
    const s = String(code || '');
    const ext = String(filename).split('.').pop().toLowerCase();
    if (ext === 'html' || ext === 'htm') {
        const _noLit = s.replace(/`(?:\\.|[^`\\])*`/g, '``').replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");
        if (/<<REPLACE:|<<DELETE:/.test(_noLit))
            return { ok: false, reason: 'มี edit marker ค้าง' };
        if (s.length > 50) {
            const normalized = s.replace(/<div([^>]*)\/>/gi, '<div$1></div>').replace(/<(br|hr|img|input|meta|link|area|base|col|embed|source|track|wbr)([^>]*)\/?>/gi, '');
            const htmlOpen = /<html/i.test(s), htmlClose = /<\/html>/i.test(s), bodyOpen = /<body/i.test(s);
            if ((htmlOpen && !htmlClose) || (!htmlOpen && htmlClose))
                return { ok: false, reason: 'แท็ก <html> ไม่ครบคู่' };
            if (htmlOpen && !bodyOpen)
                return { ok: false, reason: 'มี <html> แต่ไม่มี <body>' };
            if ((normalized.match(/<div(?:\s|>)/gi) || []).length !== (normalized.match(/<\/div>/gi) || []).length)
                return { ok: false, reason: '<div> ไม่สมดุล' };
            if ((_noLit.match(/<script(?:\s|>)/gi) || []).length !== (_noLit.match(/<\/script>/gi) || []).length)
                return { ok: false, reason: '<script> ปิดไม่ครบ' };
            const inlineScriptCount = (_noLit.match(/<script(?![^>]*\bsrc=)(?:\s[^>]*)?>/gi) || []).length;
            if (inlineScriptCount > 1)
                return {
                    ok: false, reason: 'มี <script> (inline) มากกว่า 1 บล็อก (' + inlineScriptCount + ') — ต้องรวมโค้ด JS ทั้งหมดไว้ใน <script> บล็อกเดียว ใช้ replace_function หรือ stream_append ต่อท้ายใน block เดิม'
                };
            const stripped = s.replace(new RegExp('<script[\\s\\S]*?<\\/script>', 'gi'), '').replace(new RegExp('<style[\\s\\S]*?<\\/style>', 'gi'), '').replace(/<[^>]+>/g, ' ');
            if (/\b(class\s+[A-Z]\w*\s*[{<]|function\s+\w+\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=)/.test(stripped))
                return { ok: false, reason: 'JS code อยู่นอก <script>' };
            const afterHtml = s.split(new RegExp('</html>', 'i'))[1];
            if (afterHtml && afterHtml.replace(/\s+/g, '').length > 20)
                return { ok: false, reason: 'มีเนื้อหาหลัง </html>' };
            const scriptsOnly = [...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
            const classes = [...scriptsOnly.matchAll(/\bclass\s+([A-Z]\w*)\s*\{/g)].map(m => m[1]);
            const dupC = classes.filter((n, i) => classes.indexOf(n) !== i);
            if (dupC.length)
                return {
                    ok: false, reason: 'class ซ้ำ: ' + [...new Set(dupC)].slice(0, 3).join(', ') + ' — ให้รวมเป็น class เดียว ห้ามตั้งชื่อใหม่'
                };
            const funcNames = [...scriptsOnly.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
            const dupF = funcNames.filter((n, i) => funcNames.indexOf(n) !== i);
            if (dupF.length)
                return {
                    ok: false, reason: 'function ซ้ำ: ' + [...new Set(dupF)].slice(0, 3).join(', ') + ' — ใช้ replace_function แทนที่ฟังก์ชันเดิมทั้งก้อน ห้ามตั้งชื่อใหม่เช่น oldX/newX'
                };
            const noC = scriptsOnly.replace(/\/(?![*\/])(?:\\.|[^\/\n\\])+\/[gimsuy]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
        }
    }
    else if (ext === 'js') {
        const isModule = /^\s*(import|export)\s/m.test(s);
        if (isModule) {
            const openB = (s.match(/\{/g) || []).length, closeB = (s.match(/\}/g) || []).length;
            const openP = (s.match(/\(/g) || []).length, closeP = (s.match(/\)/g) || []).length;
            const openK = (s.match(/\[/g) || []).length, closeK = (s.match(/\]/g) || []).length;
            if (openB !== closeB)
                return { ok: false, reason: 'JS module ปีกกาไม่สมดุล' };
            if (openP !== closeP)
                return { ok: false, reason: 'JS module วงเล็บไม่สมดุล' };
            if (openK !== closeK)
                return { ok: false, reason: 'JS module วงเล็บเหลี่ยมไม่สมดุล' };
        }
        else {
            try {
                new Function(s);
            }
            catch (err) {
                const _m = String(err.message || err);
                if (/await is only valid|top.level await/i.test(_m))
                    return { ok: true, reason: null };
                return { ok: false, reason: 'JS Syntax Error: ' + _m };
            }
        }
    }
    else if (ext === 'css' && (s.match(/\{/g) || []).length !== (s.match(/\}/g) || []).length) {
        return { ok: false, reason: 'CSS ปีกกาไม่สมดุล' };
    }
    return { ok: true, reason: null };
}

function autowrapChunk(chunk) {
    if (!chunk)
        return chunk;
    const t = String(chunk).trim();
    if (!t)
        return chunk;
    if (/^<(script|style|div|section|header|footer|main|canvas|svg|!--|table|ul|ol|form|input|button|p|h[1-6]|span|a|nav|article|aside|figure|template)\b/i.test(t))
        return chunk;
    const jsSignals = [
        /^\s*(class\s+\w|function\s+\w|const\s+\w|let\s+\w|var\s+\w|async\s+function|export\s+|import\s+|\/\/|\/\*)/m, /\(.*\)\s*=>/, /\w+\s*=\s*function/, /\b(requestAnimationFrame|addEventListener|setInterval|setTimeout|getContext|querySelector|querySelectorAll|JSON\.parse|localStorage|fetch)\s*\(/, /\b(if|for|while|switch|try)\s*\(/, /document\.\w+/, /window\.\w+/
    ];
    const looksJS = jsSignals.some(re => re.test(t));
    if (looksJS)
        return '\n<script>\n' + chunk + '\n</' + 'script>\n';
    const looksCSS = /^[.#@a-zA-Z][\w\-.#:>\s,\[\]()*="'~+]*\{[^}]*\}/m.test(t) && !/<\/?[a-z]/i.test(t);
    if (looksCSS)
        return '\n<style>\n' + chunk + '\n</' + 'style>\n';
    return chunk;
}

function maskForBraceMatch(s) {
    const str = String(s || '');
    const out = str.split('');
    const n = str.length;
    let i = 0;
    while (i < n) {
        const c = str[i];
        if (c === '`') {
            let j = i + 1;
            while (j < n && str[j] !== '`') {
                if (str[j] === '\\')
                    j++;
                j++;
            }
            for (let k = i; k <= j && k < n; k++)
                out[k] = 'x';
            i = j + 1;
            continue;
        }
        if (c === '"' || c === "'") {
            const q = c;
            let j = i + 1;
            while (j < n && str[j] !== q) {
                if (str[j] === '\\')
                    j++;
                j++;
            }
            for (let k = i; k <= j && k < n; k++)
                out[k] = 'x';
            i = j + 1;
            continue;
        }
        if (c === '/' && str[i + 1] === '/') {
            let j = i;
            while (j < n && str[j] !== '\n')
                j++;
            for (let k = i; k < j; k++)
                out[k] = 'x';
            i = j;
            continue;
        }
        if (c === '/' && str[i + 1] === '*') {
            let j = str.indexOf('*/', i + 2);
            if (j === -1)
                j = n;
            else
                j += 2;
            for (let k = i; k < j && k < n; k++)
                out[k] = 'x';
            i = j;
            continue;
        }
        i++;
    }
    return out.join('');
}

function findTopLevelBlock(content, name) {
    const safeName = String(name || '').replace(/[^A-Za-z0-9_$]/g, '');
    if (!safeName)
        return null;
    const masked = maskForBraceMatch(content);
    const patterns = [
        new RegExp('function\\s+' + safeName + '\\s*\\('), new RegExp('(?:const|let|var)\\s+' + safeName + '\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>'), new RegExp('(?:const|let|var)\\s+' + safeName + '\\s*=\\s*(?:async\\s*)?function'), new RegExp('class\\s+' + safeName + '\\s*\\{')
    ];
    for (const re of patterns) {
        const m = re.exec(masked);
        if (!m)
            continue;
        const startIdx = m.index;
        const braceOpen = masked.indexOf('{', m.index + m[0].length - 1);
        if (braceOpen === -1)
            continue;
        let depth = 0, endIdx = -1;
        for (let i = braceOpen; i < masked.length; i++) {
            if (masked[i] === '{')
                depth++;
            else if (masked[i] === '}') {
                depth--;
                if (depth === 0) {
                    endIdx = i;
                    break;
                }
            }
        }
        if (endIdx === -1)
            continue;
        let semiEnd = endIdx + 1;
        if (content[semiEnd] === ';')
            semiEnd++;
        return { start: startIdx, end: semiEnd };
    }
    return null;
}

function scanTopLevelSymbols(content) {
    const masked = maskForBraceMatch(content);
    const results = [];
    const specs = [
        { re: /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g, kind: 'function' }, { re: /\bclass\s+([A-Za-z_$][\w$]*)\s*[\{<]/g, kind: 'class' }, { re: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g, kind: 'arrow' }, { re: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function/g, kind: 'funcexpr' }
    ];
    for (const spec of specs) {
        spec.re.lastIndex = 0;
        let m;
        while ((m = spec.re.exec(masked))) {
            const name = m[1];
            const braceStart = masked.indexOf('{', m.index + m[0].length - 1);
            let size = 0, endIdx = -1;
            if (braceStart !== -1) {
                let depth = 0;
                for (let i = braceStart; i < masked.length; i++) {
                    if (masked[i] === '{')
                        depth++;
                    else if (masked[i] === '}') {
                        depth--;
                        if (depth === 0) {
                            endIdx = i;
                            break;
                        }
                    }
                }
                if (endIdx !== -1)
                    size = endIdx - m.index + 1;
            }
            results.push({ name, kind: spec.kind, line: offsetToLine(content, m.index), size });
        }
    }
    results.sort((a, b) => a.line - b.line);
    return results;
}

function appendChunkSmart(content, chunk) {
    const raw = String(chunk || '');
    if (!raw.trim())
        return content;
    const t = raw.trim();
    const looksStructural = /^<(script|style|div|section|header|footer|main|canvas|svg|!--|table|ul|ol|form|input|button|p|h[1-6]|span|a|nav|article|aside|figure|template)\b/i.test(t);
    if (looksStructural) {
        if (content.includes('</body>'))
            return content.replace('</body>', raw + '\n</body>');
        if (content.includes('</html>'))
            return content.replace('</html>', raw + '\n</html>');
        return content + raw;
    }
    const jsSignals = [
        /^\s*(class\s+\w|function\s+\w|const\s+\w|let\s+\w|var\s+\w|async\s+function|export\s+|import\s+|\/\/|\/\*)/m, /\(.*\)\s*=>/, /\w+\s*=\s*function/, /\b(requestAnimationFrame|addEventListener|setInterval|setTimeout|getContext|querySelector|querySelectorAll|JSON\.parse|localStorage|fetch)\s*\(/, /\b(if|for|while|switch|try)\s*\(/, /document\.\w+/, /window\.\w+/
    ];
    const looksJS = jsSignals.some(re => re.test(t));
    const looksCSS = /^[.#@a-zA-Z][\w\-.#:>\s,\[\]()*="'~+]*\{[^}]*\}/m.test(t) && !/<\/?[a-z]/i.test(t);
    if (looksJS) {
        const idx = content.lastIndexOf('<\/script>');
        if (idx !== -1)
            return content.slice(0, idx) + '\n' + raw + '\n' + content.slice(idx);
        const wrapped = '\n<script>\n' + raw + '\n<\/script>\n';
        if (content.includes('</body>'))
            return content.replace('</body>', wrapped + '</body>');
        if (content.includes('</html>'))
            return content.replace('</html>', wrapped + '</html>');
        return content + wrapped;
    }
    if (looksCSS) {
        const idx = content.lastIndexOf('</style>');
        if (idx !== -1)
            return content.slice(0, idx) + '\n' + raw + '\n' + content.slice(idx);
        const wrapped = '\n<style>\n' + raw + '\n</style>\n';
        if (content.includes('</head>'))
            return content.replace('</head>', wrapped + '</head>');
        if (content.includes('</body>'))
            return content.replace('</body>', wrapped + '</body>');
        return content + wrapped;
    }
    if (content.includes('</body>'))
        return content.replace('</body>', raw + '\n</body>');
    if (content.includes('</html>'))
        return content.replace('</html>', raw + '\n</html>');
    return content + raw;
}

function checkHygieneGate(chunk) {
    const s = String(chunk || '');
    if (!s)
        return { passed: true };
    if (/\/\/\s*---\s*P\d+:/i.test(s))
        return { passed: false, reason: 'ห้ามใช้ // --- P<N>: header' };
    if (s.length > 500) {
        const c = (s.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) || []).join('').length;
        if (c / Math.max(1, s.length) >= 0.25)
            return { passed: false, reason: 'comment ratio ≥ 25%' };
    }
    if (/\n\s*\n\s*\n\s*\n/.test(s))
        return { passed: false, reason: 'มี blank line เกิน 3 บรรทัด' };
    return { passed: true };
}

function parseDualMarker(chunk, tag) {
    const open = '<<' + tag + ':';
    const s = chunk.indexOf(open);
    if (s === -1)
        return null;
    const e = chunk.lastIndexOf('>>');
    if (e <= s + open.length)
        return null;
    let inner = chunk.slice(s + open.length, e);
    let occ = undefined;
    const om = inner.match(/\|\|(\d+)$/);
    if (om) {
        occ = om[1];
        inner = inner.slice(0, om.index);
    }
    const sep = inner.indexOf('||');
    if (sep === -1)
        return null;
    return [null, inner.slice(0, sep), inner.slice(sep + 2), occ];
}

function parseSingleMarker(chunk, tag) {
    const open = '<<' + tag + ':';
    const s = chunk.indexOf(open);
    if (s === -1)
        return null;
    const e = chunk.lastIndexOf('>>');
    if (e <= s + open.length)
        return null;
    let inner = chunk.slice(s + open.length, e);
    let occ = undefined;
    const om = inner.match(/\|\|(\d+)$/);
    if (om) {
        occ = om[1];
        inner = inner.slice(0, om.index);
    }
    return [null, inner, occ];
}

function detectImportType(content, filename) {
    const v = String(content || '');
    if (/<!DOCTYPE|<html/i.test(v))
        return 'html';
    if (/^\s*(import|export)\s|function\s|=>|const\s|let\s|var\s/.test(v))
        return 'js';
    if (/\{[\s\S]*\}/.test(v) && !v.includes('<'))
        return 'css';
    const ext = String(filename || '').split('.').pop().toLowerCase();
    if (ext === 'html' || ext === 'htm')
        return 'html';
    if (ext === 'css')
        return 'css';
    if (ext === 'js')
        return 'js';
    return 'unknown';
}

function sanitizeFilename(name) {
    return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
}

function computeDiffSnippet(before, after) {
    const b = String(before || '').split('\n'), a = String(after || '').split('\n');
    let i = 0;
    while (i < b.length && i < a.length && b[i] === a[i])
        i++;
    const start = Math.max(0, i - 3);
    return a.slice(start, i + 4).map((line, n) => `${start + n + 1}: ${line}`).join('\n').slice(0, 1200);
}

function countOccurrences(haystack, needle, cap = 50) {
    if (!needle)
        return [];
    const positions = [];
    let idx = 0;
    while ((idx = haystack.indexOf(needle, idx)) !== -1) {
        positions.push(idx);
        idx += needle.length;
        if (positions.length >= cap)
            break;
    }
    return positions;
}

function offsetToLine(text, offset) {
    let line = 1;
    for (let i = 0; i < offset && i < text.length; i++)
        if (text[i] === '\n')
            line++;
    return line;
}

function parseExplicitTarget(text) {
    if (/เพิ่ม|ต่อ|อีก|add\s+more|extend/i.test(text))
        return null;
    const t = String(text || '');
    const m1 = t.match(/(\d[\d,.]*)\s*(k|K)\b/);
    if (m1) {
        const n = parseInt(m1[1].replace(/[,.]/g, ''), 10) * 1000;
        if (n >= 3000 && n <= 500000)
            return n;
    }
    const m2 = t.match(/(\d[\d,.]*)\s*(chars?|ตัวอักษร)/i);
    if (m2) {
        const n = parseInt(m2[1].replace(/[,.]/g, ''), 10);
        if (n >= 3000 && n <= 500000)
            return n;
    }
    const m3 = t.match(/(\d[\d,.]*)\s*(แสน|พัน)/);
    if (m3) {
        const raw = parseInt(m3[1].replace(/[,.]/g, ''), 10) || 0;
        const n = m3[2] === 'แสน' ? raw * 100000 : raw * 1000;
        if (n >= 3000 && n <= 500000)
            return n;
    }
    return null;
}

const _fileFingerprintCache = new Map();

function _fileFingerprint(path, content) {
    return `${path}:${content.length}:${fnv1a(content.slice(0, 500))}:${fnv1a(content.slice(-500))}`;
}
