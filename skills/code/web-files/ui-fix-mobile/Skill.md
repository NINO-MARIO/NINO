# ui-fix-mobile
แก้ปุ่ม/ไฟล์บังกัน และปุ่มเลือกไฟล์ไม่ทำงานบนมือถือ/WebView
## ขั้นตอน
1. ปุ่มเลือกไฟล์: ใช้ <label><input type=file></label> ให้แตะ input จริง ห้าม input.click() แล้วลบ/ปิดหน้าต่างทันที
2. ซ่อน input ด้วย opacity:0 ทับในปุ่ม ไม่ใช้ left:-9999px
3. หน้าต่างลอยต้อง z-index สูงกว่าแบนเนอร์/toast/แถบล่าง
4. ปุ่มแตะขั้นต่ำ 44x44px เผื่อ safe-area ด้านล่าง (env(safe-area-inset-bottom))
5. ตรวจว่าไม่มี element position:fixed ทับพื้นที่ปุ่ม (grep position:fixed)
