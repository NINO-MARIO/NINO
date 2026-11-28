package nds
import (
	"bytes"
	"encoding/binary"
	"io"
	log "ndsemu/emu/logger"
)

type CartHeader struct {
	Title      [12]byte
	Gamecode   [4]byte
	Maker      [2]byte
	Unit       byte
	EncSeed    byte
	Capacity   byte
	Reserved1  [9]byte
	RomVersion byte
	Autostart  byte

	Arm9Offset uint32
	Arm9Entry  uint32
	Arm9Ram    uint32
	Arm9Size   uint32

	Arm7Offset uint32
	Arm7Entry  uint32
	Arm7Ram    uint32
	Arm7Size   uint32
}

func (c *CartHeader) Read(r io.Reader) error {
	if err := binary.Read(r, binary.LittleEndian, c); err != nil {
		return err
	}
	return nil
}

func copyToRam(dst []byte, src io.ReaderAt, dstOff, srcOff, size uint32) error {
	chunk := make([]byte, size)
	if _, err := src.ReadAt(chunk, int64(srcOff)); err != nil {
		return err
	}
	copy(dst[dstOff:dstOff+size], chunk)
	return nil
}

func InjectGamecard(gc *Gamecard, mem *NDSMemory) error {
	// read the cartridge header
	data := make([]byte, gc.Size)
	if _, err := gc.ReadAt(data, 0); err != nil {
		return err
	}
	buf := bytes.NewBuffer(data)
	ch := &CartHeader{}
	ch.Read(buf)

	// copy the gamecard data into memory destinations specified by header
	err := copyToRam(
		mem.Ram[:],
		gc,
		ch.Arm9Ram-0x2000000,
		ch.Arm9Offset,
		ch.Arm9Size,
	)
	log.ModEmu.InfoZ("inject ARM9 code").Hex32("off", ch.Arm9Offset).Hex32("size", ch.Arm9Size).Hex32("ram", ch.Arm9Ram).End()
	if err != nil {
		return err
	}
	Nds9.Cpu.SetPC(ch.Arm9Entry)

	// โค้ด ARM7 อาจอยู่ใน WRAM ของ ARM7 (เช่น 0x037F8000) ไม่ใช่ RAM หลัก ต้องคัดลอกไปที่ WRAM แทน
	// มิฉะนั้นดัชนีจะเกินขนาด RAM หลักแล้วโปรแกรมปิดตัว (พบจากตลับ NINO TEST)
	// SkipBios ตั้ง WRAMCNT=3 (ARM7 ได้ WRAM ร่วม 32K) จึงคัดลอกลง WRAM ร่วมที่ ARM7 มองเห็น
	arm7Dst, arm7Off := mem.Ram[:], ch.Arm7Ram-0x2000000
	if ch.Arm7Ram >= 0x03000000 {
		arm7Dst, arm7Off = Emu.Hw.Mc.WramBytes(), ch.Arm7Ram&0x7FFF
	}
	err = copyToRam(
		arm7Dst,
		gc,
		arm7Off,
		ch.Arm7Offset,
		ch.Arm7Size,
	)
	log.ModEmu.InfoZ("inject ARM7 code").Hex32("off", ch.Arm7Offset).Hex32("size", ch.Arm7Size).Hex32("ram", ch.Arm7Ram).End()
	if err != nil {
		return err
	}
	Nds7.Cpu.SetPC(ch.Arm7Entry)

	// Header is copied by BIOS to 0x27FFE00
	copyToRam(mem.Ram[:], gc, 0x3FFE00, 0, 0x180)

	return nil
}
