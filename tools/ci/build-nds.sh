#!/usr/bin/env bash
# Builds the real NDS core (webcore) into DEST/games/nds. Best effort: any failure is a warning, the rest of NINO still ships.
# usage: tools/ci/build-nds.sh DEST
# เดิมบิลด์ tools/nds-core/wasm (แกนทดสอบ phase0a ที่แสดงแค่ภาพทดสอบ) จึงเล่นเกมไม่ได้
# ตอนนี้บิลด์ webcore ซึ่งเป็นแกนจริง ถ้าบิลด์ไม่ผ่านจะไม่ใส่แกนทดสอบแทน หน้าเล่นจะบอกว่ายังไม่มีแกน
DEST="${1:?destination dir}"
REPO="$(pwd)"
SRC="$REPO/tools/nds-core"
OUT="$DEST/games/nds"
TMP="${RUNNER_TEMP:-/tmp}"
SUM="${GITHUB_STEP_SUMMARY:-/dev/null}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"   # พาธเต็ม เพราะสคริปต์ cd ไปที่อื่นก่อนสร้างไฟล์
if ! command -v go >/dev/null 2>&1; then
  echo "::warning::ไม่พบ Go บน runner ข้ามการสร้างแกน NDS"
  { echo "### แกน NDS"; echo "- ข้าม: ไม่พบ Go บน runner"; } >> "$SUM"
  exit 0
fi
GOV=$(go version 2>/dev/null || echo "?")
GR=$(go env GOROOT 2>/dev/null || echo "")
WE="$GR/lib/wasm/wasm_exec.js"
[ -f "$WE" ] || WE="$GR/misc/wasm/wasm_exec.js"
if [ -f "$WE" ]; then cp "$WE" "$OUT/wasm_exec.js"; else echo "::warning::ไม่พบ wasm_exec.js"; fi

# ต้องจัดการ dependency ก่อนบิลด์: go.sum ไม่อยู่ในรีโป และ logrus ต้องใช้สำเนาที่แก้สำหรับ js (เหมือนขั้น probe ที่ผ่านบน CI)
(cd "$SRC" && go mod tidy > "$TMP/nds-tidy.log" 2>&1; go mod download >> "$TMP/nds-tidy.log" 2>&1; bash prepare-js-deps.sh "$TMP/logrus-js" >> "$TMP/nds-tidy.log" 2>&1)

# แกนจริง: webcore ตามคำสั่งเดียวกับ tools/nds-core/build-webcore.sh
(cd "$SRC" && GOOS=js GOARCH=wasm CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o "$OUT/core.wasm" ./webcore) > "$TMP/nds-entry.log" 2>&1
if [ -s "$OUT/core.wasm" ]; then
  CORE="ผ่าน ($(wc -c < "$OUT/core.wasm") ไบต์)"
else
  CORE="ไม่ผ่าน"; rm -f "$OUT/core.wasm"
  echo "::warning::คอมไพล์แกนจริง (webcore) ไม่ผ่าน"
fi

{
  echo "### แกน NDS"
  echo "- Go: $GOV"
  echo "- แกนจริง (webcore): $CORE"
  echo ""
  echo "ผล go mod tidy (20 บรรทัดแรก):"
  echo '```'
  head -n 20 "$TMP/nds-tidy.log" 2>/dev/null
  echo '```'
  echo ""
  echo "ข้อความจากตัวคอมไพล์ (40 บรรทัดแรก):"
  echo '```'
  head -n 40 "$TMP/nds-entry.log" 2>/dev/null
  echo '```'
} >> "$SUM"
exit 0
