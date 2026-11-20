# NINO

แอป Android (WebView + Kotlin) ผู้ช่วยภาษาไทยที่แก้แอปตัวเองได้ + โรลเพลย์ + ห้องเรียน · ออนไลน์/ออฟไลน์ · ฉากโหลดตามต้องการ (ศูนย์ดาวน์โหลดฉาก) · v1.0.0 Gen 2 · เริ่มอ่านที่ HANDOFF.md

## โครงสร้าง
- `index.html` — หน้าเดียว ลำดับ `<script>` คือลำดับโหลดจริง
- `app.js` + `js/*.js` — โค้ดแอป เป็นสคริปต์ธรรมดาใช้ global scope ร่วมกัน (ชื่อระดับบนสุดห้ามซ้ำข้ามไฟล์)
- `github-agent.js` — เครื่องมือ `gh_*` ที่ให้ AI อ่าน/แก้/commit รีโปนี้ผ่าน Git Data API
- `nino-agent.js` — journal, skill, plan, ตัวชี้วัดความคืบหน้า (%)
- `js/image-bridge.js` — แนบรูป (อัลบั้ม/แฟ้ม) → บีบอัด → รอในช่องข้อความ; ดวงตาช่วยให้โมเดลที่มองรูปไม่ได้ (Qwen ตัวเล็ก ฯลฯ)
- `js/classroom.js` + `assets/classroom/` — ห้องเรียน NINO: ฉากวิดีโอวนลูป 2 คลิป (`nino-read` / `nino-write` .mp4) + โปสเตอร์ .webp 2 รูป ชื่อไฟล์คู่กัน; กระดานดำกับประกายเป็น SVG ซ้อนบนวิดีโอ; เปลี่ยนตัวละครให้เปลี่ยนไฟล์ 4 ไฟล์นี้ (ขนาด 634×646 สัดส่วนเดิม พื้นที่กระดานอยู่ขวาบน) · ตัวละคร SVG รุ่นเก่าเก็บใน `legacy/classroom/`
- `js/amongai-core.js` + `js/amongai.js` — เกม Among AI (ฆาตกรในยาน) ในแอป: แกนกติกาจาก among-us-ai (MIT, ดู `third_party/among-us-ai/`) และหน้าเกม · สกิล `skills/lab/games/amongai`
- `js/outlaw.js` + `games/outlaw/` — เกม Outlaw Immortals ในแอป: เว็บเกมคัดจาก Outlaw_Immortals.zip (ไม่รวม Android) เปิดในไอเฟรมเต็มจอ เล่นออฟไลน์ได้ · สกิล `skills/lab/games/outlaw` · ห้ามแก้ตรรกะการตรวจสอบของเกม
- `trash.js` — ถังขยะรูปภาพ (IndexedDB) ลบอัตโนมัติตามเวลาที่ตั้งในการตั้งค่า
- `version.js` — เลขเวอร์ชัน (bump อัตโนมัติเมื่อ AI commit ไฟล์รันไทม์)
- `service-worker.js` — แคชออฟไลน์ ชื่อแคชอิงเลขเวอร์ชัน รายการไฟล์อ่านจาก `index.html`
- `update-notifier.js` — แบนเนอร์แจ้งรีเฟรช / ตรวจเวอร์ชันใหม่
- `revive.js` — ย้อน commit ล่าสุดเมื่อแอปเปิดไม่ผ่าน (ถามยืนยันก่อนเสมอ)
- `Skill.md` — กติกาที่ไม่เปลี่ยนของ NINO (ถูกแนบในพรอมต์ทุกรอบ จึงสั้นไว้ ≤ 6000 ตัวอักษร) · `NOW.md` — สถานะจริงที่ **สร้างจากโค้ดอัตโนมัติ** (แผนที่ไฟล์ ไฟล์ป้องกัน เครื่องมือ ลำดับโหลด สารบัญสกิล) อ่านก่อนเริ่มงาน ห้ามแก้มือ
- `js/lib-health.js` — ตรวจสุขภาพหอสมุดสกิล (`nino lib` / `lib_health`: แดง >500 บรรทัด, pointer คลุมเครือ, ประตูตัดสินใจ) + ผู้ใช้เรียกสกิลเองด้วย `/ชื่อเล่ม` ในแชท · `js/prompt-cache.js` — จัดพรอมต์โหมดโค้ดให้ส่วนนิ่งอยู่บน ส่วนที่เปลี่ยนทุกรอบอยู่ท้าย + เตือน/สรุปแคช (`nino cache` / `cache_report`)
- `js/delegate.js` — เครื่องมือ `delegate` ฝากงานเล็กให้โมเดลถูก (9arm Qwen / TokenMe) พร้อมเพดานบริบทและตัวกันความลับ (สกิล `qwen-agent`)
- `js/obs.js` · `js/ota.js` · `js/nino-sys.js` · `js/term.js` · `js/godview.js` · `js/console-ui.js` — แพลตฟอร์มเนทีฟ (1.0.0): log/OTA/Build/เทอร์มินัล/Godview/หน้า Console (ทำงานเต็มในแอป APK) ดู `android/ARCHITECTURE.md`
- `tools/check.js` · `tools/test/*` · `tools/ci/*.sh` — ด่านตรวจสถิต, เทสต์, สคริปต์ CI (รันเองได้: `node tools/check.js` · เพิ่ม `--strict` เมื่อต้องการให้ NOW.md และแมนิเฟสต์ต้องตรงโค้ดเป๊ะ)
- `tools/make-now.js` + `tools/file-roles.json` — ตัวสร้าง NOW.md และบทบาทของทุกไฟล์ (เพิ่มไฟล์ใหม่ = เพิ่มบรรทัดบทบาท ไม่งั้นด่านล้ม)

