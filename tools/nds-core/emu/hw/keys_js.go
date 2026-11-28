//go:build js

package hw

// Key codes used by the engine on js/wasm. The values are the USB HID usage IDs that
// SDL2 uses for the same keys, so a JavaScript key mapper can send these numbers.
// Only the names that other packages reference are defined here.
const (
	SCANCODE_0      = 39
	SCANCODE_1      = 30
	SCANCODE_2      = 31
	SCANCODE_3      = 32
	SCANCODE_4      = 33
	SCANCODE_5      = 34
	SCANCODE_6      = 35
	SCANCODE_7      = 36
	SCANCODE_8      = 37
	SCANCODE_9      = 38
	SCANCODE_A      = 4
	SCANCODE_C      = 6
	SCANCODE_D      = 7
	SCANCODE_L      = 15
	SCANCODE_P      = 19
	SCANCODE_S      = 22
	SCANCODE_X      = 27
	SCANCODE_Z      = 29
	SCANCODE_RETURN = 40
	SCANCODE_RIGHT  = 79
	SCANCODE_LEFT   = 80
	SCANCODE_DOWN   = 81
	SCANCODE_UP     = 82
	SCANCODE_RSHIFT = 229
)
