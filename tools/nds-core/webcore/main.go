//go:build js

// webcore คือจุดเข้าของเอนจิน NDS บนเว็บ (js/wasm) ไม่มี SDL และไม่มีหน้าต่าง
// ส่งออกออบเจกต์ ndsCore ให้สอดคล้องกับสัญญาของหน้าห้อง (games/nds/player.js):
//
//	version(), loadBios(name, Uint8Array), loadRom(Uint8Array), runFrame(), framebuffer(),
//	status(), setKeys(mask), audioBuffer(), reset()
//
// ชื่อ BIOS ที่รับ: "bios7" (16384 ไบต์), "bios9" (4096 ไบต์), "firmware" (262144 ไบต์)
// ถ้ามี BIOS ทั้งสองไฟล์ จะบูตผ่าน BIOS จริง (หรือ FreeBIOS ที่ผู้ใช้เลือก) ถ้าไม่มี จะข้าม BIOS
// การสัมผัส (setTouch) และการบันทึกเซฟ (saveData, loadSaveData) ต่อแล้ว
// ข้ามบูต BIOS ได้ด้วย skipBios(true) (ใช้กับ FreeBIOS หรือโหมดบูตตรง)
package main

import (
	"encoding/binary"
	"fmt"
	"syscall/js"

	"ndsemu/emu/gfx"
	"ndsemu/nds"
)

const (
	// จอบนอยู่บรรทัด 0-191 จอล่างอยู่บรรทัด 282-473 (ดู nds/emulator.go beginLine)
	screenW = 256
	screenH = 474
	// 32768 Hz สองช่อง ที่ 60 เฟรมต่อวินาที ประมาณ 546 ตัวอย่างต่อเฟรม ปัดเป็น 546 คู่
	audioPerFrame = 2 * 546
)

var (
	screen     gfx.Buffer
	biosSizes  = map[string]int{"bios7": 16384, "bios9": 4096, "firmware": 262144}
	biosFiles  = map[string]string{"bios7": "bios/biosnds7.rom", "bios9": "bios/biosnds9.rom", "firmware": "firmware.bin"}
	biosLoaded = map[string]bool{}
	romLoaded  bool
	booted     bool
	frames     int
	lastAudio  = make([]int16, audioPerFrame)
	skipBIOS   bool
)

const romFile = "game.nds"

func main() {
	nds.WebSoftBreakpoints()
	screen = gfx.NewBufferMem(screenW, screenH)
	core := js.Global().Get("Object").New()
	core.Set("version", "web-m1")
	core.Set("loadBios", js.FuncOf(loadBios))
	core.Set("loadRom", js.FuncOf(loadRom))
	core.Set("runFrame", js.FuncOf(runFrame))
	core.Set("framebuffer", js.FuncOf(framebuffer))
	core.Set("status", js.FuncOf(status))
	core.Set("setKeys", js.FuncOf(setKeys))
	core.Set("audioBuffer", js.FuncOf(audioBuffer))
	core.Set("reset", js.FuncOf(reset))
	core.Set("skipBios", js.FuncOf(setSkipBios))
	core.Set("setTouch", js.FuncOf(setTouch))
	core.Set("saveData", js.FuncOf(saveData))
	core.Set("loadSaveData", js.FuncOf(loadSaveData))
	js.Global().Set("ndsCore", core)
	select {}
}

func fromJS(v js.Value) []byte {
	buf := make([]byte, v.Get("length").Int())
	js.CopyBytesToGo(buf, v)
	return buf
}

func reply(ok bool, msg string) js.Value {
	o := js.Global().Get("Object").New()
	o.Set("ok", ok)
	o.Set("msg", msg)
	return o
}

func asciiField(b []byte) string {
	out := make([]byte, 0, len(b))
	for _, c := range b {
		if c == 0 {
			break
		}
		if c >= 0x20 && c < 0x7f {
			out = append(out, c)
		}
	}
	return string(out)
}

