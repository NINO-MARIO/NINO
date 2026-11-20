//go:build !js

package nds

import (
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
