# html-workbench
ก่อนสร้างหรือแก้หน้า html ในแท็บ Files: ดูไฟล์เดิมก่อน แก้ไฟล์เดิม ไม่สร้างไฟล์ใหม่ซ้ำ และยืนยันว่าผู้ใช้เห็นไฟล์
## ขั้นตอน
1. sh run skills/code/web-files/html-workbench/scripts/audit_files.js — ดูไฟล์ที่มีก่อนเสมอ
2. มี html อยู่แล้ว → แก้ไฟล์เดิม (replace_function / stream_append / write_file ชื่อเดิม) ห้ามสร้าง index2.html, page3.html
3. สร้างไฟล์ใหม่ได้เมื่อผู้ใช้พิมพ์ "ไฟล์ใหม่" เท่านั้น (ระบบบล็อกให้)
4. เสร็จแล้ว sh ls เพื่อยืนยันว่าไฟล์อยู่ในแท็บ Files