func loadBios(this js.Value, args []js.Value) interface{} {
	if len(args) != 2 {
		return reply(false, "ต้องส่งชื่อกับข้อมูลไฟล์")
	}
	name := args[0].String()
	want, known := biosSizes[name]
	if !known {
		return reply(false, "ไม่รู้จักไฟล์ "+name)
	}
	data := fromJS(args[1])
	if len(data) != want {
		return reply(false, fmt.Sprintf("ขนาดไม่ตรง ได้ %d ไบต์ ต้องการ %d ไบต์", len(data), want))
	}
	nds.SetVirtualFile(biosFiles[name], data)
	biosLoaded[name] = true
	booted = false // บูตใหม่ในเฟรมถัดไปให้ใช้ BIOS ที่เพิ่งโหลด
	return reply(true, "รับ "+name+" แล้ว")
}

func loadRom(this js.Value, args []js.Value) interface{} {
	if len(args) != 1 {
		return reply(false, "ต้องส่งข้อมูลตลับเกม")
	}
	data := fromJS(args[0])
	if len(data) < 0x200 {
		return reply(false, "ไฟล์สั้นเกินไปสำหรับตลับ DS")
	}
	nds.SetVirtualFile(romFile, data)
	romLoaded = true
	booted = false
	o := reply(true, "อ่านหัวตลับแล้ว")
	o.Set("title", asciiField(data[0:12]))
	o.Set("code", asciiField(data[12:16]))
	o.Set("size", len(data))
	return o
}

// boot เตรียมอีมูเลเตอร์จากตลับที่โหลดไว้
// ต้องมี BIOS ทั้งสามไฟล์ก่อน มิฉะนั้นอีมูเลเตอร์จะปิดโปรแกรมเอง (ดู nds/emulator.go)
// ค่าเริ่มต้นบูตผ่าน BIOS จริง ถ้าตั้ง skipBios(true) จะข้าม BIOS เหมือนแฟลก -s ของเดสก์ท็อป
func boot() error {
	// ไม่บังคับ firmware (หน้าห้องระบุว่า "ไม่ใส่ก็เล่นได้") ถ้าไม่มี ใช้ firmware ว่างแทน
	if !biosLoaded["firmware"] {
		nds.SetVirtualFile(biosFiles["firmware"], make([]byte, biosSizes["firmware"]))
	}
	nds.Emu = nds.NewNDSEmulator(biosFiles["firmware"], false)
	if err := nds.Emu.Hw.Gc.MapCartFile(romFile); err != nil {
		return err
	}
	if pendingSave != nil {
		nds.WebLoadSaveData(pendingSave)
	}
	if skipBIOS {
		if err := nds.SkipBios(); err != nil {
			return err
		}
		nds.WebEnableSpeaker()
		nds.WebCalibrateTouch()
	}
	nds.WebSetTouch(penX, penY, penDown)
	return nil
}

func biosReady() bool {
	return biosLoaded["bios7"] && biosLoaded["bios9"]
}

// pendingSave คือข้อมูลเซฟล่าสุดที่หน้าเว็บส่งมา ใช้ใส่หลังบูตใหม่ทุกครั้ง
var pendingSave []byte

// penX, penY, penDown: สถานะปากกาล่าสุด ใช้ใส่ซ้ำหลังบูต (ก่อนบูตยังไม่มีอีมูเลเตอร์)
var (
	penX, penY int
	penDown    bool
)

// setTouch(x, y, down): พิกัดบนจอล่าง 0..255 / 0..191
func setTouch(this js.Value, args []js.Value) interface{} {
	if len(args) < 3 {
		return nil
	}
	penX, penY, penDown = args[0].Int(), args[1].Int(), args[2].Bool()
	nds.WebSetTouch(penX, penY, penDown)
	return nil
}

