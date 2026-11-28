//go:build js

// Package jit on js/wasm: the real JIT needs mmap of executable memory, which
// wasm does not have. This stub keeps the same API used by package arm, and
// every method is a no-op, so the CPU always interprets (Lookup returns nil).
package jit

// Compiler is satisfied by any value on js/wasm (the stub never compiles).
type Compiler interface{}

// Config mirrors the fields of the real Config that package arm sets.
type Config struct {
	PcAlignmentShift uint
	MaxBlockSize     int
}

// Jit is a no-op JIT manager.
// HACK_OtherJit คงไว้ให้ nds/emulator.go คอมไพล์บน js/wasm (ตรงกับ jit.go ฝั่ง native); ไม่ถูกใช้งานเพราะไม่มีการคอมไพล์
type Jit struct {
	HACK_OtherJit *Jit
}

// NewJit returns a no-op JIT manager.
func NewJit(comp Compiler, cfg *Config) *Jit { return &Jit{} }

// Lookup never returns compiled code on js/wasm.
func (j *Jit) Lookup(pc uint32) func() { return nil }

// Invalidate does nothing on js/wasm (nothing is compiled).
func (j *Jit) Invalidate(pc uint32) {}

// InvalidateRange does nothing on js/wasm (nothing is compiled).
func (j *Jit) InvalidateRange(pc uint32, size int) {}

// InvalidateAll does nothing on js/wasm (nothing is compiled).
func (j *Jit) InvalidateAll() {}
