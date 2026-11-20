//go:build js

// Package debugger on js/wasm. The real debugger is a terminal UI (termui), which
// does not exist on wasm, and it imports ndsemu/emu (which needs logrus). This file
// keeps the exported API that package arm and package emulator use. Every method is
// a no-op, so the CPU never stops for the debugger on wasm.
package debugger

// CpuDebugger is the interface a CPU core uses to talk to the debugger.
type CpuDebugger interface {
	Trace(pc uint32)
	WatchRead(addr uint32)
	WatchWrite(addr uint32, val uint32)
	Break(msg string)
}

// Cpu is the interface the debugger needs from a CPU core.
type Cpu interface {
	SetDebugger(dbg CpuDebugger)

	GetRegNames() []string
	GetRegs() []uint32
	SetReg(idx int, val uint32)

	GetSpecialRegNames() []string
	GetSpecialRegs() []string

	GetPc() uint32
	Disasm(pc uint32) (string, []byte)
}

// Debugger is a no-op debugger on js/wasm.
type Debugger struct{}

// New returns a no-op debugger. The sync object is accepted as interface{} so this
// package does not import ndsemu/emu.
func New(cpus []Cpu, sync interface{}) *Debugger { return &Debugger{} }

func (dbg *Debugger) Trace(pc uint32)                    {}
func (dbg *Debugger) WatchRead(addr uint32)              {}
func (dbg *Debugger) WatchWrite(addr uint32, val uint32) {}
func (dbg *Debugger) Break(msg string)                   {}
func (dbg *Debugger) Run()                               {}
func (dbg *Debugger) AddBreakpoint(pc uint32)            {}
func (dbg *Debugger) AddWatchpoint(addr uint32)          {}