// saveData คืน Uint8Array ของข้อมูลเซฟปัจจุบัน (ว่างถ้ายังไม่มีการเขียนเซฟ)
func saveData(this js.Value, args []js.Value) interface{} {
	data := pendingSave
	if booted && nds.Emu != nil {
		if cur := nds.WebSaveData(); len(cur) > 0 {
			data = cur
			pendingSave = cur
		}
	}
	arr := js.Global().Get("Uint8Array").New(len(data))
	js.CopyBytesToJS(arr, data)
	return arr
}

// loadSaveData(Uint8Array): จำไว้และใส่ทันทีถ้าเครื่องบูตแล้ว
func loadSaveData(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return false
	}
	pendingSave = fromJS(args[0])
	if booted && nds.Emu != nil {
		nds.WebLoadSaveData(pendingSave)
	}
	return true
}

func setSkipBios(this js.Value, args []js.Value) interface{} {
	skipBIOS = len(args) > 0 && args[0].Bool()
	booted = false
	return nil
}

func runFrame(this js.Value, args []js.Value) interface{} {
	if !romLoaded {
		return "ยังไม่ได้โหลดตลับเกม"
	}
	if !biosReady() {
		return "ต้องโหลด bios7 และ bios9 ก่อน"
	}
	if !booted {
		if err := boot(); err != nil {
			return err.Error()
		}
		booted = true
	}
	audio := make([]int16, audioPerFrame)
	nds.Emu.RunOneFrame(screen, audio)
	lastAudio = audio
	frames++
	return frames
}

// framebuffer คืนภาพ 256x384 ตามสัญญา FRAME_BYTES ของหน้าห้อง:
// บรรทัด 0-191 = จอบน, บรรทัด 192-383 = จอล่าง (ซึ่งเอนจินวาดที่ 282-473)
func framebuffer(this js.Value, args []js.Value) interface{} {
	src := screen.Pointer()
	const line = screenW * 4
	out := make([]byte, 384*line)
	copy(out[0:192*line], src[0:192*line])
	copy(out[192*line:], src[282*line:282*line+192*line])
	// เอนจินเก็บอัลฟาเป็น 0 เสมอ ถ้าไม่ตั้งเป็น 255 เบราว์เซอร์จะแสดงทุกพิกเซลเป็นโปร่งใส
	for i := 3; i < len(out); i += 4 {
		out[i] = 0xFF
	}
	arr := js.Global().Get("Uint8Array").New(len(out))
	js.CopyBytesToJS(arr, out)
	return arr
}

func status(this js.Value, args []js.Value) interface{} {
	o := reply(true, "")
	o.Set("bios7", biosLoaded["bios7"])
	o.Set("bios9", biosLoaded["bios9"])
	o.Set("firmware", biosLoaded["firmware"])
	o.Set("rom", romLoaded)
	o.Set("skipBios", skipBIOS)
	o.Set("softErrors", nds.WebSoftErrors())
	return o
}

// setKeys รับบิตตามลำดับ KEYINPUT: 0 A, 1 B, 2 Select, 3 Start, 4 ขวา, 5 ซ้าย, 6 บน, 7 ล่าง, 8 R, 9 L, 10 X, 11 Y
func setKeys(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return nil
	}
	nds.SetKeyMask(uint32(args[0].Int()))
	return nil
}

// audioBuffer คืน Int16Array ของตัวอย่างสเตอริโอในเฟรมล่าสุด (32768 Hz)
func audioBuffer(this js.Value, args []js.Value) interface{} {
	raw := make([]byte, len(lastAudio)*2)
	for i, s := range lastAudio {
		binary.LittleEndian.PutUint16(raw[i*2:], uint16(s))
	}
	arr := js.Global().Get("Int16Array").New(len(lastAudio))
	view := js.Global().Get("Uint8Array").New(arr.Get("buffer"))
	js.CopyBytesToJS(view, raw)
	return arr
}

func reset(this js.Value, args []js.Value) interface{} {
	booted = false
	return nil
}
