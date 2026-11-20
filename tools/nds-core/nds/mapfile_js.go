//go:build js

package nds

import (
	"io"
	"io/ioutil"
	"os"
)

// On js/wasm there is no file mapping: the bytes are kept in memory. Changes are
// not written back to a file on js (saves are handled by the browser side).

// MMap is the read-write memory image of a file.
type MMap []byte

func (m MMap) Len() int     { return len(m) }
func (m MMap) Unmap() error { return nil }
func (m MMap) Flush() error { return nil }
func (m MMap) Close() error { return nil }

// ReadAt implements io.ReaderAt over the in-memory bytes.
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

// ROFile is the read-only memory image of a file, with the same methods the
// desktop version gets from x/exp/mmap.
type ROFile struct {
	data []byte
}

func (r *ROFile) Len() int     { return len(r.data) }
func (r *ROFile) Close() error { return nil }

// ReadAt implements io.ReaderAt over the in-memory bytes.
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

// mapFileRW reads the file into memory. size -1 uses the file size; a larger
// size grows the buffer to size bytes (the desktop version maps that region).
func mapFileRW(f *os.File, size int) (MMap, error) {
	data, err := ioutil.ReadAll(f)
	if err != nil {
		return nil, err
	}
	if size < len(data) {
		size = len(data)
	}
	buf := make(MMap, size)
	copy(buf, data)
	return buf, nil
}

// openFileRO reads a file into memory read-only.
func openFileRO(fn string) (*ROFile, error) {
	data, err := ioutil.ReadFile(fn)
	if err != nil {
		return nil, err
	}
	return &ROFile{data: data}, nil
}
