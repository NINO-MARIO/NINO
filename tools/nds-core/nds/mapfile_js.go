//go:build js

package nds

import (
	"bytes"
	"io"
	"io/fs"
	"os"
	"strings"
	"time"
)

// On js/wasm there is no file system. Files are registered from the page with
// SetVirtualFile (BIOS, firmware, ROM) and live in memory. Writes (save, firmware
// flash) stay in memory for this session only; they are not saved by the browser yet.

// memFile คือไฟล์ในหน่วยความจำที่อ่านและเขียนได้
type memFile struct {
	name string
	data []byte
}

func (m *memFile) ReadAt(p []byte, off int64) (int, error) {
	if off < 0 || off >= int64(len(m.data)) {
		return 0, io.EOF
	}
	n := copy(p, m.data[off:])
	if n < len(p) {
		return n, io.EOF
	}
	return n, nil
}

func (m *memFile) WriteAt(p []byte, off int64) (int, error) {
	end := int(off) + len(p)
	if end > len(m.data) {
		grown := make([]byte, end)
		copy(grown, m.data)
		m.data = grown
	}
	return copy(m.data[off:], p), nil
}

func (m *memFile) Truncate(size int64) error {
	if int64(len(m.data)) >= size {
		m.data = m.data[:size]
		return nil
	}
	grown := make([]byte, size)
	copy(grown, m.data)
	m.data = grown
	return nil
}

func (m *memFile) Close() error { return nil }

func (m *memFile) Stat() (os.FileInfo, error) {
	return memInfo{name: m.name, size: int64(len(m.data))}, nil
}

type memInfo struct {
	name string
	size int64
}

func (i memInfo) Name() string       { return i.name }
func (i memInfo) Size() int64        { return i.size }
func (i memInfo) Mode() fs.FileMode  { return 0644 }
func (i memInfo) ModTime() time.Time { return time.Time{} }
func (i memInfo) IsDir() bool        { return false }
func (i memInfo) Sys() any           { return nil }

// rwFile คือไฟล์ที่อ่านเขียนได้ บน js คือไฟล์ในหน่วยความจำ
type rwFile = *memFile

// vfiles คือไฟล์เสมือนทั้งหมด คีย์คือ path แบบย่อ (ดู normalizeKey)
var vfiles = map[string]*memFile{}

// normalizeKey ใช้สองส่วนท้ายของ path เช่น "bios/biosnds9.rom" เพื่อไม่ผูกกับ cwd
func normalizeKey(fn string) string {
	parts := strings.Split(strings.ReplaceAll(fn, "\\", "/"), "/")
	if len(parts) > 2 {
		parts = parts[len(parts)-2:]
	}
	return strings.Join(parts, "/")
}

// SetVirtualFile ลงทะเบียนไฟล์ในหน่วยความจำ เช่น BIOS, firmware หรือ ROM
func SetVirtualFile(fn string, data []byte) {
	key := normalizeKey(fn)
	buf := make([]byte, len(data))
	copy(buf, data)
	vfiles[key] = &memFile{name: key, data: buf}
}

// openRWFile เปิดไฟล์อ่านเขียนจากหน่วยความจำ ถ้า create เป็นจริงจะสร้างให้ถ้ายังไม่มี
func openRWFile(fn string, create bool) (rwFile, error) {
	key := normalizeKey(fn)
	if f, ok := vfiles[key]; ok {
		return f, nil
	}
	if !create {
		return nil, &fs.PathError{Op: "open", Path: fn, Err: fs.ErrNotExist}
	}
	f := &memFile{name: key}
	vfiles[key] = f
	return f, nil
}

// openAssetReader เปิดไฟล์อ่านอย่างเดียวแบบ stream
func openAssetReader(fn string) (io.ReadCloser, error) {
	data, err := readAsset(fn)
	if err != nil {
		return nil, err
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}

// readAsset อ่านไฟล์ทั้งก้อนจากหน่วยความจำ
func readAsset(fn string) ([]byte, error) {
	if f, ok := vfiles[normalizeKey(fn)]; ok {
		return f.data, nil
	}
	return nil, &fs.PathError{Op: "open", Path: fn, Err: fs.ErrNotExist}
}

// mapFileRW คืนสำเนาในหน่วยความจำของไฟล์ (ขนาดตาม size; -1 ใช้ขนาดไฟล์)
func mapFileRW(f rwFile, size int) (MMap, error) {
	if size < len(f.data) {
		size = len(f.data)
	}
	buf := make(MMap, size)
	copy(buf, f.data)
	return buf, nil
}

// MMap คือภาพหน่วยความจำของไฟล์ที่อ่านเขียนได้
type MMap []byte

func (m MMap) Len() int     { return len(m) }
func (m MMap) Unmap() error { return nil }
func (m MMap) Flush() error { return nil }
func (m MMap) Close() error { return nil }

func (m MMap) ReadAt(p []byte, off int64) (int, error) {
	if off < 0 || off >= int64(len(m)) {
		return 0, io.EOF
	}
	n := copy(p, m[off:])
	if n < len(p) {
		return n, io.EOF
	}
	return n, nil
}

// ROFile คือภาพหน่วยความจำของไฟล์อ่านอย่างเดียว มีเมธอดเดียวกับ x/exp/mmap บนเนทีฟ
type ROFile struct {
	data []byte
}

func (r *ROFile) Len() int     { return len(r.data) }
func (r *ROFile) Close() error { return nil }

func (r *ROFile) ReadAt(p []byte, off int64) (int, error) {
	if off < 0 || off >= int64(len(r.data)) {
		return 0, io.EOF
	}
	n := copy(p, r.data[off:])
	if n < len(p) {
		return n, io.EOF
	}
	return n, nil
}

// openFileRO เปิดไฟล์อ่านอย่างเดียวจากหน่วยความจำ
func openFileRO(fn string) (*ROFile, error) {
	data, err := readAsset(fn)
	if err != nil {
		return nil, err
	}
	return &ROFile{data: data}, nil
}
