/* เพลงสั้น (ไม่ใช้เบราว์เซอร์): ลิงก์เพลย์ลิสต์ การเล่นเพลย์ลิสต์ การวางกรอบวิดีโอให้ไม่โดนขอบจอ ปุ่มขยายจอ และการจำค่า
 * รัน: node tools/test/music-playlist.test.js */
const fs = require('fs'), vm = require('vm');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../js/music.js'), 'utf8');
const ORIGIN = 'https://www.youtube-nocookie.com';
const PL = 'PLIa05JMgYhhZwUEbl-hf9sFmewPYnOo5f';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } };

class El {
  constructor(tag, reg) { this.tag = tag; this.reg = reg; this.attrs = {}; this.listeners = {}; this.style = { cssText: '', width: '', left: '', setProperty: () => {} }; this._cls = new Set(); this._text = ''; this._inner = ''; this.id = ''; this.parentNode = { insertBefore: (c) => reg.add(c) }; this.nextSibling = null; this.value = ''; this.children = []; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._inner; }
  set innerHTML(h) {
    this._inner = h;
    const re = /<(\w+)([^>]*)>/g; let m;
    while ((m = re.exec(h))) {
      const a = m[2], idm = /id="([^"]+)"/.exec(a), actm = /data-act="([^"]+)"/.exec(a);
      if (idm) { const e = new El(m[1], this.reg); e.id = idm[1]; this.reg.byId[idm[1]] = e; }
      if (actm && !this.reg.act[actm[1]]) { const e = new El(m[1], this.reg); e.attrs['data-act'] = actm[1]; this.reg.act[actm[1]] = e; }
    }
  }
  get classList() { const s = this._cls; return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), toggle: (c, f) => { const on = f === undefined ? !s.has(c) : !!f; on ? s.add(c) : s.delete(c); return on; } }; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  fire(t, ev) { (this.listeners[t] || []).forEach(f => f(ev)); }
  querySelector(sel) { const m = /\[data-act="([^"]+)"\]/.exec(sel); if (m) return this.reg.act[m[1]] || null; const i = /#([\w-]+)/.exec(sel); return i ? (this.reg.byId[i[1]] || null) : null; }
  closest(sel) { return sel === '[data-act]' && this.attrs['data-act'] !== undefined ? this : null; }
  appendChild(c) { this.children.push(c); if (c.id) this.reg.byId[c.id] = c; return c; }
  insertBefore(c) { if (c.id) this.reg.byId[c.id] = c; return c; }
  getBoundingClientRect() { return { left: 0, top: 0, right: this.reg.btnRight, bottom: 40, width: 200, height: 20 }; }
  setPointerCapture() { }
  remove() { }
  focus() { }
}

function boot(initialQueue, initialOpt) {
  const reg = { byId: {}, act: {}, btnRight: 200 };
  const sent = [], toasts = [], intervals = [], timers = [], winL = [], resL = [];
  const storage = new Map([['nino.music.q', JSON.stringify(initialQueue)]]);
  if (initialOpt) storage.set('nino.music.opt', JSON.stringify(initialOpt));
  const localStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) };
  const document = {
    hidden: false,
    body: new El('body', reg),
    getElementById: (id) => reg.byId[id] || null,
    createElement: (tag) => {
      const e = new El(tag, reg);
      if (tag === 'iframe') {
        let s = '';
        Object.defineProperty(e, 'src', { get: () => s, set: (v) => { s = v; (e.listeners.load || []).forEach(f => f({})); } });
        e.contentWindow = { postMessage: (m) => sent.push(JSON.parse(m)) };
      }
      return e;
    },
    addEventListener: () => { },
    querySelector: (sel) => { const m = /\[data-act="([^"]+)"\]/.exec(sel); return m ? (reg.act[m[1]] || null) : null; }
  };
  document.body.appendChild = function (c) { if (c.id) reg.byId[c.id] = c; return c; };
  reg.byId['fb-b'] = new El('button', reg);
  reg.byId['fb-b'].parentNode = { insertBefore: (c) => { if (c.id) reg.byId[c.id] = c; } };
  const ctx = {
    console, JSON, Math, String, Number, Array, Object, Map, Set, Promise, URL, encodeURIComponent,
    document, localStorage, innerWidth: 400, innerHeight: 800,
    location: { protocol: 'https:', origin: 'https://appassets.androidplatform.net' },
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    clearInterval: () => { },
    setTimeout: (fn, ms) => { const id = timers.length + 1; timers.push({ id, fn, ms }); return id; },
    clearTimeout: (id) => { const t = timers.find(x => x.id === id); if (t) t.dead = true; },
    toast: (m) => toasts.push(m),
    addEventListener: (t, f) => { if (t === 'message') winL.push(f); if (t === 'resize') resL.push(f); }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  intervals[0]();
  return {
    ctx, reg, sent, storage, winL, resL,
    fire: (data) => winL.forEach(f => f({ origin: ORIGIN, data: JSON.stringify(data) })),
    frame: () => reg.byId['nino-yt'] || null,
    panelClick: (act) => (reg.byId['music-panel'].listeners.click || [])[0]({ target: reg.act[act] }),
    st: () => ctx.ninoMusic.state(),
    txt: (id) => reg.byId[id].textContent,
  };
}

