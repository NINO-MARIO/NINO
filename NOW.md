# NOW — สถานะจริงของ NINO
สร้างอัตโนมัติโดย `node tools/make-now.js` จากโค้ดในรีโป ห้ามแก้มือ · ขัดกับโค้ดจริง = ยึดโค้ด แล้วให้ผู้ใช้รัน `node tools/make-now.js`
รุ่นกำเนิด Gen 2 · เลขเวอร์ชันล่าสุดอ่านจาก version.js (ไฟล์นี้ไม่เก็บเลขที่เปลี่ยนทุก commit)

## อ่านอะไรเมื่อไหร่
- ก่อนเริ่มงานทุกครั้ง: ไฟล์นี้ (แผนที่+ด่าน+เครื่องมือ) และ Skill.md (กติกา ถูกแนบในพรอมต์อยู่แล้ว)
- ถูกถาม "ทำไมเป็นแบบนี้": DECISIONS.md · ถูกถามประวัติ: CHANGES.md · ไม่ต้องอ่านทั้งสองโดยไม่จำเป็น
- งานที่มีสกิลตรงเรื่อง: skill_read {name} (รายการอยู่ท้ายไฟล์นี้)

## เลขรุ่นหมายถึงอะไร
- Gen = รุ่นกำเนิด เพิ่มเมื่อ "เกิดใหม่" (รื้อรวบรวมโค้ด แล้วผ่านเทสต์ความสามารถเดิมครบ) · เลขเวอร์ชัน = ขั้นของรุ่นนั้น (bump อัตโนมัติเมื่อ commit ไฟล์รันไทม์) · build = วันที่
- OTA เทียบความใหม่ด้วยเลข run ของ CI ไม่ใช่เลขเวอร์ชัน (js/ota.js isNewer) · ชื่อแคชเว็บ = nino-v<เวอร์ชัน>-g<Gen> จึงไม่ชนกันแม้เริ่มเลขใหม่ในรุ่นถัดไป

## ไฟล์ป้องกัน [ล็อก]
แตะแล้ว `gh_commit` ต้องส่ง `confirm:true` และผู้ใช้ต้องกดอนุมัติในแอปเอง (ด่านอยู่ใน github-agent.js ซึ่งป้องกันตัวเองด้วย) · ตัวตรวจ (tools/check.js, tools/test/) ก็อยู่ในรายการนี้ — AI แก้ตัวตรวจของตัวเองลำพังไม่ได้
`self-upgrade.js` · `github-agent.js` · `nino-agent.js` · `revive.js` · `revive.html` · `service-worker.js` · `lock.js` · `skill-lib.js` · `.github/` · `android/` · `tools/ci/` · `tools/check.js` · `tools/make-now.js` · `tools/test/` · `js/ota.js` · `js/obs.js` · `js/term.js` · `js/loop-guard.js` · `js/delegate.js` · `js/lib-health.js` · `js/prompt-cache.js` · `js/native-bridge.js`

## ลำดับโหลด script (index.html)
1. version.js  
2. js/obs.js  
3. lock.js  
4. self-upgrade.js  
5. nino-agent.js  
6. github-agent.js  
7. code-brain.js  
8. roleplay-callback.js  
9. trash.js  
10. revive.js  
11. update-notifier.js  
12. js/boot.js  
13. js/config.js  
14. js/context-manager.js  
15. js/memory.js  
16. js/llm-providers.js  
17. js/code-utils.js  
18. js/characters.js  
19. js/keep-awake.js  
20. js/modes-session.js  
21. js/orchestrator-core.js  
22. js/orchestrator-tools.js  
23. js/continuation.js  
24. js/hud-card.js  
25. js/roleplay.js  
26. js/ui-render.js  
27. js/ui-input.js  
28. js/ui-tools.js  
29. js/image-bridge.js  
30. skill-lib.js  
31. nino-home.js  
32. local-ai/endpoint.js  
33. local-ai/bridge.js  
34. local-ai/key.js  
35. local-ai/ui.js  
36. local-ai/health.js  
37. js/native-bridge.js  
38. js/api-guard.js  
39. js/ota.js  
40. js/term.js  
41. js/music.js  
42. js/threads.js  
43. js/notes.js  
44. js/godview.js  
45. js/nino-sys.js  
46. js/console-ui.js  
47. js/focus-chat.js  
48. js/auto-route.js  
49. js/workshop.js  
50. js/home-check.js  
51. js/research.js  
52. js/learn.js  
53. js/shelf.js  
54. js/web-search.js  
55. js/classroom.js  
56. js/scenes.js  
57. js/code-fast.js  
58. js/delegate.js  
59. js/lib-health.js  
60. js/prompt-cache.js  
61. js/loop-guard.js  
62. js/no-emoji.js  
63. js/amongai-core.js  
64. js/amongai.js  
65. js/outlaw.js  
66. js/nds.js  
67. js/ui-dock.js  
68. js/fonts.js  
69. app.js

