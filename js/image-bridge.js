'use strict';
/* NINO image bridge — แนบรูป → บีบอัด → รอในช่องข้อความ → ส่ง
   - ปุ่ม ถามก่อนว่าจะเลือกจาก "อัลบั้มรูป" หรือ "แฟ้ม/ไฟล์อื่น"
   - รูปที่ส่งแล้วถูกเก็บในถังขยะ (trash.js) แบบมีเวลา หมดเวลา = ลบจริง + ลบภาพย่อในแชท
   - โมเดลที่มองรูปไม่ได้ (เช่น Qwen ตัวเล็ก) ได้ "ดวงตาช่วย" = Gemini บรรยายรูปเป็นข้อความให้
     ถ้าไม่มี Gemini key จะวิเคราะห์สี/ผังภาพในเครื่องให้แทน (หยาบ แต่ดีกว่าไม่มี) */
(function () {
    const G = window;
    const HOLD_MS = 15 * 60 * 1000;
    const MAX_BYTES = 400 * 1024;
    const NOVISION_KEY = 'nino-novision-models';
    const memKeep = new Map();
    let pending = null;
    let busy = '';
    let codeAddonText = '';
    let warnedLocal = false;
    let inAlbum = null, inFiles = null;

    function cfg() {
        try {
            return getCfg();
        }
        catch (_) {
            return {};
        }
    }

    function ttlMs() {
        const m = Number(cfg().imgTtlMin);
        return isNaN(m) ? 30 * 60000 : Math.max(0, m) * 60000;
    }

    function say(msg, type) {
        try {
            toast(msg, type);
        }
        catch (_) { }
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function fmtBytes(n) {
        return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
    }

    /* ---------- ตัวเลือก: อัลบั้ม / แฟ้ม ---------- */
    function mkInput(accept) {
        const el = document.createElement('input');
        el.type = 'file';
        el.accept = accept;
        el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
        el.addEventListener('change', () => {
            const f = el.files && el.files[0];
            el.value = '';
            if (f)
                handleFile(f);
        });
        document.body.appendChild(el);
        return el;
    }

    function ensureInputs() {
        if (inAlbum)
            return;
        inAlbum = mkInput('image/*');
        inFiles = mkInput('.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.heic,.heif,.tif,.tiff,.svg');
    }

    function closeChooser() {
        const o = document.getElementById('nino-img-sheet');
        if (o)
            o.remove();
    }

    function openChooser() {
        ensureInputs();
        if (document.getElementById('nino-img-sheet'))
            return;
        const ov = document.createElement('div');
        ov.id = 'nino-img-sheet';
        ov.innerHTML = '<div class="nino-sheet-card">'
            + '<div class="nino-sheet-title">แนบรูปภาพ — เลือกจากไหน?</div>'
            + '<label class="nino-sheet-opt">อัลบั้มรูป<input type="file" accept="image/*"></label>'
            + '<label class="nino-sheet-opt">แฟ้ม / ไฟล์อื่นในเครื่อง<input type="file" accept="image/*,.heic,.heif,.avif,.tif,.tiff,.svg,.bmp"></label>'
            + '<button type="button" data-k="x" class="nino-sheet-cancel">ยกเลิก</button>'
            + '<div class="nino-sheet-hint">รูปจะถูกบีบอัดอัตโนมัติแล้ววางไว้ในช่องข้อความ — พิมพ์ข้อความแล้วกดส่ง · หลังส่งรูปจะถูกลบตามเวลาที่ตั้งไว้</div>'
            + '</div>';
        ov.addEventListener('click', e => {
            const k = e.target && e.target.getAttribute && e.target.getAttribute('data-k');
            if (e.target === ov || k === 'x') {
                closeChooser();
                return;
            }
            if (k === 'album')
                inAlbum.click();
            else if (k === 'files')
                inFiles.click();
            if (k)
                setTimeout(closeChooser, 0);
        });
        ov.querySelectorAll('input[type=file]').forEach(i => i.addEventListener('change', () => {
            const f = i.files && i.files[0];
            i.value = '';
            closeChooser();
            if (f)
                handleFile(f);
        }));
        document.body.appendChild(ov);
    }

    /* ---------- บีบอัดรูป ---------- */
    function viaImg(file) {
        return new Promise((res, rej) => {
            const u = URL.createObjectURL(file), im = new Image();
            im.onload = () => {
                URL.revokeObjectURL(u);
                res(im);
            };
            im.onerror = () => {
                URL.revokeObjectURL(u);
                rej(new Error('ถอดรหัสรูปไม่ได้ (รูปแบบนี้เบราว์เซอร์ไม่รองรับ)'));
            };
            im.src = u;
        });
    }

    async function loadSource(file) {
        if (G.createImageBitmap) {
            try {
                return await G.createImageBitmap(file, { imageOrientation: 'from-image' });
            }
            catch (_) { }
            try {
                return await G.createImageBitmap(file);
            }
            catch (_) { }
        }
        return viaImg(file);
    }

    function renderJpeg(src, w0, h0, maxSide, q) {
        const sc = Math.min(1, maxSide / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * sc)), h = Math.max(1, Math.round(h0 * sc));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const x = c.getContext('2d');
        x.fillStyle = '#fff';
        x.fillRect(0, 0, w, h);
        x.imageSmoothingQuality = 'high';
        x.drawImage(src, 0, 0, w, h);
        return new Promise((res, rej) => c.toBlob(b => b ? res({ blob: b, w, h, canvas: c }) : rej(new Error('เข้ารหัสรูปไม่ได้')), 'image/jpeg', q));
    }

    function blobToDataUrl(b) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = () => rej(new Error('อ่านไฟล์ไม่ได้'));
            r.readAsDataURL(b);
        });
    }

    async function compress(file) {
        const src = await loadSource(file);
        const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
        if (!w0 || !h0)
            throw new Error('รูปว่างเปล่า');
        let best = null;
        for (const side of [1280, 1024, 800, 640]) {
            let q = 0.82;
            let r = await renderJpeg(src, w0, h0, side, q);
            while (r.blob.size > MAX_BYTES && q > 0.52) {
                q -= 0.1;
                r = await renderJpeg(src, w0, h0, side, q);
            }
            best = r;
            if (r.blob.size <= MAX_BYTES)
                break;
        }
        const th = await renderJpeg(src, w0, h0, 192, 0.7);
        const dataUrl = await blobToDataUrl(best.blob);
        const thumb = th.canvas.toDataURL('image/jpeg', 0.7);
        try {
            if (src.close)
                src.close();
        }
        catch (_) { }
        return { name: (file.name || 'photo.jpg').slice(0, 60), mime: 'image/jpeg', w: best.w, h: best.h, bytes: best.blob.size, origBytes: file.size || best.blob.size, dataUrl, thumb };
    }

    /* ---------- ถาดรูปในช่องข้อความ ---------- */
    function tray() {
        let t = document.getElementById('nino-img-tray');
        if (t)
            return t;
        const ta = document.getElementById('prompt-input');
        const bar = ta && ta.parentElement;
        t = document.createElement('div');
        t.id = 'nino-img-tray';
        t.className = 'hidden';
        if (bar && bar.parentElement)
            bar.parentElement.insertBefore(t, bar);
        else
            document.body.appendChild(t);
        return t;
    }

    function renderTray() {
        const t = tray();
        if (!pending && !busy) {
            t.className = 'hidden';
            t.innerHTML = '';
            return;
        }
        t.className = '';
        if (busy && !pending) {
            t.innerHTML = '<div class="nino-tray-busy">รอ' + esc(busy) + '</div>';
            return;
        }
        t.innerHTML = '<img class="nino-tray-img" src="' + pending.thumb + '" alt="">'
            + '<div class="nino-tray-info"><div class="nino-tray-name">' + esc(pending.name) + '</div>'
            + '<div class="nino-tray-sub">บีบอัดแล้ว ' + fmtBytes(pending.origBytes) + ' → ' + fmtBytes(pending.bytes) + ' · ' + pending.w + '×' + pending.h + '</div>'
            + '<div class="nino-tray-sub">พิมพ์ข้อความแล้วกดส่งได้เลย</div></div>'
            + '<button type="button" class="nino-tray-x" title="เอารูปออก">ปิด</button>';
        const x = t.querySelector('.nino-tray-x');
        if (x)
            x.addEventListener('click', clearPending);
    }

    async function handleFile(file) {
        if (!file)
            return;
        if (!/^image\//.test(file.type || '') && !/\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?|svg)$/i.test(file.name || '')) {
            say('ไฟล์นี้ไม่ใช่รูปภาพ', 'err');
            return;
        }
        if (file.size > 40 * 1024 * 1024) {
            say('ไฟล์ใหญ่เกิน 40MB', 'err');
            return;
        }
        busy = 'กำลังบีบอัดรูป...';
        renderTray();
        try {
            pending = await compress(file);
            say('แนบรูปแล้ว — พิมพ์ข้อความแล้วกดส่ง');
            const ta = document.getElementById('prompt-input');
            if (ta && !ta.disabled)
                ta.focus();
        }
        catch (e) {
            say('อ่านรูปนี้ไม่ได้: ' + String(e && e.message || e).slice(0, 80), 'err');
        }
        finally {
            busy = '';
            renderTray();
        }
    }

    function clearPending() {
        pending = null;
        renderTray();
    }

    function getPending() {
        return pending;
    }

    function takePending() {
        const p = pending;
        pending = null;
        renderTray();
        return p;
    }

    /* ---------- ถังขยะ + ตัวจับเวลา ---------- */
    async function commit(att) {
        const id = 'img-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const hold = Math.max(ttlMs(), HOLD_MS);
        try {
            if (!G.ninoTrash)
                throw new Error('no trash');
            await G.ninoTrash.add(att.dataUrl, att.name, { id, ttlMs: hold });
        }
        catch (_) {
            memKeep.set(id, att.dataUrl);
        }
        return { id, name: att.name, mime: att.mime, w: att.w, h: att.h, bytes: att.bytes, thumb: att.thumb, caption: '', captionKind: '', expired: false, sentAt: Date.now() };
    }

    async function bytesOf(id) {
        if (memKeep.has(id))
            return memKeep.get(id);
        if (!G.ninoTrash)
            return null;
        return G.ninoTrash.get(id);
    }

    function scrubIds(ids) {
        let changed = false;
        try {
            for (const m of session.messages) {
                if (m && m.image && ids.indexOf(m.image.id) >= 0 && !m.image.expired) {
                    m.image.thumb = '';
                    m.image.expired = true;
                    changed = true;
                }
            }
        }
        catch (_) { }
        if (changed) {
            try {
                renderMessages();
                persistSession();
            }
            catch (_) { }
        }
    }

    async function endTurn(meta) {
        codeAddonText = '';
        if (!meta || !meta.id || meta.expired)
            return;
        const ttl = ttlMs();
        if (ttl === 0) {
            if (G.ninoTrash)
                await G.ninoTrash.remove(meta.id);
            memKeep.delete(meta.id);
            scrubIds([meta.id]);
            return;
        }
        if (G.ninoTrash && !memKeep.has(meta.id)) {
            await G.ninoTrash.touch(meta.id, ttl);
        }
        else {
            setTimeout(() => {
                memKeep.delete(meta.id);
                scrubIds([meta.id]);
            }, ttl);
        }
    }

    async function healMessages(msgs) {
        if (G.ninoTrash && G.ninoTrash.ready)
            await G.ninoTrash.ready();
        for (const m of msgs || []) {
            if (!m || !m.image || m.image.expired)
                continue;
            const alive = memKeep.has(m.image.id) || (G.ninoTrash ? await G.ninoTrash.has(m.image.id) : false);
            if (!alive) {
                m.image.thumb = '';
                m.image.expired = true;
            }
        }
        return msgs;
    }

    G.addEventListener('nino:trash-expired', e => {
        const ids = (e.detail && e.detail.ids) || [];
        if (ids.length)
            scrubIds(ids);
    });

    /* ---------- ตัดสินใจว่าส่งรูปตรงๆ หรือใช้ตาช่วย ---------- */
    function noVisionSet() {
        try {
            return new Set(JSON.parse(localStorage.getItem(NOVISION_KEY) || '[]'));
        }
        catch (_) {
            return new Set();
        }
    }

    function markNoVision(model) {
        const s = noVisionSet();
        s.add(String(model));
        try {
            localStorage.setItem(NOVISION_KEY, JSON.stringify(Array.from(s).slice(-30)));
        }
        catch (_) { }
    }

    function looksVision(model) {
        return /vision|(^|[-_/.])vl([-_/.]|$)|llava|pixtral|gpt-4o|gpt-4\.1|gemma-?[34]|gemini|claude|omni|4v|minicpm-v|internvl|molmo/i.test(String(model || ''));
    }

    function decide(mode) {
        const c = cfg();
        const vm = c.visionMode || 'auto';
        if (mode === 'code' || vm === 'bridge')
            return 'bridge';
        if (vm === 'native')
            return 'native';
        if (!c.provider || c.provider === 'gemini')
            return 'native';
        let model = '';
        try {
            model = activeModelName(c);
        }
        catch (_) { }
        if (noVisionSet().has(model))
            return 'bridge';
        return looksVision(model) ? 'native' : 'bridge';
    }

    /* ---------- ดวงตาช่วย (Gemini) ---------- */
    const EYE_RP = 'คุณคือ "ดวงตาช่วย" ของ AI ตัวหนึ่งที่มองรูปไม่ได้ อ่านรูปนี้แล้วรายงานเป็นข้อความภาษาไทยให้ละเอียด ตรงความจริง ห้ามเดา ห้ามแต่งเติม ถ้าส่วนไหนไม่ชัดให้บอกว่าไม่ชัด ห้ามสวมบทบาท ห้ามออกความเห็น ตอบตามหัวข้อนี้เท่านั้น:\n'
        + 'ภาพรวม: (1-2 ประโยค ประเภทรูป เช่น ภาพถ่าย ภาพวาด ภาพหน้าจอ มีม)\n'
        + 'สิ่งที่เห็น: (คน/สัตว์/วัตถุ ตำแหน่งในภาพ สี ท่าทาง สีหน้า แววตา เสื้อผ้า อายุโดยประมาณถ้าเป็นคน)\n'
        + 'ฉากและบรรยากาศ: (สถานที่ แสง เวลา โทนสี อารมณ์ของภาพ)\n'
        + 'ข้อความในภาพ (OCR คัดลอกตรงตัวอักษร): (ถ้าไม่มีเขียนว่า ไม่มี)\n'
        + 'รายละเอียดเล็กๆ ที่อาจสำคัญ: (...)';
    const EYE_CODE = 'คุณคือ "ดวงตาช่วย" ของ AI เขียนโค้ดตัวหนึ่งที่มองรูปไม่ได้ อ่านรูปนี้แล้วรายงานเป็นข้อความภาษาไทย ตรงความจริง ห้ามเดา ห้ามแก้โค้ด ห้ามแนะนำวิธีแก้ ตอบตามหัวข้อนี้เท่านั้น:\n'
        + 'ภาพรวม: (ประเภท เช่น ภาพหน้าจอเว็บ/แอป โค้ด error log)\n'
        + 'เลย์เอาต์/UI: (องค์ประกอบ ตำแหน่ง สี ปุ่ม ข้อความบนปุ่ม สิ่งที่ผิดปกติทางสายตา)\n'
        + 'ข้อความและโค้ดในภาพ: (คัดลอกตรงตัวอักษรทุกบรรทัด รักษาการเยื้อง ถ้าอ่านไม่ออกให้ระบุว่าอ่านไม่ออก)\n'
        + 'Error / Stack trace: (คัดลอกตรงตัว ถ้าไม่มีเขียนว่า ไม่มี)\n'
        + 'ข้อสังเกตอื่น: (...)';

    function fetchT(url, body, ms, signal) {
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), ms);
        if (signal) {
            if (signal.aborted)
                ctl.abort();
            else
                signal.addEventListener('abort', () => ctl.abort(), { once: true });
        }
        return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal }).finally(() => clearTimeout(to));
    }

    function eyeModels() {
        const c = cfg();
        const out = [];
        const add = m => {
            if (m && /gemini/i.test(m) && !INVALID_MODELS.has(m) && out.indexOf(m) < 0)
                out.push(m);
        };
        add(c.model);
        (c.modelList || []).forEach(add);
        GEMINI_FALLBACK.forEach(add);
        return out.slice(0, 4);
    }

    async function eyeCaption(dataUrl, mime, o) {
        o = o || {};
        const c = cfg();
        if (!c.apiKey)
            return '';
        const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const prompt = o.mode === 'code' ? EYE_CODE : EYE_RP;
        const deadline = Date.now() + 70000;
        for (const model of eyeModels()) {
            for (const ver of GEMINI_VERSIONS) {
                if (Date.now() > deadline)
                    return '';
                try {
                    const body = {
                        contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: mime || 'image/jpeg', data: b64 } }] }],
                        generationConfig: { maxOutputTokens: 1600, temperature: 0.2 }, safetySettings: SAFETY_SETTINGS
                    };
                    if (/gemini-2\.5-flash/.test(model))
                        body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
                    const url = `https://${GEMINI_HOST}/${ver}/models/${model}:generateContent?key=${encodeURIComponent(c.apiKey)}`;
                    const res = await fetchT(url, body, 40000, o.signal);
                    if (!res.ok) {
                        const ed = await res.json().catch(() => ({}));
                        const msg = (ed.error && ed.error.message) || '';
                        if (res.status === 400 && /api key/i.test(msg))
                            return '';
                        if (res.status === 404 || /not found|not supported/i.test(msg)) {
                            INVALID_MODELS.add(model);
                            break;
                        }
                        continue;
                    }
                    const data = await res.json();
                    const text = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || []).map(p => (!p.thought && p.text) || '').join('').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                    if (text)
                        return text.slice(0, 3500);
                }
                catch (e) {
                    if (o.signal && o.signal.aborted)
                        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
                }
            }
        }
        return '';
    }

    /* ---------- วิเคราะห์ในเครื่อง (ไม่มีโมเดลมองภาพ) ---------- */
    function colorName(r, g, b) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, d = mx - mn;
        if (l < 0.12)
            return 'ดำ';
        if (l > 0.9 && d < 40)
            return 'ขาว';
        if (d < 28)
            return l < 0.35 ? 'เทาเข้ม' : l < 0.7 ? 'เทา' : 'เทาอ่อน';
        let h;
        if (mx === r)
            h = ((g - b) / d + 6) % 6;
        else if (mx === g)
            h = (b - r) / d + 2;
        else
            h = (r - g) / d + 4;
        h *= 60;
        let base = (h < 15 || h >= 345) ? 'แดง' : h < 40 ? 'ส้ม' : h < 65 ? 'เหลือง' : h < 80 ? 'เขียวมะนาว' : h < 165 ? 'เขียว' : h < 200 ? 'เขียวอมฟ้า' : h < 255 ? 'ฟ้า/น้ำเงิน' : h < 290 ? 'ม่วง' : 'ชมพู/บานเย็น';
        if (base === 'แดง' && l > 0.72)
            base = 'ชมพู';
        if (base === 'ส้ม' && l < 0.4)
            base = 'น้ำตาล';
        return base + (l < 0.3 ? 'เข้ม' : l > 0.78 ? 'อ่อน' : '');
    }

    async function localDescribe(dataUrl) {
        try {
            const im = await new Promise((res, rej) => {
                const i = new Image();
                i.onload = () => res(i);
                i.onerror = () => rej(new Error('decode'));
                i.src = dataUrl;
            });
            const W = im.naturalWidth, H = im.naturalHeight, S = 48;
            const c = document.createElement('canvas');
            c.width = S;
            c.height = S;
            const x = c.getContext('2d');
            x.drawImage(im, 0, 0, S, S);
            const px = x.getImageData(0, 0, S, S).data;
            const bins = {};
            let lumSum = 0, lumSq = 0;
            const cells = [];
            for (let i = 0; i < 9; i++)
                cells.push([0, 0, 0, 0]);
            for (let yy = 0; yy < S; yy++) {
                for (let xx = 0; xx < S; xx++) {
                    const k = (yy * S + xx) * 4, r = px[k], g = px[k + 1], b = px[k + 2];
                    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                    lumSum += lum;
                    lumSq += lum * lum;
                    const key = (r >> 6) * 16 + (g >> 6) * 4 + (b >> 6);
                    const e = bins[key] || (bins[key] = [0, 0, 0, 0]);
                    e[0] += r; e[1] += g; e[2] += b; e[3]++;
                    const ci = Math.min(2, Math.floor(yy / (S / 3))) * 3 + Math.min(2, Math.floor(xx / (S / 3)));
                    const ce = cells[ci];
                    ce[0] += r; ce[1] += g; ce[2] += b; ce[3]++;
                }
            }
            const n = S * S, mean = lumSum / n, sd = Math.sqrt(Math.max(0, lumSq / n - mean * mean));
            const top = Object.values(bins).sort((a, b) => b[3] - a[3]).slice(0, 3).map(e => colorName(e[0] / e[3], e[1] / e[3], e[2] / e[3]) + ' ~' + Math.round(e[3] / n * 100) + '%');
            const names = ['บนซ้าย', 'บนกลาง', 'บนขวา', 'กลางซ้าย', 'กลาง', 'กลางขวา', 'ล่างซ้าย', 'ล่างกลาง', 'ล่างขวา'];
            const grid = cells.map((e, i) => names[i] + ': ' + colorName(e[0] / e[3], e[1] / e[3], e[2] / e[3])).join(' · ');
            let ocr = '';
            try {
                if (G.TextDetector) {
                    const det = new G.TextDetector();
                    const found = await det.detect(im);
                    ocr = found.map(f => f.rawValue).filter(Boolean).join(' | ').slice(0, 800);
                }
            }
            catch (_) { }
            return '[วิเคราะห์ภาพเบื้องต้นในเครื่อง — ไม่มีโมเดลมองภาพ จึงรู้แค่ภาพรวมของสีและผัง]\n'
                + '- ขนาด ' + W + '×' + H + ' (' + (W >= H ? 'แนวนอน' : 'แนวตั้ง') + ') · ความสว่างโดยรวม: ' + (mean < 70 ? 'มืด' : mean < 170 ? 'ปานกลาง' : 'สว่าง') + ' · คอนทราสต์: ' + (sd > 60 ? 'สูง' : sd > 30 ? 'ปานกลาง' : 'ต่ำ') + '\n'
                + '- สีเด่น: ' + top.join(', ') + '\n'
                + '- ผังสีแบบ 3×3: ' + grid + '\n'
                + '- ข้อความที่ตรวจพบในภาพ: ' + (ocr || 'อ่านข้อความในภาพไม่ได้');
        }
        catch (_) {
            return '[ผู้ใช้แนบรูปมา แต่ระบบวิเคราะห์ภาพในเครื่องทำงานไม่ได้ — ไม่รู้เนื้อหาในรูป]';
        }
    }

    function wrapBridge(name, cap, kind, expired) {
        const head = '[ผู้ใช้แนบรูปภาพมาด้วย 1 รูป ("' + name + '")' + (expired ? ' (ไฟล์รูปถูกลบอัตโนมัติแล้ว เหลือแต่คำบรรยายนี้)' : '') + ' — คุณมองรูปตรงๆ ไม่ได้ จึงได้รับคำบรรยายจาก "ดวงตาช่วย" ด้านล่างแทน ให้ตอบเหมือนคุณเห็นรูปนั้นเอง อย่ากล่าวถึงดวงตาช่วยหรือคำบรรยาย (เว้นแต่ผู้ใช้ถาม) และห้ามแต่งรายละเอียดนอกเหนือจากที่ระบุ]';
        const warn = kind === 'local' ? '\n(คำบรรยายนี้มาจากการวิเคราะห์สี/ผังในเครื่อง ไม่ละเอียด — ถ้าผู้ใช้ถามรายละเอียดที่ไม่มีข้างล่าง ให้บอกตรงๆ ว่ามองไม่ชัด และแนะนำให้ใส่ Gemini API key ในตั้งค่า เพื่อให้อ่านรูปได้ละเอียด)' : '';
        return head + warn + '\n<image_description>\n' + cap + '\n</image_description>';
    }

    async function buildContext(um, o) {
        o = o || {};
        const m = um && um.image;
        if (!m)
            return { parts: [], addon: '' };
        const how = decide(o.mode);
        const dataUrl = await bytesOf(m.id);
        if (!dataUrl) {
            if (m.caption)
                return { parts: [], addon: wrapBridge(m.name, m.caption, m.captionKind || 'eye', true) };
            return { parts: [], addon: '[ผู้ใช้แนบรูป "' + m.name + '" มาด้วย แต่รูปถูกลบอัตโนมัติไปแล้วและไม่มีคำบรรยายเหลืออยู่ — บอกผู้ใช้ตรงๆ ว่าตอนนี้มองรูปไม่ได้ ถ้าต้องการให้ส่งใหม่]' };
        }
        if (how === 'native') {
            return {
                parts: [{ inlineData: { mimeType: m.mime || 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) } }],
                addon: '[ผู้ใช้แนบรูปภาพมาด้วย 1 รูป ("' + m.name + '") — ดูรูปที่แนบท้ายข้อความนี้]'
            };
        }
        let cap = m.caption, kind = m.captionKind || 'eye';
        if (!cap || (kind === 'local' && cfg().apiKey)) {
            try {
                setStatus('busy', 'กำลังอ่านรูปภาพ...');
            }
            catch (_) { }
            say('กำลังอ่านรูปภาพ...', 'warn');
            cap = await eyeCaption(dataUrl, m.mime, { mode: o.mode, signal: o.signal });
            kind = 'eye';
            if (!cap) {
                cap = await localDescribe(dataUrl);
                kind = 'local';
                if (!warnedLocal) {
                    warnedLocal = true;
                    say('ไม่มีโมเดลที่อ่านรูปได้ — ใส่ Gemini API Key ในตั้งค่าเพื่อให้อ่านรูปละเอียด', 'warn');
                }
            }
            m.caption = cap.slice(0, 3500);
            m.captionKind = kind;
        }
        const addon = wrapBridge(m.name, cap, kind, false);
        if (o.mode === 'code')
            codeAddonText = addon;
        return { parts: [], addon };
    }

    async function captionAddonFor(urls, signal) {
        const out = [];
        let i = 0;
        for (const u of urls || []) {
            i++;
            const mime = (/^data:([^;]+);/.exec(u) || [])[1] || 'image/jpeg';
            let cap = await eyeCaption(u, mime, { mode: 'roleplay', signal });
            let kind = 'eye';
            if (!cap) {
                cap = await localDescribe(u);
                kind = 'local';
            }
            out.push(wrapBridge('รูปที่ ' + i, cap, kind, false));
        }
        return out.join('\n');
    }

    function historyNote(m) {
        if (!m)
            return '';
        if (m.caption)
            return '\n[รูปที่ผู้ใช้แนบ (' + m.name + ') — คำบรรยาย: ' + String(m.caption).replace(/\s+/g, ' ').slice(0, 700) + ']';
        return '\n[ผู้ใช้เคยแนบรูป "' + m.name + '"' + (m.expired ? ' (ถูกลบแล้ว ไม่มีคำบรรยาย)' : '') + ']';
    }

    function codeAddon() {
        return codeAddonText;
    }

    /* ---------- ผูกปุ่ม ---------- */
    function wire() {
        const btn = document.getElementById('btn-img');
        if (btn)
            btn.addEventListener('click', e => {
                e.preventDefault();
                openChooser();
            });
        const ta = document.getElementById('prompt-input');
        if (ta)
            ta.addEventListener('paste', e => {
                const items = (e.clipboardData && e.clipboardData.files) || [];
                for (const f of items) {
                    if (/^image\//.test(f.type)) {
                        e.preventDefault();
                        handleFile(f);
                        return;
                    }
                }
            });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape')
                closeChooser();
        });
        tray();
    }

    G.ninoImg = {
        pick: openChooser, handleFile, getPending, takePending, clearPending, commit, endTurn, buildContext, historyNote, codeAddon,
        captionAddonFor, healMessages, markNoVision, decide, _eye: eyeCaption, _local: localDescribe, _compress: compress
    };
    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', wire);
    else
        wire();
})();
