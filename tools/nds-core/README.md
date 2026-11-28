# แกน NDS (tools/nds-core)

ซอร์ส ndsemu (MIT, Giovanni Bajo) คัดลอกมาทั้งชุดโดยไม่รวม vendor ไม่เข้าบันเดิลเว็บ เพราะ prepare-web ข้ามโฟลเดอร์ tools/

สถานะ:
- wasm/ คือ entry ของ Phase 0a สำหรับทดสอบท่อส่ง wasm ทั้งระบบ มีการรับ BIOS, อ่านหัวตลับ และภาพทดสอบ ใช้ได้โดยไม่ต้องพึ่งเอนจินจำลอง
- โฟลเดอร์รากเป็นเอนจิน ndsemu เดิม ยังเป็น package main และผูกกับ SDL2 (cgo) จึงยังคอมไพล์เป็น wasm ไม่ได้
- CI: .github/workflows/nds-wasm.yml build เฉพาะ wasm/ (หน้าทดสอบ) แล้วอัปโหลดเป็น artifact ชื่อ nds-core-wasm
  (ก่อนหน้านี้ README เคยเขียนว่า CI probe ทุกครั้ง ซึ่งไม่เป็นความจริง ไม่มี job นี้มาก่อน)
- CI probe (job probe-engine, ไม่ทำให้ workflow ล้ม): คอมไพล์ทุกแพ็กเกจของเอนจินเป็น wasm แล้วอัปโหลด probe.log และ probe-summary.txt เป็น artifact ชื่อ nds-engine-wasm-probe
- mul128/div128 สำหรับ wasm: emu/fixed/mul128_generic.go (Go ล้วน ตรวจตรรกะกับการคำนวณจริงแล้วในช่วงที่ IDIVQ รองรับ ยังไม่ได้คอมไพล์)
- wasm/ มี go.mod ของตัวเอง (module ndsemu/wasm) เพื่อไม่ให้ go build โหลด dependency ของเอนจินที่ปักเวอร์ชันปลอม
- ผล probe รอบแรก: 9 แพ็กเกจผ่าน (รวม emu/fixed ซึ่งยืนยันว่า mul128_generic.go คอมไพล์เป็น wasm ได้) 12 แพ็กเกจล้มเหลว ได้แก่ root, arm, e2d, emu, emu/debugger, emu/hw, emu/hwio, emu/jit, emu/logger, emu/spi, homebrew, raster3d
- ยังไม่ได้ต่อ artifact เข้าห้องแอป: games/nds ยังไม่โหลด core.wasm จาก CI และ wasm/ ไม่ได้ import เอนจิน
- สร้างในเครื่อง: bash tools/nds-core/build-wasm.sh (ต้องมี Go 1.21+) ผลอยู่ที่ build/nds/ ซึ่งไม่เข้ารีโป

ขั้นถัดไป: แยกโค้ดเอนจินเป็นแพ็กเกจที่ไม่ใช้ SDL แล้วให้ wasm/ เรียกใช้ได้จริง
