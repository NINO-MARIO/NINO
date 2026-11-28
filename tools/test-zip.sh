#!/usr/bin/env bash
# ทดสอบ NINO.zip ตัวที่จะส่งจริง: แตกซิปลงโฟลเดอร์ว่างใหม่ แล้วรันประตูตรวจในนั้น
#
#   bash tools/test-zip.sh                     ทดสอบ ./NINO.zip (ถ้าไม่มี ลองที่ /mnt/user-data/outputs/NINO.zip)
#   bash tools/test-zip.sh path/to/NINO.zip    ทดสอบซิปที่ระบุ
#   bash tools/test-zip.sh --full [ซิป]         เพิ่มเทสต์เบราว์เซอร์ทั้งชุด (verify-all.sh) ต้องติดตั้ง playwright ก่อน
#
# ขั้นที่ 1-3 ตรวจตัวซิป (ครบ ไม่มีไฟล์ต้องห้าม workflow ตรงกับ android/ci) ขั้นที่ 4 รัน ci-gate.sh
# (ไม่ใช้เบราว์เซอร์ เหมือนที่ GitHub รันหลัง unpack) ขั้นที่ 5 รัน verify-all.sh เฉพาะเมื่อใส่ --full
# โฟลเดอร์ทดสอบตั้งได้ด้วย NINO_TEST_DIR (ค่าเริ่มต้นคือโฟลเดอร์ชั่วคราวใหม่ทุกครั้ง)
# ออกด้วยรหัส 0 เมื่อทุกขั้นผ่าน ไม่ผ่านจะออกด้วยรหัส 1 และบอกชื่อขั้นที่พลาด
set -u

FULL=0
ZIP=""
for a in "$@"; do
  case "$a" in
    --full) FULL=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) ZIP="$a" ;;
  esac
done
if [ -z "$ZIP" ]; then
  if [ -f NINO.zip ]; then ZIP=NINO.zip
  elif [ -f /mnt/user-data/outputs/NINO.zip ]; then ZIP=/mnt/user-data/outputs/NINO.zip
  else echo "ไม่พบ NINO.zip (ระบุพาธเป็นอาร์กิวเมนต์ได้)"; exit 1; fi
fi
[ -f "$ZIP" ] || { echo "ไม่พบไฟล์: $ZIP"; exit 1; }
ZIP=$(cd "$(dirname "$ZIP")" && pwd)/$(basename "$ZIP")

DIR="${NINO_TEST_DIR:-$(mktemp -d)}"
rm -rf "$DIR"; mkdir -p "$DIR"
T0=$(date +%s)
RESULTS=()
FAILED=()

rec() { # ชื่อขั้น, รหัสออก
  if [ "$2" -eq 0 ]; then RESULTS+=("ok    $1"); else RESULTS+=("FAIL  $1"); FAILED+=("$1"); fi
}

echo "ซิป: $ZIP ($(du -h "$ZIP" | cut -f1))"
echo "โฟลเดอร์ทดสอบ: $DIR"
echo

# 1) ตัวซิป: อ่านได้และไม่เสีย
unzip -tq "$ZIP" > /dev/null 2>&1; rec "1 ซิปไม่เสียหาย (unzip -t)" $?

# 2) ไฟล์ต้องห้าม: โมเดล gguf, __pycache__ (ของที่เกิดจากการรันเทสต์) และไฟล์ใหญ่เกินเพดาน (การอัปโหลดบนเว็บ GitHub รับได้ 25 MB ต่อไฟล์)
BAD=$(unzip -Z1 "$ZIP" | grep -i -E '\.gguf$|Q2_K|__pycache__/' || true)
BIG=$(unzip -lv "$ZIP" 2>/dev/null | awk 'NR>3 && $1+0 > 25000000 {print $8}' | head -5)
if [ -z "$BAD" ] && [ -z "$BIG" ]; then rec "2 ไม่มีไฟล์ต้องห้ามและไม่มีไฟล์เกิน 25 MB" 0
else rec "2 ไม่มีไฟล์ต้องห้ามและไม่มีไฟล์เกิน 25 MB" 1; [ -n "$BAD" ] && echo "$BAD" | sed 's/^/      ต้องห้าม: /'; [ -n "$BIG" ] && echo "$BIG" | sed 's/^/      ใหญ่เกิน: /'; fi

# 3) แตกซิปลงโฟลเดอร์ใหม่ แล้วเทียบ workflow กับ android/ci (ซิปเก่าที่ workflow ไม่ตรงต้องไม่ผ่าน)
unzip -q "$ZIP" -d "$DIR"
WF_OK=0
if [ -d "$DIR/.github/workflows" ] && [ -d "$DIR/android/ci" ]; then
  for f in "$DIR"/android/ci/*.yml; do
    b=$(basename "$f")
    cmp -s "$f" "$DIR/.github/workflows/$b" || { WF_OK=1; echo "      ไม่ตรงกัน: .github/workflows/$b"; }
  done
else WF_OK=1; echo "      ไม่พบ .github/workflows หรือ android/ci"; fi
rec "3 workflow ใน .github/workflows ตรงกับ android/ci ทุกไบต์" $WF_OK

# 4) ประตูตรวจไม่ใช้เบราว์เซอร์ (รันในโฟลเดอร์ที่แตกใหม่ ไม่ใช่โฟลเดอร์ทำงาน)
echo
echo "== ประตูตรวจ (ci-gate.sh)"
( cd "$DIR" && bash tools/ci-gate.sh ) ; rec "4 ประตูตรวจ ci-gate.sh" $?

# 5) เทสต์เบราว์เซอร์ทั้งชุด (เฉพาะ --full)
if [ "$FULL" -eq 1 ]; then
  echo
  echo "== เทสต์เบราว์เซอร์ทั้งชุด (verify-all.sh)"
  # บันทึกไว้นอกโฟลเดอร์ที่แตก เพราะไฟล์แปลกปลอมในโฟลเดอร์จะทำให้ check.js ไม่ผ่าน
  VLOG="${DIR}-verify-all.log"
  ( cd "$DIR" && bash tools/verify-all.sh ) > "$VLOG" 2>&1
  VA=$?
  tail -n 3 "$VLOG"
  rec "5 verify-all.sh (เบราว์เซอร์ทั้งชุด) รายละเอียด $VLOG" $VA
else
  RESULTS+=("skip  5 verify-all.sh (ใส่ --full เพื่อรัน)")
fi

echo
echo "===== สรุป NINO.zip ($(( $(date +%s) - T0 )) วินาที) ====="
for r in "${RESULTS[@]}"; do echo "$r"; done
if [ "${#FAILED[@]}" -eq 0 ]; then echo "ผลรวม: ผ่านทุกขั้น"; exit 0; fi
echo "ผลรวม: ไม่ผ่าน ${#FAILED[@]} ขั้น"
for f in "${FAILED[@]}"; do echo "  - $f"; done
exit 1
