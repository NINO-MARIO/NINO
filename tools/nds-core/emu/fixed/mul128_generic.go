//go:build !amd64 && !386

package fixed

import "math/bits"

// mul128 is the pure-Go version of the signed 64x64 -> 128 multiply that the
// amd64 assembly does with IMULQ (hi = high 64 bits, lo = low 64 bits).
// Used on wasm and other architectures that have no assembly version.
func mul128(x, y int64) (hi int64, lo uint64) {
	h, l := bits.Mul64(uint64(x), uint64(y))
	// bits.Mul64 is unsigned; a signed product differs in the high word by
	// -y when x<0 and by -x when y<0 (two's complement correction).
	if x < 0 {
		h -= uint64(y)
	}
	if y < 0 {
		h -= uint64(x)
	}
	return int64(h), l
}

// div128 is the pure-Go version of the signed 128/64 divide that the amd64
// assembly does with IDIVQ: the dividend is hinum:lonum, the result is the
// truncated quotient and the remainder (remainder has the sign of the dividend).
// Like IDIVQ it does not handle a zero divisor or a quotient that does not fit
// (bits.Div64 panics in those cases).
func div128(hinum, lonum, den int64) (quo, rem int64) {
	uhi, ulo := uint64(hinum), uint64(lonum)
	negN := hinum < 0
	if negN {
		// two's complement negate of the 128-bit dividend
		ulo = ^ulo + 1
		uhi = ^uhi
		if ulo == 0 {
			uhi++
		}
	}
	negD := den < 0
	ud := uint64(den)
	if negD {
		ud = ^ud + 1
	}
	q, r := bits.Div64(uhi, ulo, ud)
	sq, sr := int64(q), int64(r)
	if negN != negD {
		sq = -sq
	}
	if negN {
		sr = -sr
	}
	return sq, sr
}
