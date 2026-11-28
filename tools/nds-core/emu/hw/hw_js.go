//go:build js

// Package hw on js/wasm. The real output uses SDL2 (window, renderer, audio device)
// through cgo, which does not exist on wasm. This file keeps the exported API that the
// rest of the engine uses. Frames and audio are accepted and dropped; the JavaScript
// side will take them over later (not wired yet).
package hw

import "ndsemu/emu/gfx"

// AudioBuffer is a block of interleaved 16-bit samples.
type AudioBuffer []int16

// OutputConfig mirrors the real OutputConfig fields.
type OutputConfig struct {
	Title             string
	Width, Height     int
	FramePerSecond    int
	EnforceSpeed      bool
	NumBackBuffers    int
	AudioFrequency    int
	AudioChannels     int
	AudioSampleSigned bool
}

// Output is a no-op output on js/wasm.
type Output struct {
	cfg OutputConfig
}

// NewOutput returns a no-op output on js/wasm.
func NewOutput(cfg OutputConfig) *Output {
	return &Output{cfg: cfg}
}

// MouseButtons is a bit set of mouse buttons (same values as the real package).
type MouseButtons int

const (
	MouseButtonLeft MouseButtons = 1 << iota
	MouseButtonMiddle
	MouseButtonRight
)

// kbState เป็นตารางปุ่มคีย์บอร์ดว่างขนาด 512 ช่อง (ตามจำนวน scancode ของ SDL)
// ต้องไม่เป็น nil เพราะโค้ดเสียงและโค้ดปุ่มอ่านดัชนีตรงๆ
var kbState = make([]uint8, 512)

// GetKeyboardState คืนตารางปุ่มที่ว่างอยู่เสมอบน js/wasm ปุ่มจริงส่งผ่าน nds.SetKeyMask
func GetKeyboardState() []uint8 { return kbState }

func (out *Output) EnableVideo(enable bool) {}
func (out *Output) EnableAudio(enable bool) {}

// BeginFrame returns an empty frame on js/wasm.
func (out *Output) BeginFrame() (gfx.Buffer, AudioBuffer) {
	var screen gfx.Buffer
	return screen, nil
}

func (out *Output) EndFrame(screen gfx.Buffer, audio AudioBuffer) {}

// GetMouseState reports no mouse on js/wasm.
func (out *Output) GetMouseState() (int, int, MouseButtons) { return 0, 0, 0 }

// Poll never asks to quit on js/wasm.
func (out *Output) Poll() bool { return true }

// Screenshot is not available on js/wasm.
func (out *Output) Screenshot(fn string) error { return nil }
