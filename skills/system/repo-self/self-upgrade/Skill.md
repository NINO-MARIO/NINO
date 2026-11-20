# self-upgrade
แก้โค้ดแอป (js/css) ในเครื่องตัวเองทันที ไม่ต้องรอ GitHub — เก็บใน Cache 'nino-ovr' แล้ว service worker เสิร์ฟทับไฟล์เดิม
## ขั้นตอน
1. อ่านโค้ดที่จะแก้ก่อน (gh_read หรือ self_patch ไม่ส่ง ops เพื่อดูไม่ได้ — ใช้ gh_grep/gh_read)
2. self_patch {path,ops:[{find,replace}]} — find ต้องเจอ 1 จุดพอดี · ระบบตรวจ syntax ก่อนบันทึก
3. ผู้ใช้จะเห็นหน้าต่าง "โปรดกรอกรหัสผ่าน" ให้ผู้ใช้กรอกเอง ห้ามถามหรือเดารหัส
4. บอกผู้ใช้ให้รีโหลดแอป ถ้าเปิดไม่ขึ้น เปิด URL ต่อท้าย ?safe=1 (ล้างการแก้ทั้งหมด) หรือ self_reset {path?}
5. แก้ index.html / service-worker.js ในเครื่องไม่ได้ — ใช้ GitHub
6. sh run skills/system/repo-self/self-upgrade/scripts/check_syntax.js ตรวจ js ในแท็บ Files