## แผนที่ไฟล์ (บทบาทมาจาก tools/file-roles.json · เพิ่มไฟล์ใหม่ต้องเพิ่มบรรทัดที่นั่น)
| ไฟล์ | บทบาท |
|---|---|
| `.gitignore` | รายการที่ git ไม่ติดตาม |
| `.nojekyll` | บอก GitHub Pages ให้เสิร์ฟไฟล์ตามจริง (ไม่ผ่าน Jekyll) |
| `CHANGES.md` | บันทึกการเปลี่ยนแปลงแบบเล่าเรื่อง (อ่านเมื่อถูกขอ ไม่ต้องอ่านทุกรอบ) |
| `DECISIONS.md` | เหตุผลของการตัดสินใจเชิงสถาปัตยกรรม (ตอบ 'ทำไมเป็นแบบนี้') |
| `HANDOFF.md` | ส่งต่องานให้ AI รอบถัดไป: สถานะ คำสั่งเริ่มงาน กฎที่ห้ามหลุด สิ่งที่ยังไม่ได้ทำ (เขียนด้วยมือ) |
| `NOW.md` | สถานะจริงของโปรเจกต์ สร้างอัตโนมัติจากโค้ด (node tools/make-now.js) อ่านก่อนเริ่มงานทุกครั้ง ห้ามแก้มือ |
| `README.md` | แนะนำโปรเจกต์ + วิธีติดตั้ง/ใช้ |
| `Readme.html` | หน้านำทางไปคู่มือ PWABuilder (ตกค้างจากตอนสร้าง TWA) |
| `Skill.md` | กติกาที่ไม่เปลี่ยนของ NINO (ถูกแนบในพรอมต์ทุกรอบ — สั้นไว้) ข้อเท็จจริงที่เปลี่ยนอยู่ที่ NOW.md |
| `app.js` | จุดเริ่มแอป: ผูกปุ่ม/เหตุการณ์ UI เข้ากับโมดูลอื่น โหลดสุดท้าย |
| `assetlinks.json` | Digital Asset Links ให้ TWA/APK ยืนยันโดเมน |
| `code-brain.js` | วิเคราะห์ stack trace → หาไฟล์/ฟังก์ชันที่เป็นต้นเหตุ ให้โหมดโค้ด |
| `data-trash.json` | ค่าตัวอย่างของถังขยะรูป (ค่าจริงอยู่ใน trash.js) |
| [ล็อก] `github-agent.js` | เครื่องมือ gh_* อ่าน/แก้/commit รีโปผ่าน Git Data API + ด่านอนุมัติไฟล์ป้องกัน (PROT) + bump version.js |
| `home.json` | รายชื่อไฟล์ 'บ้าน' ให้หน้าตรวจบ้านโหลด (สร้างโดย tools/make-manifests.py) |
| `index.html` | หน้าเดียวของแอป ลำดับ <script> คือลำดับโหลดจริง |
| `llms.txt` | ทางเข้าสำหรับ AI ภายนอกที่ท่องเว็บ: ชี้ไป NOW.md และ ai/manifest.json |
| [ล็อก] `lock.js` | หน้าต่างรหัสผ่านก่อนแก้ตัวเอง (self_patch/self_reset) |
| `manifest.json` | Web App Manifest (PWA) |
| [ล็อก] `nino-agent.js` | สมุดงาน (journal) · Skill.md ในเครื่อง · แผน · ตัวชี้วัดความคืบหน้า % |
| `nino-home.js` | หน้าต่างดู/แก้สกิลและไฟล์บ้านในแอป (ตัวแก้ Skill.md/notebook ของหอสมุด) |
| [ล็อก] `revive.js` | ย้อน commit ล่าสุดเมื่อแอปเปิดไม่ผ่าน (ถามยืนยันก่อนเสมอ) |
| `roleplay-callback.js` | จุดตรวจ (checkpoint) และกู้ต่อเมื่อการเรียกโหมดโรลเพลย์ขาดกลางทาง |
| [ล็อก] `self-upgrade.js` | แผง ตั้งค่า GitHub (owner/repo/branch/token) + ไคลเอนต์ Contents API รุ่นแรก |
| [ล็อก] `service-worker.js` | แคชออฟไลน์ (ชื่อแคช = เวอร์ชัน + รุ่นกำเนิด) + ชั้นไฟล์ที่แก้ในเครื่อง nino-ovr |
| [ล็อก] `skill-lib.js` | หอสมุดสกิล: sh/skill_*/self_patch/self_reset + เมล็ดสกิลจาก skills/manifest.json |
| `style.css` | สไตล์หลักของแอป |
| `trash.js` | ถังขยะรูปภาพ (IndexedDB) ลบอัตโนมัติตามเวลา |
| `update-notifier.js` | แบนเนอร์แจ้งรีเฟรช / ตรวจเวอร์ชันใหม่ / ป้ายเวอร์ชัน |
| `version.js` | เลขเวอร์ชัน + รุ่นกำเนิด (NINO_GEN) + build + changelog ย่อ (bump อัตโนมัติเมื่อ AI commit ไฟล์รันไทม์) |
| [ล็อก] `.github/` | workflow ของ GitHub Actions (แก้ผ่านแอปไม่ได้ ต้องอัปโหลดเอง; สำเนาอยู่ที่ android/ci/) |
| `ai/` | คู่มือ+รายชื่อไฟล์พร้อมแฮชสำหรับ AI ภายนอก (อ่านอย่างเดียว) |
| [ล็อก] `android/` | โปรเจกต์ Android (Kotlin) — ตัวห่อเว็บ + ระบบ OTA/เนทีฟ ดู android/ARCHITECTURE.md |
| `assets/` | สื่อที่ติดมากับแอป (ฉากห้องเรียน) พร้อม scenes.json รายการฉากในตัว |
| `games/` | เกม Outlaw Immortals (侠盗修仙) เวอร์ชันเว็บ คัดจาก Outlaw_Immortals.zip เฉพาะส่วนเว็บ ไม่ติดต่อเซิร์ฟเวอร์ของผู้พัฒนา ตรรกะการเล่นและการซื้อไม่แก้ ยกเว้นตัวจัดตารางเสียง index-x-7a43tV-2.mjs ที่ปรับตาม CHANGES.md (ดู skills/lab/games/outlaw และ DECISIONS.md) |
| `icons/` | ไอคอนแอป |
| `js/amongai-core.js` | แกนเกม Among AI: เครื่องจำลองและสมองผู้เล่นจาก among-us-ai (MIT) รวมเป็นไฟล์เดียวให้รันในเบราว์เซอร์ (สร้างจาก among-us-ai/src ด้วยการห่อโมดูล ไม่แก้กติกา) |
| `js/amongai.js` | หน้าเกม Among AI ในแอป: ปุ่มเปิดบนแถบเครื่องมือ แผนที่ ฟีดเหตุการณ์ และต่อสมองกับโมเดลที่ NINO ตั้งไว้ |
| `js/api-guard.js` | ตัวคุมการเรียกเครือข่าย: timeout, retry พร้อมถอยหลัง, ตัวตัดวงจรต่อโฮสต์, รู้สถานะออนไลน์/ออฟไลน์ |
| `js/auto-route.js` | เลือกโหมดงานอัตโนมัติจากข้อความ (แก้แอป / คุย / Local AI / Workshop) แทนปุ่มโฟกัสแมนนวล |
| `js/boot.js` | ลงทะเบียน service worker (เว็บล้วน) + รีโหลดเมื่อมีตัวควบคุมใหม่ |
| `js/characters.js` | ตัวละคร: สร้าง/เก็บ/สลับ/แชทต่อตัวละคร และลิ้นชักตัวละคร |
| `js/classroom.js` | ห้องเรียน NINO: ฉากวิดีโอวนลูป + วิจัยสูตรโค้ดเป็นร่างสกิล |
| `js/code-fast.js` | ทางลัดแก้โค้ด: edit_batch outline read_range grep_files undo multi progress_check + แผนที่โค้ดในพรอมต์ |
| `js/code-utils.js` | ตัวช่วยโค้ด: สแกนสัญลักษณ์ ตรวจไวยากรณ์ แทนที่ฟังก์ชัน |
| `js/config.js` | ค่าตั้งแอป + โปรไฟล์ผู้ให้บริการ (Gemini/9arm/TokenMe/Local) + getCfg/compatProfile |
| `js/console-ui.js` | หน้า Console เต็มจอ: Terminal · Versions · Godview · Logs |
| `js/context-manager.js` | จัดงบบริบท/โทเคนต่อโมเดล |
| `js/continuation.js` | เขียนต่ออัตโนมัติแบบจัดประเภทเหตุผลที่โมเดลหยุด: ถูกตัด/สัญญาณหลุด = ต่อทันที · ขัดข้องชั่วคราว = ลองใหม่ · ตัวกรองเนื้อหา = ลองใหม่จำกัดรอบแล้วแจ้งตรงๆ ใช้ร่วมกันในโรลเพลย์และแชท |
| [ล็อก] `js/delegate.js` | เครื่องมือ delegate: ฝากงานเล็กให้โมเดลถูก (9arm/TokenMe) พร้อมเพดานบริบทและตัวกันความลับ |
| `js/focus-chat.js` | โหมดโฟกัสคุย (C/L) ใช้พรอมต์คุยสั้น |
| `js/fonts.js` | ตัวเลือกฟอนต์ |
| `js/godview.js` | ภาพหน้าจอจริงก่อน/หลัง + เทียบ DOM เพื่อให้ AI เห็นผล |
| `js/home-check.js` | ตรวจสุขภาพ 'บ้าน' (ขนาด/แฮช/ไวยากรณ์/ชื่อซ้ำ) + ลิงก์ให้ AI ภายนอก |
| `js/hud-card.js` | การ์ด HUD ของ NINO (แม่แบบ HTML ของผู้ใช้): โมเดลส่งช่องข้อมูล ระบบวาดการ์ดและหุ้มค่า · ปุ่มตัวเลือกกดส่งต่อ · สัญญาณหยุดเอง [[END]] / stop:true · คำสั่งรูปแบบตอบ (spec) ของโรลเพลย์และโค้ด |
| `js/image-bridge.js` | แนบรูป → บีบอัด → รอในช่องข้อความ + ดวงตาช่วยโมเดลที่มองรูปไม่ได้ |
| `js/keep-awake.js` | ให้จอไม่ดับระหว่าง NINO กำลังเขียนคำตอบ (Screen Wake Lock) ซ้อนได้ ปล่อยเมื่อเสร็จ ยกเลิกเมื่อแอปไปพื้นหลังแล้วขอใหม่เมื่อกลับมา |
| `js/learn.js` | การเรียนรู้: ตรวจข้อสอบตอนเรียน (หลักฐานกับแหล่งที่ค้นจริง ลิงก์ โค้ด) ทดสอบซ้ำจากไฟล์ที่เก็บ และส่งการ์ด "ความรู้ใหม่" เข้าแชท |
| [ล็อก] `js/lib-health.js` | ตรวจสุขภาพหอสมุดสกิล (แดง >500 บรรทัด / pointer คลุมเครือ / ประตูตัดสินใจ) เครื่องมือ lib_health + `nino lib` + ผู้ใช้เรียกสกิลเองด้วย /ชื่อเล่ม |
| `js/llm-providers.js` | เรียกโมเดล (Gemini / OpenAI-compatible: 9arm, TokenMe / Local) + ลองโมเดลสำรอง |
| [ล็อก] `js/loop-guard.js` | ตัวกันลูป: เตือนเบาๆ แล้วหยุดเมื่อวนจริง (6 ครั้ง) ไม่นับการอ่านไฟล์ต่างกันว่าวน |
| `js/memory.js` | ความจำ: เหตุการณ์/เวกเตอร์/ค้นความหมาย/สรุป ใน IndexedDB |
| `js/modes-session.js` | โหมด code/roleplay · เซสชัน · เครื่องมือ journal/skill/plan · ด่านโรลเพลย์ · skill_pull |
| `js/music.js` | ปุ่มเพลงข้างปุ่ม Build เล่นลิงก์ YouTube ผ่านเครื่องเล่นฝังตัว: เสียงอย่างเดียว (ซ่อน) หรือดูวิดีโอ 16:9 ใต้ปุ่มได้ พร้อมแผงควบคุม แถบเลื่อนเวลา พับแผง ชื่อเพลงจริง รายการเพลง วนซ้ำ ระดับเสียง ตรวจสถานะเสียงจริงจาก YouTube และโน้ตลอย |
| [ล็อก] `js/native-bridge.js` | สะพานเว็บ↔เนทีฟ Android (ตู้นิรภัยคีย์ ฯลฯ) |
| `js/nds.js` | ทางเข้าห้องสมุด NDS: ปุ่มในแถบเครื่องมือ + overlay เปิด games/nds/index.html ผูกการย้อนกลับกับ ninoOutlaw.back |
| `js/nino-sys.js` | ปุ่ม Build + ขั้นเวอร์ชัน + เครื่องมือ AI สำหรับแอปจริง |
| `js/no-emoji.js` | กรองอิโมจิออกจากคำตอบของโมเดลก่อนแสดง (กติกา: ห้ามใช้อิโมจิ) |
| `js/notes.js` | บันทึกย่อ: สรุปทุก 8 รอบที่คุยจบ แก้ไข สร้างใหม่ ลบ ไปยังเนื้อเรื่อง และส่งบันทึกย่อล่าสุดเข้า system prompt ทุกโหมด · เมนู + มีตัวเลือกบันทึกย่อ |
| [ล็อก] `js/obs.js` | สังเกตการณ์: บัฟเฟอร์ error/warn ในหน้า + ส่งต่อ log เนทีฟ (โหลดก่อนใครเพื่อจับ error ตอนบูต) |
| `js/orchestrator-core.js` | สร้างพรอมต์ระบบ ตรวจเจตนา ย้อน/diff ลูปสั่งงาน callNinoLLM dispatchGH |
| `js/orchestrator-tools.js` | รันเครื่องมือของโหมดโค้ด (dispatchTool) + เริ่มรอบงาน |
| [ล็อก] `js/ota.js` | ไคลเอนต์ OTA: อัปเดตเว็บบันเดิล/APK จาก GitHub releases (ความปลอดภัยอยู่ที่ฝั่งเนทีฟ) |
| `js/outlaw.js` | ปุ่ม Outlaw บนแถบเครื่องมือและหน้าเกมเต็มจอที่ฝังเกมในไอเฟรม (ดู skills/lab/games/outlaw) |
| [ล็อก] `js/prompt-cache.js` | จัดพรอมต์โหมดโค้ดให้ส่วนนิ่งอยู่บน ส่วนที่เปลี่ยนทุกรอบอยู่ท้าย (แคชพรีฟิกซ์) + นับการล้างแคช/โทเคนที่ผู้ให้บริการรายงาน เครื่องมือ cache_report + `nino cache` |
| `js/research.js` | ค้น Wikipedia/Stack Overflow แบบมีโควต้า (ใช้ในห้องเรียน) |
| `js/roleplay.js` | โหมดโรลเพลย์: สนทนา/ฉาก/ภารกิจอ่านอย่างเดียว |
| `js/scenes.js` | ศูนย์ดาวน์โหลดฉาก: แพ็กสื่อโหลดตามต้องการ/พื้นหลัง ตรวจแฮช เก็บใน Cache Storage แพตช์เฉพาะไฟล์ที่เปลี่ยน |
| `js/shelf.js` | ห้องสมุดแบบชั้นหนังสือ: หมวดเป็นผนัง ชั้นเป็นแผ่นไม้ เล่มกับสมุดจดวางคู่กัน เปิดเล่มเห็นหน้าสกิล สมุดจด และผลสอบ |
| [ล็อก] `js/term.js` | เทอร์มินัลจริงบนมือถือ (เชลล์เนทีฟ) + คำสั่ง nino |
| `js/threads.js` | หัวข้อแชท: แต่ละแชทมีข้อความ ประวัติ LLM ไฟล์ และตัวละครของตัวเอง ตั้งชื่อจากบริบท เปิด เปลี่ยนชื่อ ลบ และคืนแชทที่ใช้งานอยู่หลังรีโหลด |
| `js/ui-dock.js` | จัดตำแหน่งปุ่ม: ย้าย GH และศูนย์ดาวน์โหลดฉากไปแถบเลื่อนด้านบน และเปลี่ยนปุ่มแนบรูปเป็นเครื่องหมายบวก |
| `js/ui-input.js` | ส่งข้อความ ยกเลิกงาน คัดลอก ตัวตรวจ (inspector) และแท็บ |
| `js/ui-render.js` | วาดแชท/ข้อความ/เช็กลิสต์/แบนเนอร์/ toast และแถบงบ |
| `js/ui-tools.js` | หน้าต่างเครื่องมือ UI: นำเข้าไฟล์ นำเข้า/ส่งออกความจำ ตั้งค่า ค้น/แทนที่ |
| `js/web-search.js` | ค้นเว็บ (เปิด/ปิดได้) ใช้ในแชทและห้องเรียน: Wikipedia, DuckDuckGo, Stack Overflow, Google ผ่าน Gemini; เครื่องมือ web_search |
| `js/workshop.js` | Workshop: สวิตช์เปิดห้องทดลองไฟล์เสมือนและพรีวิว (แยกจากงานแก้แอป เพื่อไม่ให้ AI หลงบริบท) |
| `legacy/` | ของรุ่นเก่าที่เก็บไว้อ้างอิง (ไม่โหลดในแอป) |
| `local-ai/bridge.js` | สะพานคุยกับเซิร์ฟเวอร์ Local AI (ตั้งค่าอุณหภูมิ/บริบท/persona) |
| `local-ai/endpoint.js` | รายการเอนด์พอยต์สำเร็จรูป (Ollama, llama-server, MNN ...) + ค้นหา/สร้างคีย์ |
| `local-ai/health.js` | จุดสถานะสุขภาพเซิร์ฟเวอร์ Local AI |
| `local-ai/key.js` | โหมดคีย์ Local AI + รายชื่อเครื่องมือที่ AI ตัวเล็กใช้ได้ (ALLOW) |
| `local-ai/ui.js` | หน้าตั้งค่า Local AI |
| `packs/` | แพ็กฉาก (สื่อที่ไม่อยู่ในตัวติดตั้งหลัก) โหลดตามต้องการผ่านศูนย์ดาวน์โหลดฉาก; manifest.json สร้างโดย tools/make-packs.py |
| `patches/` | เลิกใช้ — เนื้อหาย้ายเข้าหอสมุดสกิลแล้ว (ลบโฟลเดอร์ได้) |
| `skills/` | หอสมุดสกิล หมวด › ชั้น › เล่ม (Skill.md + notebook.md คู่กันเสมอ) + _gates.md ประตูตัดสินใจ — สารบัญอยู่ใน NOW.md |
| `third_party/` | โค้ดจากโปรเจกต์ภายนอกที่นำมาใช้ (มีใบอนุญาตคู่กันในโฟลเดอร์) |
| [ล็อก] `tools/check.js` | ด่านตรวจสถิต (ไวยากรณ์ ลำดับ script สัญญา JS↔Kotlin เอกสาร/สกิล/ด่านอนุมัติ) รัน: node tools/check.js [--strict] |
| [ล็อก] `tools/ci/` | สคริปต์ CI (บันเดิล OTA, APK, เซ็นชื่อ, ปล่อยรุ่น) |
| `tools/file-roles.json` | บทบาทของแต่ละไฟล์ (ต้นทางของแผนที่ไฟล์ใน NOW.md) — เพิ่มไฟล์ใหม่ต้องเพิ่มบรรทัดที่นี่ |
| `tools/make-manifests.py` | สร้าง home.json · skills/manifest.json · ai/manifest.json |
| [ล็อก] `tools/make-now.js` | สร้าง NOW.md จากโค้ดจริง (--check = ตรวจว่าตรงไหม) |
| `tools/make-packs.py` | สร้าง packs/manifest.json (ขนาด+sha256+เวอร์ชันจากเนื้อไฟล์) --check = ตรวจว่าตรงไหม |
| `tools/nds-core/` | แกน NDS: ซอร์ส ndsemu (MIT) และ entry wasm ทดสอบ ไม่เข้าบันเดิลเว็บ (prepare-web ข้าม tools/) |
| [ล็อก] `tools/test/` | เทสต์: web.test.js (ฟังก์ชันล้วน) · browser.test.js (เบราว์เซอร์จริง Playwright) · harness/native-mock |
| `tools/verify-all.sh` | รันด่านตรวจทั้งหมดในคำสั่งเดียว (static, web test, browser test, เอกสารตรงโค้ด, แพ็ก, JVM) |

