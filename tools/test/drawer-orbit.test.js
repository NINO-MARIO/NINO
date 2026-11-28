const H = require('./harness.js');
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IDS = ['nd-font', 'nd-brain', 'nd-hc', 'nd-class', 'nd-lib', 'nd-cg', 'nd-mk', 'nd-console'];

(async () => {
  console.log('== Drawer orbit menu (browser)');
  const h = await H.start();
  const P = h.page;
  const errs = [];
  P.on('pageerror', e => errs.push(String(e && e.message || e)));
  await P.goto(h.base + '/index.html', { waitUntil: 'load' });
  await sleep(2000);

  ok(await P.evaluate(() => typeof window.ninoOrbit === 'object'), 'orbit module loaded');
  ok(await P.evaluate(() => {
    const m = document.getElementById('nd-menu'), x = document.getElementById('nd-x');
    return !!m && !!x && m.parentNode === x.parentNode && m.nextSibling === x;
  }), 'menu button sits in the drawer header before the close button');

  // Snapshot the stored app state so we can prove the menu never touches it.
  const snap = () => P.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
    return o;
  });
  const before = await snap();

  // Remember where each module button lives before the menu touches anything.
  const where = () => P.evaluate((ids) => ids.map(id => {
    const el = document.getElementById(id);
    return el ? (el.parentNode && el.parentNode.id || el.parentNode && el.parentNode.tagName) : null;
  }), IDS);
  const homeWhere = await where();
  ok(homeWhere.filter(Boolean).length >= 6, 'at least six module buttons exist in the drawer (' + homeWhere.filter(Boolean).length + ')');

  await P.click('#app-header .w-7.h-7');
  await sleep(450);
  ok(await P.evaluate(() => document.body.classList.contains('nd-open')), 'drawer opens');
  ok(await P.evaluate(() => getComputedStyle(document.getElementById('nd-orbit')).visibility === 'hidden'), 'orbit hidden while menu is closed');

  // Open the orbit.
  await P.click('#nd-menu');
  await sleep(120);
  ok(await P.evaluate(() => document.body.classList.contains('nd-open')), 'menu click does NOT close the drawer');
  ok(await P.evaluate(() => document.getElementById('nd-menu').getAttribute('aria-pressed') === 'true'), 'menu button reports pressed');
  await sleep(1400);
  const parked = await P.evaluate((ids) => ids.map(id => {
    const el = document.getElementById(id);
    return el ? el.parentNode.id === 'nd-orbit' : null;
  }), IDS);
  ok(parked.filter(v => v === true).length === parked.filter(v => v !== null).length && parked.filter(Boolean).length >= 6,
    'module buttons are parked inside the orbit (' + parked.filter(Boolean).length + ')');
  ok(await P.evaluate(() => getComputedStyle(document.getElementById('nd-orbit')).visibility === 'visible'), 'orbit visible when open');
  ok(await P.evaluate(() => document.getElementById('nino-drawer').classList.contains('nd-orb')), 'drawer marked in orbit mode');

  // Motion: the ring rotates and nodes spread from the hub.
  const t1 = await P.evaluate(() => document.getElementById('nd-lib').style.transform);
  await sleep(400);
  const t2 = await P.evaluate(() => document.getElementById('nd-lib').style.transform);
  ok(t1 && t2 && t1 !== t2, 'nodes move in 3D while the orbit is open');
  ok(await P.evaluate(() => {
    const ops = [...document.querySelectorAll('#nd-orbit .nd-node')].map(e => parseFloat(e.style.opacity) || 0);
    return ops.length >= 6 && ops.filter(o => o > 0.5).length >= 3;
  }), 'several nodes are visible after the slide-out');
  ok(await P.evaluate(() => document.querySelectorAll('#nd-orbit .nd-spoke').length >= 6), 'spoke links drawn from the hub');

  // Node buttons still work from inside the orbit.
  // Nodes keep moving, so click through the DOM (Playwright's stability check would never settle).
  await P.evaluate(() => document.getElementById('nd-lib').click());
  await sleep(500);
  ok(await P.evaluate(() => !document.body.classList.contains('nd-open')), 'a node click still closes the drawer like before');
  ok(await P.evaluate(() => !!document.getElementById('nino-shelf')), 'library node opens the library shelf from inside the orbit');
  await P.evaluate(() => window.ninoShelf && window.ninoShelf.close());
  await sleep(100);
  await sleep(900);
  ok(await P.evaluate(() => getComputedStyle(document.getElementById('nd-orbit')).visibility === 'hidden'), 'orbit goes back after a node click');
  const afterNode = await where();
  ok(JSON.stringify(afterNode) === JSON.stringify(homeWhere), 'module buttons return to their original parents after a node click');

  // Reopen and close with the menu button: slide back.
  await P.click('#app-header .w-7.h-7');
  await sleep(400);
  await P.click('#nd-menu');
  await sleep(1200);
  ok(await P.evaluate(() => document.getElementById('nd-orbit').children.length > 1), 'orbit reopened');
  await P.click('#nd-menu');
  await sleep(120);
  ok(await P.evaluate(() => document.body.classList.contains('nd-open')), 'second menu click keeps the drawer open');
  ok(await P.evaluate(() => document.getElementById('nd-menu').getAttribute('aria-pressed') === 'false'), 'menu button reports released');
  await sleep(1100);
  ok(await P.evaluate(() => getComputedStyle(document.getElementById('nd-orbit')).visibility === 'hidden'), 'orbit slides back and hides');
  ok(JSON.stringify(await where()) === JSON.stringify(homeWhere), 'module buttons back in their original places after the menu closes');
  ok(!await P.evaluate(() => [...document.querySelectorAll('#nino-drawer, #nd-orbit')].some(e => [...e.childNodes].some(n => n.nodeType === 8 && /^slot:/.test(n.nodeValue)))), 'no placeholder comments left behind');

  // Build and Commit stay in the drawer and visible.
  ok(await P.evaluate(() => !!document.getElementById('nd-build') && !!document.getElementById('nd-commit')), 'Build and Commit still in the drawer');

  // Close the drawer while the orbit is open: orbit must return the buttons.
  // The drawer is still open from the block above, so only the menu is toggled here.
  ok(await P.evaluate(() => document.body.classList.contains('nd-open')), 'drawer still open before the mid-orbit close test');
  await P.click('#nd-menu');
  await sleep(900);
  await P.click('#nd-x');
  await sleep(2000); // the orbit retracts over about 1.2s before it restores the buttons
  ok(await P.evaluate(() => !document.body.classList.contains('nd-open')), 'close button closes the drawer while orbit is open');
  ok(JSON.stringify(await where()) === JSON.stringify(homeWhere), 'closing the drawer mid-orbit restores module button places');
  ok(await P.evaluate(() => !document.getElementById('nino-drawer').classList.contains('nd-orb')), 'orbit mode flag cleared');

  // Public API mirrors the button.
  await P.evaluate(() => document.querySelector('#app-header .w-7.h-7').click());
  await sleep(400);
  await P.evaluate(() => window.ninoOrbit.open());
  await sleep(900);
  ok(await P.evaluate(() => window.ninoOrbit.isOpen() === true), 'ninoOrbit.open() opens the orbit');
  await P.evaluate(() => window.ninoOrbit.close());
  await sleep(1000);
  ok(await P.evaluate(() => window.ninoOrbit.isOpen() === false), 'ninoOrbit.close() closes the orbit');

  // Nothing stored by the app changed because of the menu.
  const after = await snap();
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [...keys].filter(k => before[k] !== after[k]);
  ok(changed.length === 0, 'localStorage untouched by the menu' + (changed.length ? ' (changed: ' + changed.join(',') + ')' : ''));

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await h.close();
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL: crashed: ' + e.message); process.exit(1); });
