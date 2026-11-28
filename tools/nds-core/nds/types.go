package nds

// Shared declarations of the DS core (moved out of package main so that other
// programs, such as the wasm entry, can import this package).

type CpuNum int

const (
	CpuNds9 CpuNum = 0
	CpuNds7 CpuNum = 1
)

var (
	Nds7     *NDS7
	Nds9     *NDS9
	KeyState = make([]uint8, 256)
)
