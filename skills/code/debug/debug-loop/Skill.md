# debug-loop
หาและแก้บั๊กโค้ด NINO แบบไม่เดา: ทำซ้ำ → แยกจุด → แก้จุดเดียว → ตรวจ
## ขั้นตอน
0. เครื่องมือเฉพาะของ NINO — วินัยหาบั๊กทั่วไป (ทำซ้ำ/ล้มสมมติฐาน/สมุดเบาะแส) อยู่ที่ debug-mantra อ่านก่อนเมื่อบั๊กไม่ตรงไปตรงมา · แก้จบแล้ว post-mortem
1. อ่านข้อความ error จริงก่อน (คอนโซล/self_diagnose) ห้ามเดา
2. sh run skills/code/debug/debug-loop/scripts/find_dup_globals.js — ชื่อซ้ำข้ามไฟล์คือสาเหตุยอดฮิต (สคริปต์ใช้ global ร่วมกัน)
3. sh run skills/system/repo-self/self-upgrade/scripts/check_syntax.js (หรือ self_diagnose) ตรวจไวยากรณ์
4. แก้จุดเดียวต่อรอบ แล้วตรวจซ้ำ เกิน 3 รอบไม่หาย → หยุดและถามผู้ใช้