## กันเอกสาร/เวอร์ชัน/GithubAgent สับสน
- ข้อเท็จจริงมีที่เดียวคือโค้ด; `NOW.md` อ่านจากโค้ดและ `tools/check.js` ตรวจว่ากฎใน Skill.md, สกิล, ไฟล์ป้องกัน, repo เริ่มต้น และเลข rev ไม่ขัดกัน
- ไฟล์ป้องกัน (ต้อง `confirm:true` + ผู้ใช้กดอนุมัติตอน `gh_commit`) มีรายการเดียวใน `github-agent.js` (`ninoGH.isProtected`) และรวมตัวตรวจ/เทสต์เอง — AI แก้ตัวตรวจของตัวเองลำพังไม่ได้
- เลขรุ่น: `Gen` (รุ่นกำเนิด เปลี่ยนเมื่อ "เกิดใหม่") + เลขเวอร์ชัน (bump อัตโนมัติ) · ชื่อแคช `nino-v<เวอร์ชัน>-g<Gen>`
- หลังเพิ่ม/ลบไฟล์: `node tools/make-now.js && python3 tools/make-manifests.py` (CI รีเฟรชให้ในบันเดิลที่ปล่อยอยู่แล้ว)

## ตั้งค่า GitHub ให้ AI แก้โค้ดได้
กดปุ่ม ใส่ owner / repo (`nino-app`) / branch / token (สิทธิ์ Contents: read & write) — token เก็บใน localStorage เครื่องเดียว ห้าม commit

## หอสมุดสกิล
`skills/` (หมวด › ชั้น › เล่ม สารบัญอยู่ท้าย `NOW.md`) · `skill-lib.js` (เครื่องมือ sh/skill_*/self_patch) · `lock.js` (หน้าต่างรหัสผ่าน) · เปิดแอปด้วย `?safe=1` เพื่อล้างการแก้ตัวเองในเครื่อง

- ชั้นหนังสือ: `skills/<หมวด>/<ชั้น>/<เล่ม>/` (Skill.md + notebook.md คู่กันเสมอ + scripts/) สารบัญสร้างอัตโนมัติจากโครงสร้าง ชื่อไทยของหมวด/ชั้นอยู่ใน `_title.md`

## สกิลจาก 9arm-skills
นำเข้าจาก [thananon/9arm-skills](https://github.com/thananon/9arm-skills) และปรับให้ใช้กับเครื่องมือของ NINO (ต้นฉบับเต็มเก็บไว้ที่ `docs.md` ของแต่ละเล่ม): `code/debug/debug-mantra` · `code/debug/post-mortem` · `code/review/scrutinize` · `code/delegate/qwen-agent` (+เครื่องมือ `delegate`) · `system/budget-plan/qwenchance` · `work/comms/management-talk` · ของดีจาก `patches/` ย้ายเป็น `system/repo-self/self-fix`

## Local AI
กด `>_` › Local AI ใส่ URL เซิร์ฟเวอร์ (llama-server/MNN/Jan/Ollama) · โฟกัส C = คุย · โฟกัส L = คุยผ่าน Local AI · ฟอนต์เปลี่ยนที่ `>_` › Aa ฟอนต์

## Console (แอป APK)
`>_` › **Console** · แท็บ Terminal (เชลล์จริง) · Versions (ปุ่ม **Build**, ย้อนกลับ/ถัดไป, อัปเดต, APK) · Godview (ภาพก่อน/หลัง) · Logs (log, ตัวชี้วัด, crash) · รายละเอียดและข้อจำกัด: `android/ARCHITECTURE.md` · วิธีใช้: `android/GUIDE-TH.md` ข้อ 8
