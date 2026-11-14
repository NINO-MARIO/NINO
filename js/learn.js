/* Learning exam and chat notices for the library.
   What the exam proves: every step and caution in a learned skill is backed by a quote that appears in
   the sources NINO fetched, every cited URL was among those sources, and code examples appear in them.
   What it does NOT prove: that those sources are themselves correct. The report says so in the UI. */
(function () {
    'use strict';
    function norm(s) {
        return String(s || '').toLowerCase().replace(/[\u2018\u2019\u201c\u201d"'`*_]/g, '').replace(/\s+/g, ' ').trim();
    }
    function hitsOf(quote, srcs) {
        var nq = norm(quote), hits = [];
        if (nq.length < 12) return hits;
        srcs.forEach(function (s, k) { if (norm(s.text).indexOf(nq) >= 0) hits.push(k + 1); });
        return hits;
    }
    function codeCheck(code, srcs) {
        var lines = String(code || '').split('\n').map(norm).filter(function (l) { return l.length >= 6; });
        if (!lines.length) return { lines: 0, hit: 0, ok: true, none: true };
        var all = srcs.map(function (s) { return norm(s.text); }).join(' ');
        var hit = lines.filter(function (l) { return all.indexOf(l) >= 0; }).length;
        return { lines: lines.length, hit: hit, ok: hit / lines.length >= 0.7, none: false };
    }
    function snapshot(srcs) {
        return srcs.map(function (s, i) { return { n: i + 1, url: s.url || '', title: String(s.title || ''), src: s.src || '', text: String(s.text || '').slice(0, 1200) }; });
    }

    /* Grade a learned skill against the sources it was built from. Pure: no storage, no network. */
    function grade(v, srcs) {
        srcs = Array.isArray(srcs) ? srcs : [];
        var urls = srcs.map(function (s) { return s.url; });
        var steps = (v.steps || []).map(function (x) {
            var o = typeof x === 'string' ? { text: x, quote: '' } : x;
            var hits = hitsOf(o.quote, srcs);
            return { text: String(o.text || ''), quote: String(o.quote || ''), hits: hits, corroborated: hits.length >= 2 };
        });
        var cautions = (v.cau || []).map(function (x) {
            var o = typeof x === 'string' ? { text: x, quote: '' } : x;
            var hits = hitsOf(o.quote, srcs);
            return { text: String(o.text || ''), quote: String(o.quote || ''), hits: hits, corroborated: hits.length >= 2 };
        });
        var badUrls = (v.used || []).filter(function (u) { return urls.indexOf(u) < 0; });
        var code = codeCheck(v.ex, srcs);
        var ok = steps.filter(function (s) { return s.hits.length; }).length;
        var ratio = steps.length ? ok / steps.length : 0;
        var verdict = (ok >= 2 && ratio >= 0.8 && !badUrls.length && code.ok) ? 'pass'
            : ((ok >= 2 && !badUrls.length) ? 'partial' : 'fail');
        var checks = [
            { k: 'ขั้นตอนมีข้อความรองรับจากแหล่ง', ok: ok >= 2, detail: ok + '/' + steps.length + ' ข้อ (ต้อง ≥ 2)' },
            { k: 'สัดส่วนหลักฐานสูงพอ', ok: ratio >= 0.8, detail: Math.round(ratio * 100) + '% (เกณฑ์ 80%)' },
            { k: 'ลิงก์ที่อ้างมาจากแหล่งที่ค้นจริง', ok: !badUrls.length, detail: badUrls.length ? badUrls.length + ' ลิงก์ไม่อยู่ในแหล่ง' : (v.used || []).length + ' ลิงก์ตรง' },
            { k: 'ตัวอย่างโค้ดอยู่ในแหล่ง', ok: code.ok, detail: code.none ? 'ไม่มีตัวอย่างโค้ด' : code.hit + '/' + code.lines + ' บรรทัด (เกณฑ์ 70%)' },
            { k: 'ยืนยันจากหลายแหล่ง', ok: steps.filter(function (s) { return s.corroborated; }).length > 0, detail: steps.filter(function (s) { return s.corroborated; }).length + ' ข้อ อ้างได้จาก ≥ 2 แหล่ง' }
        ];
        return {
            verdict: verdict,
            score: Math.round(ratio * 100),
            steps: steps,
            cautions: cautions,
            code: code,
            badUrls: badUrls,
            used: (v.used || []).slice(),
            checks: checks,
            sources: snapshot(srcs),
            at: new Date().toISOString()
        };
    }

    /* Test the stored artifact again: sources saved in exam.json must still back every quote, and the
       quotes must still be in Skill.md. Catches edits made later by hand. */
    function recheck(dir) {
        var F = window.ninoLib && window.ninoLib.fs;
        if (!F) return { ok: false, broken: ['ห้องสมุดยังไม่พร้อม'] };
        var ex = null;
        try { ex = JSON.parse(F.read(dir + 'exam.json') || 'null'); } catch (e) { ex = null; }
        if (!ex) return { ok: false, broken: ['ยังไม่มีผลสอบของเล่มนี้'] };
        var md = F.read(dir + 'Skill.md') || '';
        var mdN = norm(md);
        var srcs = ex.sources || [];
        var broken = [];
        (ex.steps || []).concat(ex.cautions || []).forEach(function (s) {
            if (!s.quote) return;
            if (hitsOf(s.quote, srcs).length === 0) broken.push('หลักฐานไม่อยู่ในแหล่งที่เก็บไว้: ' + s.quote.slice(0, 40));
            else if (mdN.indexOf(norm(s.quote)) < 0) broken.push('ข้อความในหนังสือถูกแก้ไปแล้ว: ' + s.quote.slice(0, 40));
        });
        return { ok: broken.length === 0, broken: broken, checkedAt: new Date().toISOString() };
    }

    function save(dir, report, srcs, v) {
        var F = window.ninoLib && window.ninoLib.fs;
        if (!F) return;
        F.write(dir + 'exam.json', JSON.stringify({
            verdict: report.verdict, score: report.score, checks: report.checks, at: report.at,
            steps: report.steps.map(function (s) { return { text: s.text, quote: s.quote, hits: s.hits }; }),
            cautions: report.cautions.map(function (s) { return { text: s.text, quote: s.quote, hits: s.hits }; }),
            used: report.used, badUrls: report.badUrls, code: report.code,
            sources: report.sources, name: v && v.name, desc: v && v.desc
        }, null, 1));
    }

    function readExam(dir) {
        var F = window.ninoLib && window.ninoLib.fs;
        try { return JSON.parse((F && F.read(dir + 'exam.json')) || 'null'); } catch (e) { return null; }
    }

    /* 8x8 pixel sprite (book) drawn with SVG rects. */
    var BOOK = ['........', '.######.', '.#pppp#.', '.#p..p#.', '.#pppp#.', '.#p..p#.', '.######.', '........'];
    function sprite(map, col, size) {
        var rects = '';
        map.forEach(function (row, y) {
            for (var x = 0; x < row.length; x++) {
                var c = row[x];
                if (c === '.') continue;
                rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + (c === '#' ? '#E9E2EE' : col) + '"/>';
            }
        });
        return '<svg class="px-sprite" viewBox="0 0 8 8" width="' + size + '" height="' + size + '" shape-rendering="crispEdges" aria-hidden="true">' + rects + '</svg>';
    }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    var VERDICT = { pass: ['ผ่าน', '#8FD3B0'], partial: ['ผ่านบางส่วน', '#F2C275'], fail: ['ไม่ผ่าน', '#F26D78'] };

    function cardHtml(L) {
        L = L || {};
        var v = VERDICT[L.verdict] || VERDICT.fail;
        var steps = (L.steps || []).slice(0, 4).map(function (s, i) {
            var ok = s.hits && s.hits.length;
            return '<li class="ln-step ' + (ok ? 'ok' : 'no') + '"><span class="ln-box">' + (ok ? '✓' : '✗') + '</span><span>' + esc(s.text) + (ok ? ' <i>[' + s.hits.join(',') + ']</i>' : '') + '</span></li>';
        }).join('');
        var more = (L.steps || []).length > 4 ? '<div class="ln-more">+' + ((L.steps || []).length - 4) + ' ขั้นตอนในเล่ม</div>' : '';
        return '<div class="ln-card" data-verdict="' + esc(L.verdict) + '">' +
            '<div class="ln-scan"></div>' +
            '<div class="ln-top"><span class="ln-tag">SKILL UNLOCKED</span><span class="ln-stamp" style="color:' + v[1] + ';border-color:' + v[1] + '">' + v[0] + '</span></div>' +
            '<div class="ln-head">' + sprite(BOOK, '#7FE7FF', 30) + '<div class="ln-titles"><div class="ln-name">' + esc(L.name) + '</div><div class="ln-desc">' + esc(L.desc) + '</div></div></div>' +
            '<div class="ln-bar"><i style="width:' + (L.score || 0) + '%"></i></div>' +
            '<div class="ln-meta">หลักฐานยืนยัน ' + (L.score || 0) + '% · แหล่ง ' + (L.distinct || 0) + ' ลิงก์</div>' +
            '<ul class="ln-steps">' + steps + '</ul>' + more +
            '<div class="ln-row"><button type="button" class="ln-btn" data-shelf-open="' + esc(L.dir) + '">เปิดในห้องสมุด</button></div>' +
            '</div>';
    }

    /* Put the learned skill into the chat as a message: the card for the person, the plain steps for the bots. */
    function announce(info) {
        if (typeof session === 'undefined' || !session || !Array.isArray(session.messages)) return;
        var r = info.report, dir = info.path.replace(/Skill\.md$/, '');
        var ok = r.steps.filter(function (s) { return s.hits.length; });
        var lines = ok.slice(0, 6).map(function (s, i) { return (i + 1) + '. ' + s.text; });
        var text = '[เรียนรู้ใหม่] ' + info.name + ' — ' + info.desc + '\n' +
            'ผลสอบ: ' + VERDICT[r.verdict][0] + ' (หลักฐาน ' + r.score + '%)\n' +
            (lines.length ? 'ขั้นตอนที่ยืนยันจากแหล่งแล้ว:\n' + lines.join('\n') : '') +
            (r.cautions.length ? '\nข้อควรระวัง: ' + r.cautions.filter(function (c) { return c.hits.length; }).slice(0, 3).map(function (c) { return c.text; }).join(' / ') : '');
        session.messages.push({
            sender: 'nino', kind: 'learned', action: 'explain', ts: Date.now(), reply: text,
            learned: { name: info.name, desc: info.desc, verdict: r.verdict, score: r.score, steps: r.steps, distinct: new Set(r.used).size, dir: dir }
        });
        if (typeof renderMessages === 'function') renderMessages();
    }

    document.addEventListener('click', function (e) {
        var b = e.target && e.target.closest && e.target.closest('[data-shelf-open]');
        if (!b || !window.ninoShelf) return;
        window.ninoShelf.openBook(b.getAttribute('data-shelf-open'));
    });

    window.ninoLearn = { grade: grade, recheck: recheck, save: save, readExam: readExam, announce: announce, cardHtml: cardHtml, sprite: sprite, BOOK: BOOK, VERDICT: VERDICT, norm: norm };
})();
