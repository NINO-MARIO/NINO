#!/usr/bin/env bash
# ปล่อย NINO.zip ด้วยคำสั่งเดียว ตามลำดับเดิมทุกขั้น (ของเดิมต้องทำด้วยมือทีละคำสั่ง)
#   แมนิเฟสต์ ×3 → make-now → ประตู ci-gate → ลบ __pycache__ → สร้างซิป → (--full) เทสต์ซิปเต็มชุด → (--publish) คัดลอกแล้วเทียบไบต์
#
#   bash tools/release.sh                         สร้างซิปที่ ../NINO.zip ไม่รันเทสต์เต็ม ไม่คัดลอก
#   bash tools/release.sh --out <ไฟล์.zip>         ระบุที่เก็บซิป (ห้ามอยู่ในโฟลเดอร์โปรเจกต์)
#   bash tools/release.sh --full                  รันเทสต์ซิปเต็มชุดด้วย (ประมาณ 10 นาที ควรรันเบื้องหลังด้วย nohup)
#   bash tools/release.sh --full --publish <ปลายทาง>  คัดลอกเฉพาะเมื่อทุกขั้นผ่าน แล้วเทียบไบต์
#
# หลักการ: ขั้นใดล้มแล้วหยุดทันที ไม่คัดลอกไปปลายทาง ไม่ลบไฟล์โค้ดหรือไฟล์เอกสาร (ลบเฉพาะ __pycache__ ซึ่งเป็นผลพลอยจากการรัน)
# ทดสอบการหยุดได้ด้วยตัวแปร RELEASE_TEST_FAIL=<ชื่อขั้น> (manifest, now, gate, zip, full)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="$(dirname "$ROOT")/NINO.zip"; FULL=0; PUB=""
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --full) FULL=1; shift ;;
    --publish) PUB="$2"; shift 2 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "ไม่รู้จักตัวเลือก: $1"; exit 2 ;;
  esac
done
if [ -n "$PUB" ] && [ "$FULL" -ne 1 ]; then echo "--publish ต้องใช้ร่วมกับ --full (ไม่คัดลอกโดยไม่ผ่านเทสต์เต็ม)"; exit 2; fi
case "$OUT" in "$ROOT"/*) echo "--out ห้ามอยู่ในโฟลเดอร์โปรเจกต์ (ซิปจะรวมตัวเอง): $OUT"; exit 2;; esac

trap 'echo; echo "หยุดที่บรรทัด $LINENO: ยังไม่ได้คัดลอกไปปลายทาง ซิปที่สร้างแล้ว (ถ้ามี) ไม่ถูกนำไปใช้"' ERR
inject() { if [ "${RELEASE_TEST_FAIL:-}" = "$1" ]; then echo "(ทดสอบการหยุด) ขั้น $1 ล้มโดยตั้งใจ"; return 1; fi; return 0; }

echo "== 1 แมนิเฟสต์ (สร้างสามรอบให้นิ่ง)"
inject manifest
for i in 1 2 3; do python3 tools/make-manifests.py >/dev/null; done

echo "== 2 make-now"
inject now
node tools/make-now.js >/dev/null

echo "== 3 ประตูตรวจ ci-gate"
inject gate
bash tools/ci-gate.sh | tail -1

echo "== 4 ลบ __pycache__ (ผลพลอยจากการรัน)"
find . -name __pycache__ -type d -prune -exec rm -rf {} +

echo "== 5 สร้างซิป: $OUT"
inject zip
mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
zip -rqX "$OUT" . -x '*/__pycache__/*' '*.gguf' '*Q2_K*' 'tools/perf-baseline.json'
echo "   ขนาด $(stat -c %s "$OUT") ไบต์"

if [ "$FULL" -eq 1 ]; then
  echo "== 6 เทสต์ซิปเต็มชุด (test-zip --full)"
  inject full
  bash tools/test-zip.sh --full "$OUT"
else
  echo "== 6 ข้ามเทสต์เต็ม (ใส่ --full เพื่อรัน)"
fi

if [ -n "$PUB" ]; then
  echo "== 7 คัดลอกไปปลายทางและเทียบไบต์: $PUB"
  cp "$OUT" "$PUB"
  cmp "$OUT" "$PUB"
  echo "   ตรงกันทุกไบต์"
fi
echo
echo "สำเร็จ: $OUT"
