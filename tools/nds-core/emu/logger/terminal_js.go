//go:build js

package logger

// IsTerminal on js/wasm: there is no terminal, so output is never coloured.
// terminal_unix.go (linux, darwin) and terminal_windows.go define it on those systems only.
func IsTerminal(fd int) bool { return false }
