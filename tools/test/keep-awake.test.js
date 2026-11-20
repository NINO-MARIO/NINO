/* Screen wake lock during generation. Run: node tools/test/keep-awake.test.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'keep-awake.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('  FAIL: ' + name); } }
const tick = () => new Promise(r => setTimeout(r, 0));

function make(opts) {
  opts = opts || {};
  const locks = [];
  const doc = { visibilityState: 'visible', _h: {}, addEventListener(t, f) { (this._h[t] = this._h[t] || []).push(f); }, fire(t) { (this._h[t] || []).forEach(f => f()); } };
  const navigator = opts.noApi ? {} : { wakeLock: { request() {
    if (opts.fail) return Promise.reject(new Error('NotAllowed'));
    const lock = { released: false, _h: [], release() { this.released = true; this._h.forEach(f => f()); }, addEventListener(t, f) { this._h.push(f); } };
    locks.push(lock); return Promise.resolve(lock);
  } } };
  const ctx = { window: {}, document: doc, navigator, console, setTimeout };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
  return { api: ctx.ninoAwake, locks, doc };
}

(async () => {
  console.log('== single generation');
  let h = make();
  h.api.hold(); await tick();
  ok(h.locks.length === 1 && !h.locks[0].released, 'taking a lock during a reply');
  ok(h.api.active() && h.api.count() === 1, 'reported as active');
  h.api.release();
  ok(h.locks[0].released && !h.api.active(), 'released when the reply ends');

  console.log('== nested generations');
  h = make();
  h.api.hold(); h.api.hold(); await tick();
  h.api.release();
  ok(!h.locks[0].released, 'still held while one reply is running');
  h.api.release();
  ok(h.locks[0].released && h.api.count() === 0, 'released after the last reply');
  ok(h.locks.length === 1, 'nested replies share one lock, none leaked (got ' + h.locks.length + ')');

  console.log('== background and return');
  h = make();
  h.api.hold(); await tick();
  h.doc.visibilityState = 'hidden'; h.locks[0].release(); h.doc.fire('visibilitychange'); /* the browser drops the lock and fires release */
  h.doc.visibilityState = 'visible'; h.doc.fire('visibilitychange'); await tick();
  ok(h.locks.length === 2 && !h.locks[1].released, 'lock is taken again when the app comes back during a reply');
  h.api.release();
  h = make();
  h.doc.visibilityState = 'visible'; h.doc.fire('visibilitychange'); await tick();
  ok(h.locks.length === 0, 'no lock when nothing is generating');

  console.log('== unsupported or refused');
  h = make({ noApi: true });
  let threw = false;
  try { h.api.hold(); h.api.release(); } catch (e) { threw = true; }
  ok(!threw && !h.api.active(), 'no API: no error, no lock');
  h = make({ fail: true });
  h.api.hold(); await tick();
  ok(!h.api.active(), 'request refused: no lock held, no error');
  h.api.release();
  ok(h.api.count() === 0, 'count stays consistent after a refused lock');

  console.log('== release before the lock arrives');
  h = make();
  h.api.hold(); h.api.release(); await tick();
  ok(h.locks.length === 1 && h.locks[0].released, 'a lock that arrives after the reply ended is released at once');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
