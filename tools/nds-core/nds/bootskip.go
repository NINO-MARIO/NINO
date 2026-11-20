package nds

import "errors"

// SkipBios leaves the machine in the state the BIOS would leave it in, so a
// ROM can run without the BIOS files (used by the -s flag).
func SkipBios() error {
	if Emu == nil {
		return errors.New("skip bios: the emulator is not created yet")
	}
	if err := InjectGamecard(Emu.Hw.Gc, Emu.Mem); err != nil {
		return err
	}

	// Shared wram: map everything to ARM7
	Emu.Hw.Mc.WramCnt.Write8(0, 3)

	// Set post-boot flag to 1
	Nds9.misc.PostFlg.Value = 1
	Nds7.misc7.PostFlg.Value = 1

	Nds9.Irq.Ime.Value = 0x1
	Nds7.Irq.Ime.Value = 0x1
	Nds9.Irq.Ie.Value = uint32(IrqIpcRecvFifo | IrqTimers | IrqVBlank)
	Nds7.Irq.Ie.Value = uint32(IrqIpcRecvFifo | IrqTimers | IrqVBlank)

	// VRAM: map everything in "LCDC mode"
	Emu.Hw.Mc.VramCntA.Write8(0, 0x80)
	Emu.Hw.Mc.VramCntB.Write8(0, 0x80)
	Emu.Hw.Mc.VramCntC.Write8(0, 0x80)
	Emu.Hw.Mc.VramCntD.Write8(0, 0x80)
	Emu.Hw.Mc.VramCntE.Write8(0, 0x80)
	Emu.Hw.Mc.VramCntF.Write8(0, 0x80)
	Emu.Hw.Mc.VramCntG.Write8(0, 0x80)
	Emu.Hw.Mc.VramCntH.Write8(0, 0x80)
	Emu.Hw.Mc.VramCntI.Write8(0, 0x80)

	// Gamecard: skip directly to key2 status
	Emu.Hw.Gc.stat = GcStatusKey2

	Nds9.Cp15.ConfigureControlReg(0x52078, 0x00FF085)
	return nil
}
