#!/usr/bin/env bash
# สร้าง games/nds/core.wasm จากแกนจริง (webcore) และคัดลอก wasm_exec.js ของ Go ที่ตรงกัน
#   bash tools/nds-core/build-webcore.sh
# ต้องมี Go 1.21 ขึ้นไป และเข้าถึง proxy ของโมดูล Go ได้ (ปกติผ่าน proxy.golang.org)
# ถ้าเครื่องเข้าถึงโมดูลบางตัวไม่ได้ ตั้ง GOFLAGS ก่อนรันได้ เช่น
#   GOFLAGS="-mod=mod -modfile=/path/to/go.dev.mod" bash tools/nds-core/build-webcore.sh
# สคริปต์นี้ไม่เขียนไฟล์ go.sum ลงในโฟลเดอร์โปรเจกต์ ไม่แตะ BIOS หรือตลับใด ๆ
# (build-wasm.sh เป็นของแกนทดสอบ phase0a ใช้สร้างแกนจริงไม่ได้)
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v go >/dev/null 2>&1; then
  echo "ไม่พบคำสั่ง go: ติดตั้ง Go 1.21 ขึ้นไปก่อน"; exit 1
fi
OUT="../../games/nds"
GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o "$OUT/core.wasm" ./webcore
WE="$(go env GOROOT)/lib/wasm/wasm_exec.js"
[ -f "$WE" ] || WE="$(go env GOROOT)/misc/wasm/wasm_exec.js"
[ -f "$WE" ] || { echo "ไม่พบ wasm_exec.js ใน GOROOT"; exit 1; }
cp "$WE" "$OUT/wasm_exec.js"
echo "เสร็จแล้ว: $OUT/core.wasm และ $OUT/wasm_exec.js"
