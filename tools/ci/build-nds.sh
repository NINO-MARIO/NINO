#!/usr/bin/env bash
# Builds the NDS core into DEST/games/nds. Best effort: any failure is a warning, the rest of NINO still ships.
# usage: tools/ci/build-nds.sh DEST
DEST="${1:?destination dir}"
REPO="$(pwd)"
SRC="$REPO/tools/nds-core"
OUT="$DEST/games/nds"
TMP="${RUNNER_TEMP:-/tmp}"
SUM="${GITHUB_STEP_SUMMARY:-/dev/null}"
mkdir -p "$OUT"
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

(cd "$SRC" && GOOS=js GOARCH=wasm CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o "$OUT/core.wasm" ./wasm) > "$TMP/nds-entry.log" 2>&1
if [ -s "$OUT/core.wasm" ]; then
  ENTRY="ผ่าน ($(wc -c < "$OUT/core.wasm") ไบต์)"
else
  ENTRY="ไม่ผ่าน"; rm -f "$OUT/core.wasm"
  echo "::warning::คอมไพล์ entry ของ wasm ไม่ผ่าน"
fi

(cd "$SRC" && go mod tidy > "$TMP/nds-tidy.log" 2>&1; GOOS=js GOARCH=wasm CGO_ENABLED=0 go build -o /dev/null . > "$TMP/nds-probe.log" 2>&1; echo $? > "$TMP/nds-probe.rc")
PROBE=$(cat "$TMP/nds-probe.rc" 2>/dev/null || echo 1)
if [ "$PROBE" = "0" ]; then PR="เอนจินรากคอมไพล์เป็น wasm ได้"; else PR="เอนจินรากยังคอมไพล์ไม่ผ่าน (ดูด้านล่าง)"; fi

{
  echo "### แกน NDS"
  echo "- Go: $GOV"
  echo "- entry ทดสอบ (wasm/): $ENTRY"
  echo "- เอนจิน ndsemu: $PR"
  echo ""
  echo "ข้อความจากตัวคอมไพล์ (40 บรรทัดแรก):"
  echo '```'
  head -n 40 "$TMP/nds-entry.log" 2>/dev/null
  head -n 40 "$TMP/nds-probe.log" 2>/dev/null
  echo '```'
} >> "$SUM"
exit 0
