module ndsemu

go 1.21

require (
	github.com/BurntSushi/toml v0.0.0-20160717150709-99064174e013
	github.com/edsrzf/mmap-go v0.0.0-20170320065105-0bce6a688712
	github.com/gizak/termui v0.0.0-20170117222342-991cd3d38091
	github.com/hashicorp/golang-lru v0.0.0-20160813221303-0a025b7e63ad
	github.com/howeyc/crc16 v0.0.0-20160203154243-4d7d1365ccda
	github.com/maruel/panicparse v0.0.0-20160720141634-ad661195ed0e
	github.com/mattn/go-runewidth v0.0.0-20170201023540-14207d285c6c
	github.com/mitchellh/go-wordwrap v0.0.0-20150314170334-ad45545899c7
	github.com/nsf/termbox-go v0.0.0-20170211012700-3540b76b9c77
	github.com/rasky/gojit v0.0.0-20170619082035-3f68c53a974d
	github.com/veandco/go-sdl2 v0.0.0-20180511015117-9f046b130c31
	golang.org/x/arch v0.0.0-20170323000348-58ea1a195b1a
	golang.org/x/exp v0.0.0-20170423001816-239d448f23a0
	golang.org/x/sys v0.0.0-20170217003442-075e574b89e4
	gopkg.in/Sirupsen/logrus.v0 v0.0.0-20170207114918-c078b1e43f58
)

// The logrus and termui go.mod files pin x/sys to a pseudo-version whose timestamp
// does not match its commit; this replace makes every x/sys version resolve to the
// corrected one so the module graph loads.
replace golang.org/x/sys => golang.org/x/sys v0.0.0-20170217003442-075e574b89e4
