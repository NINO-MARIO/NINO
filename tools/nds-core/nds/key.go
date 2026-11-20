package nds
import (
	"ndsemu/emu/hw"
	"ndsemu/emu/hwio"
	log "ndsemu/emu/logger"
)

type HwKey struct {
	KeyIn    hwio.Reg16 `hwio:"bank=0,offset=0x0,reset=0x3FF,readonly,rcb"`
	KeyCnt   hwio.Reg16 `hwio:"bank=0,offset=0x2,wcb"`
	ExtKeyIn hwio.Reg16 `hwio:"bank=1,offset=0x6,reset=0x7F,readonly,rcb"`

	penDown bool
}

func NewHwKey() *HwKey {
	key := new(HwKey)
	hwio.MustInitRegs(key)
	return key
}

func (key *HwKey) SetPenDown(value bool) {
	key.penDown = value
}

// keyMask holds buttons pressed from outside the keyboard (the web room sends them through setKeys).
// Bits use the KEYINPUT order: 0 A, 1 B, 2 Select, 3 Start, 4 Right, 5 Left, 6 Up, 7 Down, 8 R, 9 L,
// and 10 X, 11 Y (X and Y are in EXTKEYIN on the DS; see ReadEXTKEYIN).
var keyMask uint32

// SetKeyMask sets the buttons pressed from outside the keyboard. Bits above 11 are ignored.
func SetKeyMask(m uint32) {
	keyMask = m & 0xFFF
}

// buttonPressed reports whether KEYINPUT bit k is pressed from the external mask.
func buttonPressed(k uint) bool {
	return keyMask&(1<<k) != 0
}

func (key *HwKey) WriteKEYCNT(_, val uint16) {
	if val&(1<<14) != 0 {
		log.ModInput.FatalZ("key interrupt not implemented").End()
	}
}

func (key *HwKey) ReadKEYIN(val uint16) uint16 {
	// KEYINPUT is active-low: a pressed button clears its bit. Keyboard and external mask both count.
	for k := uint(0); k <= 9; k++ {
		if buttonPressed(k) {
			val &^= 1 << k
		}
	}
	if KeyState[hw.SCANCODE_Z] != 0 {
		val &^= 1 << 0
	}
	if KeyState[hw.SCANCODE_X] != 0 {
		val &^= 1 << 1
	}
	if KeyState[hw.SCANCODE_RSHIFT] != 0 {
		val &^= 1 << 2
	}
	if KeyState[hw.SCANCODE_RETURN] != 0 {
		val &^= 1 << 3
	}
	if KeyState[hw.SCANCODE_RIGHT] != 0 {
		val &^= 1 << 4
	}
	if KeyState[hw.SCANCODE_LEFT] != 0 {
		val &^= 1 << 5
	}
	if KeyState[hw.SCANCODE_UP] != 0 {
		val &^= 1 << 6
	}
	if KeyState[hw.SCANCODE_DOWN] != 0 {
		val &^= 1 << 7
	}
	if KeyState[hw.SCANCODE_A] != 0 {
		val &^= 1 << 8
	}
	if KeyState[hw.SCANCODE_S] != 0 {
		val &^= 1 << 9
	}
	return val
}

func (key *HwKey) ReadEXTKEYIN(val uint16) uint16 {
	if buttonPressed(10) {
		val &^= 1 << 0 // X
	}
	if buttonPressed(11) {
		val &^= 1 << 1 // Y
	}
	if KeyState[hw.SCANCODE_D] != 0 {
		val &^= 1 << 0
	}
	if KeyState[hw.SCANCODE_C] != 0 {
		val &^= 1 << 1
	}
	if key.penDown {
		val &^= 1 << 6
	}
	return val
}
