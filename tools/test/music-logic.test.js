/* Music player logic without a browser: a small fake DOM runs js/music.js. Run: node tools/test/music-logic.test.js */
const fs = require('fs'), vm = require('vm');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../js/music.js'), 'utf8');
const ORIGIN = 'https://www.youtube-nocookie.com';
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
  getBoundingClientRect() { return { left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 20 }; }
  setPointerCapture() { }
  remove() { }
  focus() { }
}

const reg = { byId: {}, act: {} };
const sent = [], toasts = [], intervals = [], timers = [], winL = [];
const storage = new Map([
  ['nino.music.q', JSON.stringify(['dQw4w9WgXcQ', 'aaaaaaaaaaa'])]
]);
const localStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) };

const document = {
  hidden: false,
  body: new El('body', reg),
  getElementById: (id) => reg.byId[id] || null,
  createElement: (tag) => {
    const e = new El(tag, reg);
    if (tag === 'iframe') {
      let s = '';
      Object.defineProperty(e, 'src', {
        get: () => s,
        set: (v) => { s = v; (e.listeners.load || []).forEach(f => f({})); }
      });
      e.contentWindow = { postMessage: (m) => sent.push(JSON.parse(m)) };
    }
    return e;
  },
  addEventListener: () => { },
  querySelector: () => null
};
document.body.appendChild = function (c) { if (c.id) reg.byId[c.id] = c; return c; };
reg.byId['fb-b'] = new El('button', reg);
reg.byId['fb-b'].parentNode = { insertBefore: (c) => { if (c.id) reg.byId[c.id] = c; } };