// 1) การแยกลิงก์เพลย์ลิสต์
{
  const h = boot([]);
  const p = h.ctx.ninoMusic.parse;
  ok(p('https://youtube.com/playlist?list=' + PL + '&si=aKRAhfx6SpXtGZS3') .join() === 'list:' + PL, 'playlist link from the user (with si=) becomes one list item');
  ok(p('https://www.youtube.com/playlist?list=' + PL)[0] === 'list:' + PL, 'www.youtube.com playlist link');
  ok(p('https://www.youtube.com/watch?list=' + PL)[0] === 'list:' + PL, 'watch?list= without v is a playlist');
  ok(p('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=' + PL)[0] === 'dQw4w9WgXcQ', 'watch?v=…&list=… stays a single video (existing behaviour)');
  ok(p('https://youtu.be/dQw4w9WgXcQ')[0] === 'dQw4w9WgXcQ', 'youtu.be video still works');
  ok(p('https://youtube.com/playlist?list=short').length === 0, 'playlist id that is too short is refused');
  ok(p('https://example.com/playlist?list=' + PL).length === 0, 'other domains are refused');
  const mixed = p('https://youtu.be/dQw4w9WgXcQ https://youtube.com/playlist?list=' + PL + ' https://youtu.be/dQw4w9WgXcQ');
  ok(mixed.length === 2 && mixed[0] === 'dQw4w9WgXcQ' && mixed[1] === 'list:' + PL, 'mixed paste keeps order and drops duplicates');
}

// 2) การโหลดคิวที่เก็บไว้: เพลงเดิมคงอยู่ เพลย์ลิสต์คงอยู่ ค่าเพี้ยนถูกตัด
{
  const h = boot(['dQw4w9WgXcQ', 'list:' + PL, 'list:bad', 'junk', 42]);
  const s = h.ctx.ninoMusic.state();
  ok(s.n === 2, 'restored queue keeps 2 valid items, got ' + s.n);
}

// 3) เล่นเพลย์ลิสต์ใช้เครื่องเล่นของรายการ และไม่เลื่อนเพลงเองเมื่อยังมีเพลงในรายการ
{
  const h = boot(['list:' + PL, 'aaaaaaaaaaa']);
  h.ctx.ninoMusic.play(0);
  ok(h.frame().src.indexOf('/embed/videoseries?list=' + PL) >= 0, 'playlist uses the videoseries embed, got ' + h.frame().src);
  ok(/autoplay=1/.test(h.frame().src), 'playlist starts with autoplay in audio mode');
  h.fire({ event: 'infoDelivery', info: { playerState: 1, currentTime: 3, duration: 200, muted: false, videoData: { title: 'ชื่อเพลงในลิสต์', video_id: 'x1' } } });
  ok(h.txt('mp-title') === 'ชื่อเพลงในลิสต์', 'playlist shows the playing track name');
  h.fire({ event: 'infoDelivery', info: { playerState: 0, playlistIndex: 0, playlist: ['x1', 'x2', 'x3'] } });
  ok(h.st().i === 0 && h.st().state !== 'idle', 'track ends inside the playlist: the player moves on, the app does not skip the list');
  h.fire({ event: 'infoDelivery', info: { playerState: 0, playlistIndex: 2, playlist: ['x1', 'x2', 'x3'] } });
  ok(h.st().i === 1, 'last track of the playlist ends: the queue moves to the next item');
}

