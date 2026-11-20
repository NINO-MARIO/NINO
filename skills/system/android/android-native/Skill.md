# android-native
แก้/ขยายแกนเนทีฟของ NINO (Kotlin) อย่างปลอดภัย และสั่งบิลด์ APK ผ่าน GitHub Actions
## ขั้นตอน
1. แผนที่: android/app/src/main/java/app/nino/ = MainActivity (WebView ล็อก) · Vault (Keystore) · NativeBridge (สะพาน JS) · js/native-bridge.js (ฝั่งเว็บ)
2. เพิ่มความสามารถเนทีฟ = เพิ่ม op ใหม่ใน NativeBridge.onPostMessage + เมธอดใน js/native-bridge.js ห้ามใช้ addJavascriptInterface
3. ทุก op ต้องตรวจอินพุต (ชื่อ vault ผ่าน Vault.validName, URL ผ่าน allowed()) และห้ามส่งความลับกลับไป JS
4. แก้ไฟล์ผ่าน gh_edit → gh_commit แล้วให้ผู้ใช้รัน Actions "NINO Android APK" (ขั้นตอนมือใหม่อยู่ใน android/GUIDE-TH.md) ถ้าบิลด์แดงให้ขอข้อความ error มาอ่านแล้วแก้ ห้ามเดา
5. งานใหญ่/ข้ามชั้น (ย้ายหน้าจอเป็น Compose, ฐานข้อมูล) ให้ทำเป็นเฟสตาม android/README.md และจดสมุด
## ข้อจำกัด
- ที่นี่คอมไพล์ Kotlin เองไม่ได้ ความถูกต้องรู้จากผลบิลด์ของ Actions เท่านั้น