const ctx = {
  console, JSON, Math, String, Number, Array, Object, Map, Set, Promise, URL, encodeURIComponent,
  document, localStorage, innerWidth: 400,
  location: { protocol: 'https:', origin: 'https://appassets.androidplatform.net' },
  setInterval: (fn) => { intervals.push(fn); return intervals.length; },
  clearInterval: () => { },
  setTimeout: (fn, ms) => { const id = timers.length + 1; timers.push({ id, fn, ms }); return id; },
  clearTimeout: (id) => { const t = timers.find(x => x.id === id); if (t) t.dead = true; },
  toast: (m) => toasts.push(m),
  addEventListener: (t, f) => { if (t === 'message') winL.push(f); }
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(SRC, ctx);

const fire = (data) => winL.forEach(f => f({ origin: ORIGIN, data: JSON.stringify(data) }));
const runTimers = (ms) => timers.filter(t => t.ms === ms && !t.dead && !t.ran).forEach(t => { t.ran = true; t.fn(); });
const st = () => ctx.ninoMusic.state();
const frameSrc = () => reg.byId['nino-yt'] ? reg.byId['nino-yt'].src : '';
const txt = (id) => reg.byId[id].textContent;
const HIDDEN_MARK = 'opacity:.01';

try {
  console.log('== mount');
  intervals[0]();
  ok(!!reg.byId['music-panel'] && !!reg.byId['music-btn'], 'button and panel mounted');

  console.log('== parse');
  ok(ctx.ninoMusic.ytId('https://youtu.be/dQw4w9WgXcQ?si=x') === 'dQw4w9WgXcQ', 'short link parses');

  console.log('== play starts in loading, watch stays hidden');
  ctx.ninoMusic.play(0);
  ok(st().state === 'loading', 'state is loading, not playing, right after play');
  ok(/autoplay=1/.test(frameSrc()) && /controls=0/.test(frameSrc()), 'audio mode embed: autoplay=1, controls=0');
  ok(reg.byId['nino-yt'].style.cssText.includes(HIDDEN_MARK), 'audio mode keeps the player hidden');
  fire({ event: 'infoDelivery', info: { playerState: -1, currentTime: 0, duration: 0 } });
  ok(st().state === 'loading', 'unstarted (-1) does not fake playing');

  console.log('== watchdog: blocked autoplay falls back to visible player with controls');
  runTimers(9000);
  ok(st().state === 'paused', 'blocked start becomes paused');
  ok(/autoplay=0/.test(frameSrc()) && /controls=1/.test(frameSrc()), 'fallback embed has controls and no autoplay');
  ok(!reg.byId['nino-yt'].style.cssText.includes(HIDDEN_MARK), 'fallback makes the video visible');
  ok(toasts.some(m => m.includes('กดปุ่มเล่นในกรอบวิดีโอ')) || /กดปุ่มเล่น/.test(reg.byId['mp-msg'].textContent), 'user gets a message');

  console.log('== real playback: title, muted fix, time readout');
  fire({ event: 'infoDelivery', info: { playerState: 1, currentTime: 10, duration: 200, muted: true, videoData: { title: 'Test Song', video_id: 'dQw4w9WgXcQ' } } });
  ok(st().state === 'playing', 'playerState 1 sets playing');
  ok(sent.some(m => m.func === 'unMute'), 'muted start sends unMute once');
  ok(txt('mp-title') === 'Test Song', 'title shows the real name, not the id');
  ok(txt('mp-cur') === '0:10' && txt('mp-dur') === '3:20', 'time readout 0:10 / 3:20');
  ok(JSON.parse(storage.get('nino.music.t'))['dQw4w9WgXcQ'] === 'Test Song', 'title persisted');
  ok(/เพลง 1 \/ 2/.test(txt('mp-sub')), 'subtitle shows position in queue');
  fire({ event: 'infoDelivery', info: { playerState: 1, currentTime: 11, duration: 200, muted: true, videoData: { title: 'Wrong', video_id: 'other' } } });
  ok(txt('mp-title') === 'Test Song', 'title from a different video id is ignored');

  console.log('== pause / resume through the panel');
  const n0 = sent.length;
  reg.act['toggle'].fire ? 0 : 0;
  (reg.byId['music-panel'].listeners.click || [])[0]({ target: reg.act['toggle'] });
  ok(st().state === 'paused' && sent.slice(n0).some(m => m.func === 'pauseVideo'), 'toggle pauses');
  (reg.byId['music-panel'].listeners.click || [])[0]({ target: reg.act['toggle'] });
  ok(sent.slice(n0).some(m => m.func === 'playVideo'), 'toggle resumes with playVideo');

  console.log('== errors skip to next track, then stop');
  toasts.length = 0;
  fire({ event: 'onError', info: 150 });
  ok(st().i === 1 && st().state === 'loading', 'embed-blocked error skips to next track');
  ok(/aaaaaaaaaaa/.test(frameSrc()), 'next track loaded');
  ok(toasts.some(m => m.includes('เจ้าของวิดีโอไม่อนุญาต')), 'error message shown in Thai');
  fire({ event: 'onError', info: 100 });
  ok(st().state === 'idle', 'when every track fails, playback stops');
  ok(toasts.some(m => m.includes('ไม่พบวิดีโอนี้')), 'last error message also shown');

  console.log('== seek bar: drag and keyboard');
  ctx.ninoMusic.play(0);
  fire({ event: 'infoDelivery', info: { playerState: 1, currentTime: 0, duration: 200, muted: false, videoData: { title: 'Test Song', video_id: 'dQw4w9WgXcQ' } } });
  const tr = reg.byId['mp-track'];
  const n1 = sent.length;
  tr.fire('pointerdown', { clientX: 100, pointerId: 1 });
  tr.fire('pointermove', { clientX: 150, pointerId: 1 });
  ok(!sent.slice(n1).some(m => m.func === 'seekTo'), 'dragging does not seek until release');
  ok(reg.byId['mp-fill'].style.width === '75.00%', 'fill follows the pointer while dragging');
  tr.fire('pointerup', { clientX: 150, pointerId: 1 });
  const seekCmd = sent.slice(n1).find(m => m.func === 'seekTo');
  ok(seekCmd && seekCmd.args[0] === 150 && seekCmd.args[1] === true, 'release seeks to 150 s with seekTo');
  tr.fire('keydown', { key: 'ArrowRight', preventDefault() { } });
  const k = sent.slice(n1).filter(m => m.func === 'seekTo').pop();
  ok(k && k.args[0] === 155, 'ArrowRight jumps 5 seconds');

  console.log('== fold / expand');
  const panel = reg.byId['music-panel'];
  (panel.listeners.click || [])[0]({ target: reg.act['fold'] });
  ok(panel.classList.contains('folded') && storage.get('nino.music.fold') === '1', 'fold collapses and remembers');
  ok(reg.act['fold'].getAttribute('aria-expanded') === 'false', 'fold reports collapsed to screen readers');
  (panel.listeners.click || [])[0]({ target: reg.act['fold'] });
  ok(!panel.classList.contains('folded') && storage.get('nino.music.fold') === '0', 'expand restores and remembers');

  console.log('== drag on a track with no known duration does nothing');
  ctx.ninoMusic.stop();
  const n2 = sent.length;
  tr.fire('pointerdown', { clientX: 50, pointerId: 1 });
  tr.fire('pointerup', { clientX: 50, pointerId: 1 });
  ok(!sent.slice(n2).some(m => m.func === 'seekTo'), 'no seek while duration unknown');
  console.log('== end of queue: stop unless repeat is on');
  ctx.ninoMusic.play(1);
  fire({ event: 'infoDelivery', info: { playerState: 1, currentTime: 0, duration: 100, muted: false } });
  fire({ event: 'infoDelivery', info: { playerState: 0 } });
  ok(st().state === 'idle', 'last track ends and playback stops');
  const panel2 = reg.byId['music-panel'];
  (panel2.listeners.click || [])[0]({ target: reg.act['repeat'] });
  ok(JSON.parse(storage.get('nino.music.opt')).rep === true, 'repeat choice is remembered');
  ctx.ninoMusic.play(1);
  fire({ event: 'infoDelivery', info: { playerState: 1, currentTime: 0, duration: 100, muted: false } });
  fire({ event: 'infoDelivery', info: { playerState: 0 } });
  ok(st().state === 'loading' && st().i === 0, 'with repeat on, the queue wraps to the first track');

  console.log('== volume');
  const vol = reg.byId['mp-vol'];
  vol.value = '40';
  vol.fire('input', {});
  ok(sent.some(m => m.func === 'setVolume' && m.args[0] === 40), 'slider sends setVolume');
  ok(JSON.parse(storage.get('nino.music.opt')).vol === 40, 'volume is remembered');
  ctx.ninoMusic.play(0);
  const n3 = sent.length;
  fire({ event: 'infoDelivery', info: { playerState: 1, currentTime: 0, duration: 100, muted: false } });
  ok(sent.slice(n3).some(m => m.func === 'setVolume' && m.args[0] === 40), 'saved volume is applied when a track starts');

  console.log('== queue list');
  (panel2.listeners.click || [])[0]({ target: reg.act['list'] });
  ok(reg.byId['mp-list'].classList.contains('show'), 'list opens');
  fire({ event: 'infoDelivery', info: { playerState: 1, currentTime: 0, duration: 100, muted: false, videoData: { title: '<b>X</b> & "Y"', video_id: 'dQw4w9WgXcQ' } } });
  ok(reg.byId['mp-list'].innerHTML.includes('&lt;b&gt;X&lt;/b&gt; &amp; &quot;Y&quot;'), 'titles are escaped in the list');
  ok(!reg.byId['mp-list'].innerHTML.includes('<b>X'), 'no raw markup from a video title');
  (panel2.listeners.click || [])[0]({ target: { closest: () => ({ getAttribute: (n) => (n === 'data-act' ? 'pick' : '0') }) } });
  ok(st().i === 0 && st().state === 'loading', 'picking a row plays that track');

  console.log('== fold hides the new rows too (CSS rule is checked as text)');
  const cssText = fs.readFileSync(path.join(__dirname, '../../style.css'), 'utf8');
  ok(/\.mp\.folded \.mp-extra,\.mp\.folded \.mp-list\{display:none;\}/.test(cssText), 'folded panel hides extra row and list');
  console.log('== game pause and resume');
  ctx.ninoMusic.stop();
  ctx.ninoMusic.play(0);
  fire({ event: 'infoDelivery', info: { playerState: 1, currentTime: 0, duration: 100, muted: false } });
  const n4 = sent.length;
  ctx.ninoMusic.pauseForGame();
  ok(st().state === 'paused' && sent.slice(n4).some(m => m.func === 'pauseVideo'), 'opening the game pauses playing music');
  ctx.ninoMusic.resumeAfterGame();
  ok(st().state === 'loading' && sent.slice(n4).some(m => m.func === 'playVideo'), 'closing the game resumes the music');
  ctx.ninoMusic.stop();
  ctx.ninoMusic.play(0);
  fire({ event: 'infoDelivery', info: { playerState: 1, currentTime: 0, duration: 100, muted: false } });
  (panel2.listeners.click || [])[0]({ target: reg.act['toggle'] });
  ctx.ninoMusic.pauseForGame();
  ctx.ninoMusic.resumeAfterGame();
  ok(st().state === 'paused', 'music the user paused by hand stays paused after the game closes');
} catch (e) {
  fail++; console.log('  EXCEPTION: ' + (e && e.stack || e));
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
