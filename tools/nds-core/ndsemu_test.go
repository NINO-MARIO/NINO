package main

import (
	"ndsemu/nds"
	"io/ioutil"
	"ndsemu/emu/gfx"
	log "ndsemu/emu/logger"
	"os"

	"testing"
)

func BenchmarkCpuSpeed(b *testing.B) {
	screen := gfx.NewBufferMem(256, 192+90+192)
	log.Disable()

	f, err := ioutil.TempFile("", "")
	if err != nil {
		b.Fatal(err)
	}
	f.Close()
	defer os.Remove(f.Name())

	for i := 0; i < b.N; i++ {
		nds.Emu = nds.NewNDSEmulator(f.Name())
		nds.Emu.Hw.Gc.MapCartFile("roms/phoenixwright.nds")
		nds.Emu.Hw.Ff.MapFirmwareFile("bios/firmware.bin")
		nds.Emu.Hw.Rtc.ResetDefaults()

		for j := 0; j < 300; j++ {
			nds.Emu.RunOneFrame(screen)
		}
	}
}