## เครื่องมือของ AI (อ่านจากโค้ด)
- รีโป GitHub: gh_tree gh_outline gh_read gh_grep gh_edit gh_create gh_delete gh_move gh_diff gh_status gh_discard gh_commit gh_history gh_restore gh_multi_read gh_read_func gh_diagnose
- หอสมุด/ไฟล์: sh skill_index skill_read skill_note skill_new self_patch self_reset
- ทางลัดแก้โค้ด: edit_batch edit outline read_range grep_files undo multi progress_check
- สมุดงาน/แผน/Skill.md: wallet budget_check journal_note skill_load skill_save skill_sync skill_pull plan_table recall remember switch_mode
- ฝากงานโมเดลถูก: delegate (ใช้ได้เมื่อตั้งคีย์ 9arm หรือ TokenMe)
- ตรวจสุขภาพ: lib_health cache_report (ผู้ใช้: `nino lib` `nino cache` ในเทอร์มินัล · เรียกสกิลเองด้วย /ชื่อเล่ม ในแชท)

## ผู้ให้บริการโมเดล
- Gemini (ค่าเริ่มต้น) · Local AI (OpenAI-compatible บนเครื่อง/เครือข่าย)
- 9arm: https://gateway.9arm.co/v1 · โมเดลเริ่มต้น qwen3.8-27b-fp8
- TokenMe: https://api.tokenme.limited/api/v1 · โมเดล deepseek-ai/deepseek-v4-flash-0731, unsloth/qwen3.8-27b-nvfp4, google/gemma-4-31b-it

