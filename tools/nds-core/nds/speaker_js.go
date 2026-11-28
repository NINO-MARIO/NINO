//go:build js

package nds

// WebEnableSpeaker ตั้งเพาเวอร์แมเนเจอร์ให้ลำโพงเปิด (บิต0=1, บิต1=0 ไม่ปิดเสียง)
// ใช้เฉพาะบิวด์เว็บ: โหมดข้าม BIOS ไม่มี BIOS มาตั้งค่านี้ให้ ไม่งั้น AudioEnabled เป็นเท็จตลอด
// และอีมูเลเตอร์ไม่สร้างเสียงเลย (ดู emulator.go ช่วงเสียงต่อบรรทัด)
func WebEnableSpeaker() {
	if Emu != nil {
		Emu.Hw.Pow.cntrl = 0x01
	}
}
