package main

import (
	"fmt"
	"syscall/js"
)

const (
	screenW = 256
	screenH = 384
)

var (
	biosSizes = map[string]int{"bios7": 16384, "bios9": 4096, "firmware": 262144}
	biosData  = map[string][]byte{}
	romLoaded bool
	fb        = make([]byte, screenW*screenH*4)
	frames    int
)

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
	biosData[name] = data
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
	romLoaded = true
	o := reply(true, "อ่านหัวตลับแล้ว")
	o.Set("title", asciiField(data[0:12]))
	o.Set("code", asciiField(data[12:16]))
	o.Set("size", len(data))
	return o
}

func runFrame(this js.Value, args []js.Value) interface{} {
	t := byte(frames)
	for y := 0; y < screenH; y++ {
		for x := 0; x < screenW; x++ {
			i := (y*screenW + x) * 4
			fb[i] = byte(x) + t
			fb[i+1] = byte(y)
			fb[i+2] = t * 3
			fb[i+3] = 0xff
		}
	}
	frames++
	return frames
}

func framebuffer(this js.Value, args []js.Value) interface{} {
	arr := js.Global().Get("Uint8Array").New(len(fb))
	js.CopyBytesToJS(arr, fb)
	return arr
}

func status(this js.Value, args []js.Value) interface{} {
	o := reply(true, "")
	_, a := biosData["bios7"]
	_, b := biosData["bios9"]
	_, c := biosData["firmware"]
	o.Set("bios7", a)
	o.Set("bios9", b)
	o.Set("firmware", c)
	o.Set("rom", romLoaded)
	return o
}

func main() {
	core := js.Global().Get("Object").New()
	core.Set("version", "phase0a")
	core.Set("loadBios", js.FuncOf(loadBios))
	core.Set("loadRom", js.FuncOf(loadRom))
	core.Set("runFrame", js.FuncOf(runFrame))
	core.Set("framebuffer", js.FuncOf(framebuffer))
	core.Set("status", js.FuncOf(status))
	js.Global().Set("ndsCore", core)
	select {}
}