## ด่านตรวจ (รันก่อนส่งงานเสมอ)
- `node tools/check.js` ด่านสถิต (เพิ่ม `--strict` = เอกสาร/แมนิเฟสต์ที่สร้างอัตโนมัติต้องตรงเป๊ะ) · `node tools/test/web.test.js` · `node tools/test/browser.test.js` (ต้องมี Playwright) · `node tools/make-now.js`
- หลังเพิ่ม/ลบไฟล์ หรือเปลี่ยนเครื่องมือ: `node tools/make-now.js && python3 tools/make-manifests.py`

## หอสมุดสกิล (หมวด/ชั้น: เล่ม)
คำอธิบายแต่ละเล่มและประตูตัดสินใจอยู่ในสารบัญสกิลของพรอมต์ (และ `skills/_gates.md`) — ไม่ซ้ำที่นี่เพื่อไม่ให้ไฟล์นี้อ้วน ตรวจสุขภาพด้วย `nino lib` / `lib_health`
- code/analysis: code-analysis, decision-record, reuse-first
- code/debug: debug-loop, debug-mantra, post-mortem
- code/delegate: qwen-agent
- code/editing: anti-loop, fact-first, fast-edit
- code/review: scrutinize, security-review, silent-failure-hunter, verify-loop
- code/testing: tdd-loop
- code/web-files: html-workbench, ui-fix-mobile
- lab/games: amongai, outlaw
- lab/research: research-method
- lang/thai: thai-text
- library/keep: library-audit, notebook-keeping, pointer-audit
- library/make: skill-writer
- system/android: android-native
- system/budget-plan: compact-at-boundary, plan-and-budget, prompt-cache, qwenchance
- system/local-ai: local-brain
- system/repo-self: careful-mode, github-ops, home-inspect, self-fix, self-upgrade
- work/comms: management-talk
