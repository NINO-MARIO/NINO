# แคตตาล็อกเทสต์ของ NINO

ไฟล์นี้บอกว่ามีเทสต์อะไรบ้าง ทดสอบอะไร และรันอย่างไร อัปเดตเมื่อเพิ่มชุดเทสต์ใหม่

## 1. ทดสอบ NINO.zip (ตัวที่ส่งจริง)

| คำสั่ง | เวลาโดยประมาณ | ทำอะไร |
|---|---|---|
| `bash tools/test-zip.sh NINO.zip` | ~12 วินาที | ตรวจซิปไม่เสียหาย ไม่มีไฟล์ต้องห้าม (โมเดล .gguf, Q2_K, ไฟล์เกิน 25 MB) workflow ใน .github ตรงกับ android/ci ทุกไบต์ แล้วแตกซิปลงโฟลเดอร์ใหม่และรัน ci-gate |
| `bash tools/test-zip.sh --full NINO.zip` | ~9–10 นาที | ทำทุกอย่างข้างบน และเทสต์เบราว์เซอร์ทั้งชุด (verify-all.sh) ต้องมี Chromium ตามที่ระบุในหัวข้อ 5 |

ถ้าไม่ระบุพาธ ตัวสคริปต์จะหา `./NINO.zip` ก่อน แล้วค่อยหา `/mnt/user-data/outputs/NINO.zip`
ผลลัพธ์แบบเต็มของ verify-all เก็บไว้ที่ `<โฟลเดอร์ทดสอบ>-verify-all.log`

## 2. ประตูตรวจ (ไม่ใช้เบราว์เซอร์)

| คำสั่ง | จำนวนการตรวจ | ดูอะไร |
|---|---|---|
| `node tools/check.js --strict` | 643 รายการ | โครงสร้างโปรเจกต์ ไฟล์ทุกไฟล์มีบทบาทใน file-roles.json ไฟล์ข้อมูลและ workflow ถูกต้อง |
| `node tools/make-now.js --check` | 1 | NOW.md ตรงกับโค้ด (ถ้าไม่ตรง รัน `node tools/make-now.js`) |
| `python3 tools/make-packs.py --check` | 1 | ไฟล์ packs ตรงกับโค้ด |
| `bash tools/ci-gate.sh` | 32 ขั้น | ประตูที่ GitHub รันหลัง unpack: ไฟล์ที่ต้องมี, check, NOW, packs, เทสต์ node ทั้งหมด (รวมตัดพื้นหลัง GrabCut และเทสต์มิ้ม) |

## 3. ประตูเต็ม (ใช้เบราว์เซอร์)

`bash tools/verify-all.sh` รันประมาณ 70 ขั้น แบ่งเป็นกลุ่มดังนี้

- **โครงสร้างและเว็บ:** check strict, web.test.js (ตรวจหน้าเว็บ)
- **เบราว์เซอร์ทั่วไป:** browser, offline (service worker, ตัดเน็ตแล้วเปิดได้), หน้าแชต, เมนูวงโคจร, เพลง, เลเวลอัป, ศูนย์ LLM
- **โมเดลในเครื่องและ Local AI:** local-llm, local-code-guard, llm-native (Android bridge จำลอง)
- **NDS (เกมคอนโซล):** ห้อง, นำเข้า, เฟิร์มแวร์เป็นทางเลือก, FreeBIOS, player, คลังตลับ, playtest, detective และ gofront (python)
- **มิ้ม (ผู้ช่วยความรู้):** engine-tests (53 เคส), play-test, gaps, nadia (ไม่ใช้เครือข่าย), learn, chat-behavior, followup, adapt, feedback และ UI, memory-tools, selfstudy, eval-retrieval --gate (กันตอบผิด)
- **ตัดพื้นหลังรูป (GrabCut):** cutout-core (ทดสอบอัลกอริทึม 18 เคส รวมความเร็ว) และ cutout-ui (ปุ่มกรรไกรในถาดรูป ตัดจริงในเบราว์เซอร์ 13 การตรวจ)
- **โมเดลที่เปิดพร้อมกัน:** llm-roster (node: การตรวจ การเลือกตามบทบาท ลองตัวถัดไป ไม่รั่วคีย์ ยกเลิก หมดเวลา เรียกพร้อมกัน สตรีม 54 เคส) และ llm-roster-ui (browser: ฟอร์ม ประวัติการเรียก แชตจริงผ่านทะเบียน แบบสตรีม ไม่มีการเลื่อนแนวนอนบนมือถือ 19 การตรวจ)
- **ความจำแชต:** chat-memory (node: ข้อเท็จจริง 12 ข้อหลัง 300 ข้อความ 16 เคส) และ chat-memory-ui (browser: chatTurn จริง สรุปเข้า system prompt คงอยู่หลังบันทึกและรีโหลด 13 การตรวจ)
- **วิจัย:** research/llm/test_charlm.py (numpy)

## 4. รันเทสต์เดียว

ทุกไฟล์ใน tools/test/ และ mim/tests/ รันได้โดยตรง เช่น
- `node tools/test/cutout-core.test.js`
- `node mim/tests/eval-retrieval.js --gate`
- `node tools/test/cutout-ui-test.js` (ต้องมี Chromium)

## 5. ติดตั้งเบราว์เซอร์สำหรับเทสต์

`bash tools/setup-browser.sh` ติดตั้ง Playwright และ Chromium (ราว 650 MB ไม่รวมอยู่ในซิป) ขนาดจอที่เทสต์ใช้คือ 390 × 844 ตั้งค่าที่ `tools/test/harness.js`

## 6. เครื่องมือตรวจอื่น ๆ

- `tools/test/harness.js` เซิร์ฟเวอร์ในเครื่อง + Chromium + native-mock ใช้ร่วมกันทุกเทสต์เบราว์เซอร์
- `tools/nds-core/detective.py` ตรวจข้อผิดพลาดในโปรเจกต์ NDS (มี --selftest ที่ใส่ข้อบกพร่องไว้แล้วต้องจับได้)

## 7. เกณฑ์ว่างานเสร็จ (ใช้กับทุกงาน)

งานถือว่าเสร็จเมื่อผ่านสองคำสั่งนี้ตามลำดับ:
1. `bash tools/ci-gate.sh` (ประตูไม่ใช้เบราว์เซอร์)
2. `bash tools/test-zip.sh <ซิปที่บรรจุใหม่>` (ทดสอบซิปที่จะส่ง)

ถ้าแก้โค้ดหน้าเว็บหรือ JS ของแอปด้วย ให้รัน `bash tools/test-zip.sh --full <ซิป>` เพิ่มด้วย
ประตูใหม่จะเพิ่มได้ต่อเมื่อความพลาดแบบเดิมเกิดซ้ำ (ดูบันทึกใน tools/lessons/ledger.json)

