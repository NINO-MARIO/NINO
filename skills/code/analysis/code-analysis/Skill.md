# code-analysis
ก่อนแก้หรือรีแฟกเตอร์โค้ด: วิเคราะห์ขนาดไฟล์ ฟังก์ชันที่ยาวเกิน และชื่อซ้ำ
## ขั้นตอน
1. sh run skills/code/analysis/code-analysis/scripts/outline.js home/js/home-check.js home/nino-home.js (ใส่ path ได้หลายไฟล์ ไม่ใส่ = ไฟล์โปรเจกต์ใน Files)
2. ฟังก์ชันที่ยาวเกิน 120 บรรทัดให้พิจารณาแยก · ชื่อซ้ำข้ามไฟล์ดู debug-loop/find_dup_globals.js
3. สรุปผลเป็นรายการ "ปัญหา → ผลกระทบ → วิธีแก้" แล้วจดสมุด
