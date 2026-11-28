// ชั้นโค้ดของโมเดลในเครื่อง (js/local-llm.js): ตัวตรวจคำตอบ checkCode ก่อนส่งให้ผู้ใช้
// ตรวจ: ข้อความธรรมดาผ่าน, ว่างเปล่าไม่ผ่าน, บอกชื่อโมเดลอื่นไม่ผ่าน, บล็อกโค้ดไม่ปิดไม่ผ่าน (คำตอบถูกตัด),
// js ผิดไวยากรณ์ไม่ผ่าน, js ที่ถูกต้องผ่าน (ไม่รันโค้ด), json ที่ parse ไม่ได้ไม่ผ่าน, ภาษาอื่นที่ไม่ตรวจผ่านถ้าปิดบล็อกครบ
// และกติกาการตอบ (CODE_RULES) มีอยู่ในข้อความที่ส่งให้โมเดลทุกครั้ง (ทดสอบแบบ browser ใน local-llm.test.js)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, n) { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } }
const FLOOR = 12;

const ROOT = path.join(__dirname, '..', '..');
const mem = () => ({ getItem: () => null, setItem() {}, removeItem() {} });
const sb = { console, setTimeout, clearTimeout, Date, navigator: {}, localStorage: mem(), sessionStorage: mem() };
sb.window = sb;
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'local-llm.js'), 'utf8'), sb, { filename: 'js/local-llm.js' });
const L = sb.NINOLocalLLM;

ok(typeof L.checkCode === 'function', 'checkCode exported');
ok(L.checkCode('สวัสดีค่ะ มิ้มยินดีช่วยนะคะ') === '', 'plain Thai passes');
ok(L.checkCode('') === 'คำตอบว่างเปล่า', 'empty fails');
ok(L.checkCode('   ') === 'คำตอบว่างเปล่า', 'whitespace fails');
ok(/ชื่อโมเดล/.test(L.checkCode('ฉันคือ Qwen ค่ะ')), 'other model name fails');
ok(/ชื่อโมเดล/.test(L.checkCode('ผลิตโดย OpenAI ค่ะ')), 'other company fails');
ok(L.checkCode('```js\nconst a = 1;\n```') === '', 'valid js block passes');
ok(/ผิดไวยากรณ์/.test(L.checkCode('```js\nfunction (\n```')), 'js syntax error fails');
ok(/ผิดไวยากรณ์/.test(L.checkCode('```javascript\nconst x = ;\n```')), 'javascript alias is checked');
ok(/ไม่ปิด/.test(L.checkCode('```js\nconst a=1;\n')), 'unclosed fence fails (truncated)');
ok(L.checkCode('```json\n{"a":1}\n```') === '', 'valid json passes');
ok(L.checkCode('```json\n{a:1\n```') === 'JSON ไม่ถูกต้อง', 'invalid json fails');
ok(L.checkCode('```python\nprint(1)\n```') === '', 'other language with closed fence passes');
ok(/ไม่ปิด/.test(L.checkCode('ตอบแล้ว\n```python\nprint(1)')), 'unclosed other-language fence fails');
ok(typeof L.CODE_RULES === 'string' && L.CODE_RULES.indexOf('กติกาการตอบ') === 0, 'CODE_RULES exported');

console.log('local-code-guard: ' + pass + '/' + (pass + fail) + ' passed, ' + fail + ' failed (ต้องผ่านอย่างน้อย ' + FLOOR + ')');
process.exit(fail || pass < FLOOR ? 1 : 0);
