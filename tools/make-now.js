#!/usr/bin/env node
/* Builds NOW.md: the one file that says what is true about NINO right now.
   Everything in it is read from the code (version.js, index.html, github-agent.js, skills/ ...) or from tools/file-roles.json,
   so it cannot disagree with the code for long. No line counts, sizes or dates: an ordinary edit must not make it stale.
   usage: node tools/make-now.js            write NOW.md
          node tools/make-now.js --check    exit 1 if NOW.md is not what the code says
          node tools/make-now.js --root DIR  operate on another tree */
const fs = require('fs'), path = require('path');

function readIf(root, p) { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch (e) { return null; } }
function walk(root, dir, out) {
  out = out || [];
  let ents = [];
  try { ents = fs.readdirSync(path.join(root, dir), { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const rel = dir ? dir + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!/^(\.git|node_modules|build|\.gradle)$/.test(e.name)) walk(root, rel, out); } else out.push(rel);
  }
  return out;
}
function uniq(a) { return Array.from(new Set(a)); }

function protectedSource(root) {
  const t = readIf(root, 'github-agent.js') || '';
  const m = /var PROT=\/\^\((.*?)\)\/;/.exec(t);
  return m ? m[1] : null;
}
function protectedRegex(root) {
  const s = protectedSource(root);
  return s ? new RegExp('^(' + s + ')') : null;
}

function roleFor(roles, rel) {
  if (roles[rel] !== undefined) return roles[rel];
  let best = null;
  for (const k of Object.keys(roles)) if (k.endsWith('/') && rel.startsWith(k) && (!best || k.length > best.length)) best = k;
  return best ? roles[best] : null;
}

function tools(root) {
  const ga = readIf(root, 'github-agent.js') || '';
  const gh = uniq([...ga.matchAll(/\bT\.(gh_\w+)\s*=/g)].map(m => m[1]));
  const sl = readIf(root, 'skill-lib.js') || '';
  const m1 = /TOOLS=\/\^\(([^)]*)\)\$\//.exec(sl);
  const lib = m1 ? m1[1].split('|') : [];
  const cf = readIf(root, 'js/code-fast.js') || '';
  const fast = uniq([...cf.matchAll(/\bn==='([a-z_]+)'/g)].map(m => m[1]).filter(n => n !== 'replace_function'));
  const ms = readIf(root, 'js/modes-session.js') || '';
  const m2 = /const COMMON_TOOLS = \/\^\(([^)]*)\)\$\//.exec(ms);
  const common = m2 ? m2[1].split('|') : [];
  const dl = readIf(root, 'js/delegate.js') || '';
  const del = /call\.name === '(\w+)'/.exec(dl);
  const diag = uniq([...(readIf(root, 'js/lib-health.js') || '').matchAll(/c\.name === '(\w+)'/g), ...(readIf(root, 'js/prompt-cache.js') || '').matchAll(/c\.name === '(\w+)'/g)].map(m => m[1]));
  return { gh, lib, fast, common, delegate: del ? [del[1]] : [], diag };
}

