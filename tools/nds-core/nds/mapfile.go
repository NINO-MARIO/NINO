//go:build !js

package nds

import (
	"io"
	"os"

	xmmap "golang.org/x/exp/mmap"

	"github.com/edsrzf/mmap-go"
)

// MMap is a file mapping on desktop platforms (memory-mapped, writes go to the file).
type MMap = mmap.MMap

// ROFile is a read-only file mapping (io.ReaderAt with Len and Close).
type ROFile = *xmmap.ReaderAt

// mapFileRW maps the file read-write. size -1 maps the whole file.
func mapFileRW(f *os.File, size int) (MMap, error) {
	return mmap.MapRegion(f, size, mmap.RDWR, 0, 0)
}

// openFileRO maps a file read-only.
func openFileRO(fn string) (ROFile, error) {
	return xmmap.Open(fn)
}

// rwFile คือไฟล์ที่อ่านเขียนได้ (firmware และ save) บนเนทีฟคือ *os.File
type rwFile = *os.File

// openRWFile เปิดไฟล์อ่านเขียน ถ้า create เป็นจริงจะสร้างไฟล์ถ้ายังไม่มี
func openRWFile(fn string, create bool) (rwFile, error) {
	flag := os.O_RDWR
	if create {
		flag |= os.O_CREATE
	}
	return os.OpenFile(fn, flag, 0644)
}

// openAssetReader เปิดไฟล์อ่านอย่างเดียวแบบ stream (ใช้กับ ROM ที่ส่งเข้า slot2)
func openAssetReader(fn string) (io.ReadCloser, error) {
	return os.Open(fn)
}

// readAsset อ่านไฟล์ทั้งก้อน (BIOS และไฟล์ทดสอบเล็ก ๆ)
func readAsset(fn string) ([]byte, error) {
	return os.ReadFile(fn)
}
