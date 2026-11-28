package nds

// FrameCount is the number of frames the emulator has run.
func (emu *NDSEmulator) FrameCount() int { return emu.framecount }

// WramBytes returns the 32 KB shared WRAM (used by the -dumpwram style flags).
func (m *HwMemoryController) WramBytes() []byte { return m.wram[:] }

// VramBanks returns the VRAM banks in order (used by the dump flags).
func (m *HwMemoryController) VramBanks() [][]byte { return m.vram[:] }