function providers(root) {
  const c = readIf(root, 'js/config.js') || '';
  const tb = /const TOKENME_BASE = '([^']+)'/.exec(c), tm = /const TOKENME_MODELS = \[([^\]]*)\]/.exec(c);
  const nb = /(https:\/\/gateway[^']+)'/.exec(c), nm = /ninearmModel:\s*'([^']+)'/.exec(c);
  return {
    tokenme: tb ? tb[1] : '?', tokenmeModels: tm ? [...tm[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [],
    ninearm: nb ? nb[1] : '?', ninearmModel: nm ? nm[1] : '?'
  };
}

function library(root) {
  const keys = walk(root, 'skills').filter(f => /^skills\/[^/]+\/[^/]+\/[^/]+\/Skill\.md$/.test(f)).sort();
  const title = (p, d) => { const v = readIf(root, p); return v ? (v.split('\n')[0].trim() || d) : d; };
  const o = []; let lc = '', ls = '';
  for (const k of keys) {
    const p = k.split('/'), c = p[1], s = p[2];
    if (c !== lc) { o.push('## ' + c + ' · ' + title('skills/' + c + '/_title.md', c)); lc = c; ls = ''; }
    if (s !== ls) { o.push('### ' + s + ' · ' + title('skills/' + c + '/' + s + '/_title.md', s)); ls = s; }
    o.push('- ' + p[3] + ' — ' + ((readIf(root, k) || '').split('\n')[1] || '').trim());
  }
  const gt = (readIf(root, 'skills/_gates.md') || '').split('\n').filter(l => l.trim() && l.charAt(0) !== '#' && l.indexOf('|') > 0);
  if (gt.length) { o.push('## ประตูตัดสินใจ — หลายเล่มคล้ายกัน ใช้เงื่อนไขแรกที่ตรง'); gt.forEach(l => o.push('- ' + l.trim())); }
  return o;
}

function libraryCompact(root) {
  const keys = walk(root, 'skills').filter(f => /^skills\/[^/]+\/[^/]+\/[^/]+\/Skill\.md$/.test(f)).sort(), g = {};
  for (const k of keys) { const p = k.split('/'); (g[p[1] + '/' + p[2]] = g[p[1] + '/' + p[2]] || []).push(p[3]); }
  return Object.keys(g).sort().map(s => '- ' + s + ': ' + g[s].join(', '));
}

function build(root) {
  const ver = readIf(root, 'version.js') || '';
  const V = (/NINO_VERSION='([^']+)'/.exec(ver) || [])[1] || '?', G = (/NINO_GEN=(\d+)/.exec(ver) || [])[1] || '?';
  const prot = protectedRegex(root), psrc = protectedSource(root);
  const roles = JSON.parse(readIf(root, 'tools/file-roles.json') || '{}');
  const files = walk(root, '');
  const lock = (rel) => (prot && prot.test(rel) ? '[ล็อก] ' : '');
  const L = [];
  L.push('# NOW — สถานะจริงของ NINO');
  L.push('สร้างอัตโนมัติโดย `node tools/make-now.js` จากโค้ดในรีโป ห้ามแก้มือ · ขัดกับโค้ดจริง = ยึดโค้ด แล้วให้ผู้ใช้รัน `node tools/make-now.js`');
  L.push('รุ่นกำเนิด Gen ' + G + ' · เลขเวอร์ชันล่าสุดอ่านจาก version.js (ไฟล์นี้ไม่เก็บเลขที่เปลี่ยนทุก commit)');
  L.push('');
  L.push('## อ่านอะไรเมื่อไหร่');
  L.push('- ก่อนเริ่มงานทุกครั้ง: ไฟล์นี้ (แผนที่+ด่าน+เครื่องมือ) และ Skill.md (กติกา ถูกแนบในพรอมต์อยู่แล้ว)');
  L.push('- ถูกถาม "ทำไมเป็นแบบนี้": DECISIONS.md · ถูกถามประวัติ: CHANGES.md · ไม่ต้องอ่านทั้งสองโดยไม่จำเป็น');
  L.push('- งานที่มีสกิลตรงเรื่อง: skill_read {name} (รายการอยู่ท้ายไฟล์นี้)');
  L.push('');
  L.push('## เลขรุ่นหมายถึงอะไร');
  L.push('- Gen = รุ่นกำเนิด เพิ่มเมื่อ "เกิดใหม่" (รื้อรวบรวมโค้ด แล้วผ่านเทสต์ความสามารถเดิมครบ) · เลขเวอร์ชัน = ขั้นของรุ่นนั้น (bump อัตโนมัติเมื่อ commit ไฟล์รันไทม์) · build = วันที่');
  L.push('- OTA เทียบความใหม่ด้วยเลข run ของ CI ไม่ใช่เลขเวอร์ชัน (js/ota.js isNewer) · ชื่อแคชเว็บ = nino-v<เวอร์ชัน>-g<Gen> จึงไม่ชนกันแม้เริ่มเลขใหม่ในรุ่นถัดไป');
  L.push('');
  L.push('## ไฟล์ป้องกัน [ล็อก]');
  L.push('แตะแล้ว `gh_commit` ต้องส่ง `confirm:true` และผู้ใช้ต้องกดอนุมัติในแอปเอง (ด่านอยู่ใน github-agent.js ซึ่งป้องกันตัวเองด้วย) · ตัวตรวจ (tools/check.js, tools/test/) ก็อยู่ในรายการนี้ — AI แก้ตัวตรวจของตัวเองลำพังไม่ได้');
  L.push(psrc ? psrc.split('|').map(s => '`' + s.replace(/\\\./g, '.').replace(/\\\//g, '/') + '`').join(' · ') : '(อ่านรายการจาก github-agent.js ไม่ได้)');
  L.push('');
  L.push('## ลำดับโหลด script (index.html)');
  const html = readIf(root, 'index.html') || '';
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]).filter(s => !/^https?:/.test(s)).map(s => s.replace(/^\.\//, ''));
  L.push(srcs.map((s, i) => (i + 1) + '. ' + s).join('  \n'));
  L.push('');
  L.push('## แผนที่ไฟล์ (บทบาทมาจาก tools/file-roles.json · เพิ่มไฟล์ใหม่ต้องเพิ่มบรรทัดที่นั่น)');
  L.push('| ไฟล์ | บทบาท |');
  L.push('|---|---|');
  const rows = [];
  for (const f of files) {
    if (/^(js|local-ai)\//.test(f) || !f.includes('/')) rows.push(f);
    else if (/^tools\/[^/]+$/.test(f)) rows.push(f);
  }
  rows.push('NOW.md');
  for (const k of Object.keys(roles)) if (k.endsWith('/')) rows.push(k);
  uniq(rows).sort((a, b) => {
    const ra = a.includes('/') ? 1 : 0, rb = b.includes('/') ? 1 : 0;
    return ra - rb || (a < b ? -1 : a > b ? 1 : 0);
  }).forEach(f => {
    const r = roleFor(roles, f);
    L.push('| ' + lock(f) + '`' + f + '` | ' + (r || 'ยังไม่มีบทบาท — เพิ่มใน tools/file-roles.json') + ' |');
  });
  L.push('');
  const T = tools(root);
  L.push('## เครื่องมือของ AI (อ่านจากโค้ด)');
  L.push('- รีโป GitHub: ' + (T.gh.join(' ') || '?'));
  L.push('- หอสมุด/ไฟล์: ' + (T.lib.join(' ') || '?'));
  L.push('- ทางลัดแก้โค้ด: ' + (T.fast.join(' ') || '?'));
  L.push('- สมุดงาน/แผน/Skill.md: ' + (T.common.join(' ') || '?'));
  L.push('- ฝากงานโมเดลถูก: ' + (T.delegate.join(' ') || '?') + ' (ใช้ได้เมื่อตั้งคีย์ 9arm หรือ TokenMe)');
  L.push('- ตรวจสุขภาพ: ' + (T.diag.join(' ') || '?') + ' (ผู้ใช้: `nino lib` `nino cache` ในเทอร์มินัล · เรียกสกิลเองด้วย /ชื่อเล่ม ในแชท)');
  L.push('');
  const P = providers(root);
  L.push('## ผู้ให้บริการโมเดล');
  L.push('- Gemini (ค่าเริ่มต้น) · Local AI (OpenAI-compatible บนเครื่อง/เครือข่าย)');
  L.push('- 9arm: ' + P.ninearm + ' · โมเดลเริ่มต้น ' + P.ninearmModel);
  L.push('- TokenMe: ' + P.tokenme + ' · โมเดล ' + (P.tokenmeModels.join(', ') || '?'));
  L.push('');
  L.push('## ด่านตรวจ (รันก่อนส่งงานเสมอ)');
  L.push('- `node tools/check.js` ด่านสถิต (เพิ่ม `--strict` = เอกสาร/แมนิเฟสต์ที่สร้างอัตโนมัติต้องตรงเป๊ะ) · `node tools/test/web.test.js` · `node tools/test/browser.test.js` (ต้องมี Playwright) · `node tools/make-now.js`');
  L.push('- หลังเพิ่ม/ลบไฟล์ หรือเปลี่ยนเครื่องมือ: `node tools/make-now.js && python3 tools/make-manifests.py`');
  L.push('');
  L.push('## หอสมุดสกิล (หมวด/ชั้น: เล่ม)');
  L.push('คำอธิบายแต่ละเล่มและประตูตัดสินใจอยู่ในสารบัญสกิลของพรอมต์ (และ `skills/_gates.md`) — ไม่ซ้ำที่นี่เพื่อไม่ให้ไฟล์นี้อ้วน ตรวจสุขภาพด้วย `nino lib` / `lib_health`');
  L.push(...libraryCompact(root));
  return L.join('\n') + '\n';
}

module.exports = { build, roleFor, walk, protectedRegex, tools, library, libraryCompact };

if (require.main === module) {
  const ri = process.argv.indexOf('--root');
  const ROOT = path.resolve(ri > 0 ? process.argv[ri + 1] : path.join(__dirname, '..'));
  const out = build(ROOT);
  if (process.argv.includes('--check')) {
    const cur = readIf(ROOT, 'NOW.md');
    if (cur === out) { console.log('NOW.md ตรงกับโค้ด'); process.exit(0); }
    console.log('NOW.md ไม่ตรงกับโค้ด — รัน: node tools/make-now.js');
    process.exit(1);
  }
  fs.writeFileSync(path.join(ROOT, 'NOW.md'), out);
  console.log('เขียน NOW.md แล้ว (' + out.length + ' ตัวอักษร)');
}
