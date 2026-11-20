# แผนแยกเอนจิน NDS ออกจาก SDL2/cgo (สถานะ: รอผล probe จาก CI)

เอกสารนี้ไม่ใช่โค้ด ใช้กำหนดลำดับการแก้ให้ตรงกับ error จริง อย่าเริ่มแก้โดยไม่มี probe-summary.txt

## ขอบเขตที่วัดได้ (จากการค้นหาในรีโป)
- emu/hw/hw.go (343 บรรทัด): หน้าต่าง, renderer, texture, เสียง (OpenAudioDevice/QueueAudio), คีย์บอร์ด/เมาส์, PollEvent, วาด surface ทั้งหมดผูกกับ SDL ใน sdl.Do
- emu/hw/audio.go และ audiocb.go: audioSpecSetCallback ใช้ sdl.AudioSpec และ audiocb.go ใช้ cgo (C.audioCallbackC)
- emu/hw/keys.go (257 บรรทัด): ค่าคงที่ SCANCODE_* ที่คัดลอกมาจาก sdl
- emu/hw/battery_darwin.go: ผูกกับ macOS (ไม่กระทบ wasm ถ้ามี battery.go ครอบ)
- ndsemu.go (366 บรรทัด, package main): entry ของโปรแกรม ใช้ SDL เปิดหน้าต่าง
- emu/debugger/tui.go และ debugger.go: ใช้ termui
- arm/jitarm_amd64.go: JIT ของ amd64 (ไม่ถูกเลือกบน wasm ด้วยชื่อไฟล์ _amd64)
- emu/fixed: แก้แล้วด้วย mul128_generic.go (ยังไม่ได้คอมไพล์)

## ทิศทางการแก้ (ทำตามลำดับ ทีละแพ็กเกจ ตาม error จริง)
1. กำหนด interface ที่ emu/hw เช่น Backend ที่มี Init, Present(RGBA 256x384), PushAudio(int16), PollInput, Ticks, Close
2. ย้ายโค้ด SDL ทั้งหมดไปไฟล์ที่มี build tag `//go:build !js` (sdl_backend.go) โดยไม่เปลี่ยนพฤติกรรม
3. เขียน backend สำหรับ wasm (js_backend.go, `//go:build js && wasm`) ที่ส่งเฟรมและเสียงออกไปยัง JS ผ่าน syscall/js แล้วให้ JS วาดด้วย canvas และเล่นเสียงด้วย WebAudio
4. แทน audiocb.go ที่ใช้ cgo ด้วย callback ที่ไม่ใช้ cgo หรือให้ backend เป็นคนดึงเสียง
5. ย้าย ndsemu.go ที่เป็น main ไปเป็นแพ็กเกจที่ wasm เรียกได้ หรือปล่อยให้ wasm/main.go เป็นจุดเข้า
6. debugger: ครอบ tui.go ด้วย build tag ที่ไม่รวมบน wasm

## ข้อห้าม
- ห้ามคัดลอกโค้ดของโปรเจกต์อื่นที่มีไลเซนส์ต่างจาก MIT ของ ndsemu เข้ามา (เช่น DeSmuME GPL)
- ห้ามแก้ไฟล์ _amd64 หรือ .s เดิมให้เปลี่ยนพฤติกรรมบนเครื่องจริง
- ทุกการแก้ต้องผ่าน job build-wasm และ probe-engine ก่อนรวม

## การทดสอบ
- ต้องคอมไพล์ wasm ได้ทั้งหมด (probe-engine ทุกแพ็กเกจ OK)
- แกน wasm ต้องเปิดได้โดยไม่มี BIOS แล้วคืนภาพทดสอบ (phase 0a) ผ่านห้องแอป
- ไม่มีการอ้างว่าเกมเชิงพาณิชย์เล่นได้ก่อนทดสอบจริง
