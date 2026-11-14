/* Library as shelves: categories are walls, shelves are planks, books stand with their notebooks beside them.
   Opening a book shows the skill page on the left, the notebook on the right, and the exam below. */
(function () {
    'use strict';
    var L = function () { return window.ninoLib && window.ninoLib.fs; };
    var LEARN = function () { return window.ninoLearn; };
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    var SPINE = ['#F28AB2', '#7FE7FF', '#8FD3B0', '#F2C275', '#C9A8F5', '#F26D78', '#79C0FF', '#E9E2EE'];
    function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
    function msg(t) { if (typeof toast === 'function') toast(t); }

    function catalog() {
        var F = L(), out = [];
        if (!F) return out;
        F.keys().forEach(function (k) {
            var m = /^skills\/([^\/]+)\/([^\/]+)\/([^\/]+)\/Skill\.md$/.exec(k);
            if (!m) return;
            var text = F.read(k) || '', lines = text.split('\n');
            var dir = 'skills/' + m[1] + '/' + m[2] + '/' + m[3] + '/';
            out.push({
                cat: m[1], shelf: m[2], name: m[3], dir: dir,
                title: (lines[0] || m[3]).replace(/^#\s*/, ''),
                desc: (lines[1] || '').replace(/\[ฉบับร่าง.*$/, '').trim(),
                exam: LEARN() ? LEARN().readExam(dir) : null,
                draft: text.indexOf('ฉบับร่างจากห้องเรียน') >= 0
            });
        });
        return out;
    }
    function wallName(cat) {
        var t = (L() && L().read('skills/' + cat + '/_title.md')) || '';
        return t.split('\n')[0].replace(/^#\s*/, '') || cat;
    }

    /* Overlay shell */
    function overlay(id) {
        var o = document.getElementById(id);
        if (o) o.remove();
        o = document.createElement('div');
        o.id = id;
        o.className = 'sh-over';
        document.body.appendChild(o);
        return o;
    }
    function close() { var o = document.getElementById('nino-shelf'); if (o) o.remove(); closeBook(); }
    function closeBook() { var b = document.getElementById('nino-shelf-book'); if (b) b.remove(); }

    function verdictTag(ex) {
        if (!ex) return '<span class="sh-tag none">ยังไม่สอบ</span>';
        var map = { pass: ['ผ่าน', '#8FD3B0'], partial: ['บางส่วน', '#F2C275'], fail: ['ไม่ผ่าน', '#F26D78'] }[ex.verdict] || ['?', '#A79BB3'];
        return '<span class="sh-tag" style="color:' + map[1] + ';border-color:' + map[1] + '">' + map[0] + ' ' + (ex.score || 0) + '%</span>';
    }

    function open() {
        var o = overlay('nino-shelf');
        var books = catalog();
        var cats = {};
        books.forEach(function (b) { (cats[b.cat] = cats[b.cat] || []).push(b); });
        var order = Object.keys(cats).sort();
        var head = '<header class="sh-head"><div class="sh-title"><span class="sh-logo">' + (LEARN() ? LEARN().sprite(LEARN().BOOK, '#F28AB2', 22) : '') + '</span><div><div class="sh-h1">ห้องสมุด NINO</div><div class="sh-sub">' + books.length + ' เล่ม · ' + order.length + ' หมวด · ' + books.filter(function (b) { return b.exam; }).length + ' เล่มผ่านการสอบ</div></div></div>' +
            '<div class="sh-tools"><input id="sh-q" class="sh-q" type="search" placeholder="ค้นชื่อเล่ม" aria-label="ค้นหาเล่ม"><button type="button" class="sh-x" id="sh-close">ปิด</button></div></header>';
        var body = '<main class="sh-main" id="sh-main">';
        if (!books.length) body += '<div class="sh-empty">ห้องสมุดว่าง — ให้ NINO เรียนจากห้องเรียนก่อน แล้วเล่มใหม่จะขึ้นชั้นนี้</div>';
        order.forEach(function (cat) {
            body += '<section class="sh-wall" data-cat="' + esc(cat) + '"><div class="sh-wallname"><span>' + esc(cat) + '</span> ' + esc(wallName(cat)) + '</div>';
            var shelves = {};
            cats[cat].forEach(function (b) { (shelves[b.shelf] = shelves[b.shelf] || []).push(b); });
            Object.keys(shelves).sort().forEach(function (sh) {
                body += '<div class="sh-shelf" data-shelf="' + esc(sh) + '"><div class="sh-rowlabel">' + esc(sh) + '</div><div class="sh-row">';
                shelves[sh].sort(function (a, b) { return a.name < b.name ? -1 : 1; }).forEach(function (b) {
                    var col = SPINE[hash(b.name) % SPINE.length], h = 96 + (hash(b.name) % 5) * 10;
                    body += '<div class="sh-pair" data-search="' + esc((b.title + ' ' + b.name + ' ' + b.desc).toLowerCase()) + '">' +
                        '<button type="button" class="sh-book" data-open="' + esc(b.dir) + '" style="--c:' + col + ';--h:' + h + 'px" title="' + esc(b.title) + '">' +
                        '<span class="sh-spine">' + esc(b.title) + '</span>' + (b.draft ? '<span class="sh-draft" title="ฉบับร่างจากห้องเรียน"></span>' : '') +
                        '<span class="sh-dot" style="background:' + (b.exam ? (b.exam.verdict === 'pass' ? '#8FD3B0' : b.exam.verdict === 'partial' ? '#F2C275' : '#F26D78') : '#4A3D5C') + '"></span></button>' +
                        '<button type="button" class="sh-nb" data-nb="' + esc(b.dir) + '" title="สมุดจดของ ' + esc(b.name) + '"><span class="sh-nb-rings"></span><span class="sh-nb-label">จด</span></button></div>';
                });
                body += '</div><div class="sh-plank"></div></div>';
            });
            body += '</section>';
        });
        body += '</main>';
        o.innerHTML = head + body;
        o.querySelector('#sh-close').onclick = close;
        o.querySelector('#sh-q').oninput = function (e) {
            var q = e.target.value.trim().toLowerCase();
            o.querySelectorAll('.sh-pair').forEach(function (p) { p.style.display = !q || p.getAttribute('data-search').indexOf(q) >= 0 ? '' : 'none'; });
        };
        o.addEventListener('click', function (e) {
            var bk = e.target.closest('[data-open]'), nb = e.target.closest('[data-nb]');
            if (bk) openBook(bk.getAttribute('data-open'), 'skill');
            else if (nb) openBook(nb.getAttribute('data-nb'), 'notebook');
        });
    }

    /* Minimal, safe markdown for the skill page (escaped first, no HTML from the file). */
    function md(text) {
        var out = [], inCode = false, code = [], inList = false;
        function endList() { if (inList) { out.push('</ul>'); inList = false; } }
        String(text || '').split('\n').forEach(function (raw) {
            if (/^```/.test(raw)) {
                if (inCode) { out.push('<pre class="sh-code">' + esc(code.join('\n')) + '</pre>'); code = []; inCode = false; }
                else { endList(); inCode = true; }
                return;
            }
            if (inCode) { code.push(raw); return; }
            var l = raw.trim();
            if (!l) { endList(); return; }
            if (/^#\s/.test(l)) { endList(); out.push('<h2 class="sh-h2">' + esc(l.replace(/^#\s*/, '')) + '</h2>'); return; }
            if (/^##\s/.test(l)) { endList(); out.push('<h3 class="sh-h3">' + esc(l.replace(/^##\s*/, '')) + '</h3>'); return; }
            if (/^[-*]\s/.test(l) || /^\d+\.\s/.test(l)) { if (!inList) { out.push('<ul class="sh-ul">'); inList = true; } out.push('<li>' + esc(l.replace(/^([-*]|\d+\.)\s*/, '')) + '</li>'); return; }
            if (/^หลักฐาน/.test(l)) { endList(); out.push('<div class="sh-ev">' + esc(l) + '</div>'); return; }
            endList(); out.push('<p>' + esc(l) + '</p>');
        });
        endList();
        if (inCode) out.push('<pre class="sh-code">' + esc(code.join('\n')) + '</pre>');
        return out.join('');
    }

    function examHtml(ex, dir) {
        if (!ex) return '<div class="sh-exam-empty">เล่มนี้ยังไม่มีผลสอบ (มาจากคลังเดิมหรือสร้างเอง) เรียนหัวข้อเดิมใหม่จากห้องเรียนเพื่อให้มีผลสอบ</div>';
        var v = LEARN().VERDICT[ex.verdict] || LEARN().VERDICT.fail;
        var checks = (ex.checks || []).map(function (c) {
            return '<li class="' + (c.ok ? 'ok' : 'no') + '"><span class="sh-box">' + (c.ok ? '✓' : '✗') + '</span><span>' + esc(c.k) + '<i>' + esc(c.detail) + '</i></span></li>';
        }).join('');
        var steps = (ex.steps || []).map(function (s, i) {
            var ok = s.hits && s.hits.length;
            return '<li class="' + (ok ? 'ok' : 'no') + '"><span class="sh-box">' + (ok ? '✓' : '✗') + '</span><span>' + esc(s.text) + (ok ? '<i>แหล่ง ' + s.hits.join(', ') + '</i>' : '<i>ไม่มีข้อความรองรับ</i>') + '</span></li>';
        }).join('');
        var srcs = (ex.sources || []).map(function (s) {
            return '<li><b>[' + s.n + ']</b> ' + esc(s.title || s.src) + (s.url ? ' <a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.url.replace(/^https?:\/\//, '').slice(0, 48)) + '</a>' : '') + '</li>';
        }).join('');
        return '<div class="sh-exam">' +
            '<div class="sh-exam-top"><span class="sh-stamp" style="color:' + v[1] + ';border-color:' + v[1] + '">' + v[0] + '</span><span class="sh-score">หลักฐาน ' + (ex.score || 0) + '%</span><span class="sh-at">' + esc((ex.at || '').slice(0, 16).replace('T', ' ')) + '</span></div>' +
            '<div class="sh-bar"><i style="width:' + (ex.score || 0) + '%;background:' + v[1] + '"></i></div>' +
            '<div class="sh-note">ตรวจว่าทุกข้อ มีข้อความรองรับจากแหล่งที่ค้นมาจริง และลิงก์มาจากแหล่งนั้น ไม่ได้ยืนยันว่าแหล่งนั้นถูกต้องในโลกจริง</div>' +
            '<ul class="sh-checks">' + checks + '</ul>' +
            '<div class="sh-h4">ขั้นตอนและหลักฐาน</div><ul class="sh-steps">' + steps + '</ul>' +
            '<div class="sh-h4">แหล่งที่ค้นมา</div><ul class="sh-srcs">' + (srcs || '<li>ไม่มี</li>') + '</ul>' +
            '<div id="sh-recheck" class="sh-recheck"></div>' +
            '<div class="sh-actions"><button type="button" class="sh-btn" data-recheck="' + esc(dir) + '">ทดสอบซ้ำจากไฟล์ที่เก็บ</button></div></div>';
    }

    function openBook(dir, focus) {
        var F = L();
        if (!F || !dir) return;
        dir = String(dir).replace(/\/?$/, '/');
        var name = dir.split('/').filter(Boolean).pop();
        var skill = F.read(dir + 'Skill.md') || '';
        var nb = F.read(dir + 'notebook.md') || '';
        var ex = LEARN() ? LEARN().readExam(dir) : null;
        var b = overlay('nino-shelf-book');
        b.innerHTML = '<div class="sh-bk">' +
            '<header class="sh-head"><div class="sh-title"><div class="sh-h1">' + esc(name) + '</div><div class="sh-sub">' + esc(dir) + '</div></div><button type="button" class="sh-x" id="sh-back">‹ กลับชั้น</button></header>' +
            '<div class="sh-spread">' +
            '<section class="sh-page sh-left"><div class="sh-pagehead">หน้าสกิล · Skill.md</div><div class="sh-md">' + md(skill) + '</div></section>' +
            '<section class="sh-page sh-right"><div class="sh-pagehead">สมุดจด · notebook.md</div><textarea id="sh-nb" class="sh-nbta" spellcheck="false">' + esc(nb) + '</textarea><div class="sh-actions"><button type="button" class="sh-btn" id="sh-savenb">บันทึกสมุดจด</button></div></section>' +
            '</div>' +
            '<section class="sh-examwrap"><div class="sh-h4 big">ผลสอบตอนเรียน</div>' + examHtml(ex, dir) + '</section>' +
            '<footer class="sh-foot"><button type="button" class="sh-btn danger" id="sh-del">ลบเล่มนี้</button></footer>' +
            '</div>';
        b.querySelector('#sh-back').onclick = closeBook;
        b.querySelector('#sh-savenb').onclick = function () { F.write(dir + 'notebook.md', b.querySelector('#sh-nb').value); msg('บันทึกสมุดจดแล้ว'); };
        b.querySelector('#sh-del').onclick = function () {
            if (!window.confirm('ลบเล่ม ' + name + ' และสมุดจดคู่เล่ม?')) return;
            F.rm(dir.replace(/\/$/, ''));
            closeBook(); open(); msg('ลบ ' + name + ' แล้ว');
        };
        b.addEventListener('click', function (e) {
            var rc = e.target.closest('[data-recheck]');
            if (!rc) return;
            var r = LEARN().recheck(rc.getAttribute('data-recheck'));
            var box = b.querySelector('#sh-recheck');
            box.className = 'sh-recheck ' + (r.ok ? 'ok' : 'no');
            box.textContent = r.ok ? 'ทดสอบซ้ำผ่าน: ทุกหลักฐานยังอยู่ในแหล่งที่เก็บและในหนังสือ' : 'ทดสอบซ้ำไม่ผ่าน: ' + r.broken.slice(0, 4).join(' · ');
        });
        if (focus === 'notebook') { var ta = b.querySelector('#sh-nb'); if (ta) ta.focus(); }
    }

    window.ninoShelf = { open: open, openBook: openBook, close: close };
})();
