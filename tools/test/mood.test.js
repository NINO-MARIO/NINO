const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/mood.js'), 'utf8'), sandbox);
const M = sandbox.window.ninoMood;
console.log('== mood labels');
ok(M.states.length === 6 && M.states.indexOf('NEUTRAL') >= 0, 'six categories');
ok(M.info('SAD').label === 'เศร้า' && M.info('HAPPY').color === '#F2C275', 'labels and colors');
ok(M.info('UNKNOWN').label === 'ปกติ', 'unknown category falls back to NEUTRAL');
ok(typeof M.classify === 'undefined', 'keyword guessing is gone');
console.log('passed ' + pass + ', failed ' + fail);
process.exit(fail ? 1 : 0);
