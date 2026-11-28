//go:build js

package nds

import (
	"encoding/binary"

	"ndsemu/arm"
)

// ส่วนของแกนเว็บเท่านั้น (build tag js) ไม่กระทบเดสก์ท็อป

// WebSoftErrors คืนจำนวนครั้งที่ CPU ผิดพลาดในโหมดนุ่ม (ให้หน้าเว็บแสดงได้)
func WebSoftErrors() int { return arm.SoftErrors }

// WebSoftBreakpoints ให้ CPU ทำต่อเมื่อเจอสถานะผิดพลาด แทนการปิดโปรแกรมทั้งตัว
// (บนเว็บไม่มีดีบักเกอร์ ถ้าปิดโปรแกรม หน้าเว็บจะใช้แกนนั้นต่อไม่ได้เลย)
func WebSoftBreakpoints() { arm.SoftBreakpoints = true }

// ตำแหน่งข้อมูลการสอบเทียบหน้าจอสัมผัสใน RAM หลัก (เหมือนที่ BIOS คัดลอกจาก firmware)
const webCalBase = 0x3FFC80

// WebCalibrateTouch ใส่ค่าสอบเทียบมาตรฐานเมื่อ firmware ว่าง (ไม่งั้นตัวหารเป็นศูนย์ตอนแตะ)
func WebCalibrateTouch() {
	if Emu == nil {
		return
	}
	ram := Emu.Mem.Ram[:]
	binary.LittleEndian.PutUint16(ram[webCalBase+0x58:], 0x0100) // adcX1
	ram[webCalBase+0x5C] = 0                                     // scrX1
	binary.LittleEndian.PutUint16(ram[webCalBase+0x5E:], 0x0EF0) // adcX2
	ram[webCalBase+0x62] = 255                                   // scrX2
	binary.LittleEndian.PutUint16(ram[webCalBase+0x5A:], 0x0100) // adcY1
	ram[webCalBase+0x5D] = 0                                     // scrY1
	binary.LittleEndian.PutUint16(ram[webCalBase+0x60:], 0x0F00) // adcY2
	ram[webCalBase+0x63] = 191                                   // scrY2
}

func webCalibrationValid() bool {
	ram := Emu.Mem.Ram[:]
	return ram[webCalBase+0x5C] != ram[webCalBase+0x62] &&
		ram[webCalBase+0x5D] != ram[webCalBase+0x63]
}

// WebSetTouch ตั้งตำแหน่งปากกา (x 0..255, y 0..191) และสถานะกด
func WebSetTouch(x, y int, down bool) {
	if Emu == nil || Emu.Hw == nil || Emu.Hw.Tsc == nil {
		return
	}
	if down && !webCalibrationValid() {
		WebCalibrateTouch()
	}
	Emu.Hw.Tsc.SetPen(down, x, y)
}

// WebSaveData คัดลอกข้อมูลแบ็คอัพ (เซฟในตลับ) ปัจจุบัน
func WebSaveData() []byte {
	if Emu == nil || Emu.Hw == nil || Emu.Hw.Bkp == nil {
		return nil
	}
	s := Emu.Hw.Bkp.sram
	out := make([]byte, len(s))
	copy(out, s)
	return out
}

// WebLoadSaveData ใส่ข้อมูลแบ็คอัพที่เคยบันทึกกลับเข้าไป
func WebLoadSaveData(data []byte) {
	if Emu == nil || Emu.Hw == nil || Emu.Hw.Bkp == nil {
		return
	}
	Emu.Hw.Bkp.sram = append(MMap(nil), data...)
}
