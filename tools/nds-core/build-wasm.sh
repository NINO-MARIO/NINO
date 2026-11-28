#!/usr/bin/env bash
# สร้าง core.wasm ของห้อง NDS ในเครื่องที่มี Go 1.21+ (ผลลัพธ์อยู่ที่ build/nds/ ไม่เข้ารีโป)
#   bash tools/nds-core/build-wasm.sh
# wasm/ เป็นโมดูลของตัวเอง (ไม่มี dependency) จึงไม่โหลดกราฟของเอนจิน
set -euo pipefail
cd "$(dirname "$0")/wasm"
if ! command -v go >/dev/null 2>&1; then
  echo "ไม่พบคำสั่ง go: ติดตั้ง Go 1.21 ขึ้นไปก่อน"; exit 1
fi
OUT="../../../build/nds"
mkdir -p "$OUT"
GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o "$OUT/core.wasm" .
WE=""
for p in "$(go env GOROOT)/lib/wasm/wasm_exec.js" "$(go env GOROOT)/misc/wasm/wasm_exec.js"; do
  if [ -f "$p" ]; then WE="$p"; break; fi
done
[ -n "$WE" ] || { echo "ไม่พบ wasm_exec.js ใน GOROOT"; exit 1; }
cp "$WE" "$OUT/wasm_exec.js"
echo "เสร็จแล้ว: $OUT/core.wasm และ $OUT/wasm_exec.js"
echo "หมายเหตุ: นี่คือหน้าทดสอบ (phase 0a) ยังไม่ใช่เอนจินที่เล่นเกมได้"