// 4) ลิงก์เพลย์ลิสต์ในกล่องวาง และข้อความลิงก์ที่ส่งกลับไปแก้ไขได้
{
  const h = boot(['list:' + PL]);
  h.panelClick('edit');
  ok(h.reg.byId['ms-text'].value.indexOf('https://www.youtube.com/playlist?list=' + PL) === 0, 'editor shows the playlist as a playlist link, got ' + h.reg.byId['ms-text'].value);
}

// 5) กรอบวิดีโอต้องไม่โดนขอบจอซ้ายกิน (หนีบขอบซ้ายไว้ที่ GUT=10)
{
  const h = boot(['aaaaaaaaaaa']);
  h.ctx.ninoMusic.play(0);
  h.panelClick('watch');
  const css = h.frame().style.cssText;
  ok(/left:10px/.test(css) && !/right:/.test(css), 'button near the left edge: frame is clamped to left:10px (no clipping), got ' + css);
  ok(/width:340px/.test(css) && /height:191px/.test(css), '340px wide, 16:9 height 191px');
  ok(!/top:(-)/.test(css), 'top is never negative');
}
{
  const h = boot(['aaaaaaaaaaa']);
  h.ctx.innerWidth = 1000;
  h.reg.btnRight = 900;
  h.ctx.ninoMusic.play(0);
  h.panelClick('watch');
  const css = h.frame().style.cssText;
  ok(/left:(\d+)px/.test(css) && Number(/left:(\d+)px/.exec(css)[1]) === 900 - 340, 'button on the right: frame right edge lines up with the button, got ' + css);
  ok(/width:340px/.test(css), 'normal size stays 340px');
}

// 6) ปุ่มขยายจอ: ใหญ่ขึ้น ยังอยู่ในจอ จำค่าไว้ และนำไปใช้ทันที
{
  const h = boot(['aaaaaaaaaaa']);
  h.ctx.innerWidth = 1000;
  h.reg.btnRight = 900;
  h.ctx.ninoMusic.play(0);
  h.panelClick('watch');
  h.panelClick('expand');
  const css = h.frame().style.cssText;
  ok(/width:480px/.test(css) && /height:270px/.test(css), 'expanded frame is 480x270, got ' + css);
  ok(/left:420px/.test(css), 'expanded frame stays inside the screen (left 420 = 900-480)');
  ok(JSON.parse(h.storage.get('nino.music.opt')).big === true, 'expand choice is remembered');
  ok(h.reg.act['expand'].getAttribute('aria-pressed') === 'true', 'expand button reports pressed');
  h.panelClick('expand');
  ok(/width:340px/.test(h.frame().style.cssText), 'pressing again returns to normal size');
  ok(JSON.parse(h.storage.get('nino.music.opt')).big === false, 'normal size is remembered too');
}
{
  const h = boot(['aaaaaaaaaaa'], { rep: false, vol: 100, big: true });
  h.ctx.innerWidth = 1000;
  h.reg.btnRight = 900;
  h.ctx.ninoMusic.play(0);
  h.panelClick('watch');
  ok(/width:480px/.test(h.frame().style.cssText), 'saved big size is used when watch starts after reload');
}

// 7) ขนาดจอแคบ: ขยายแล้วไม่ล้นจอ และหมุนจอแล้วกรอบปรับตาม
{
  const h = boot(['aaaaaaaaaaa'], { big: true });
  h.ctx.innerWidth = 360;
  h.reg.btnRight = 340;
  h.ctx.ninoMusic.play(0);
  h.panelClick('watch');
  const css = h.frame().style.cssText;
  const w = Number(/width:(\d+)px/.exec(css)[1]);
  const left = Number(/left:(-?\d+)px/.exec(css)[1]);
  ok(w <= 360 - 20 && left >= 10 && left + w <= 360 - 10, 'phone width 360: big frame fits with gutters, got w=' + w + ' left=' + left);
  h.ctx.innerWidth = 300;
  h.resL.forEach(f => f({}));
  const css2 = h.frame().style.cssText;
  const w2 = Number(/width:(\d+)px/.exec(css2)[1]);
  ok(w2 <= 300 - 20, 'after rotate/resize the frame re-fits, got ' + w2);
}

// 8) ไม่มีเพลงในคิวหรือไม่ได้เปิดดู: ไม่มีกรอบวิดีโอค้าง
{
  const h = boot(['aaaaaaaaaaa']);
  h.panelClick('watch');
  ok(!h.frame() || h.st().state === 'idle', 'watch with nothing playing does not show a frame');
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
