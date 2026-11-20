#!/usr/bin/env bash
# ประตูตรวจแบบไม่ใช้เบราว์เซอร์ สำหรับ CI (unpack-zip.yml) และตรวจซ้ำได้ในเครื่อง
# ทุกขั้นรันจนจบ ไม่หยุดที่ขั้นแรกที่พลาด แล้วสรุปผลท้ายสุด ออกด้วยรหัส 1 ถ้ามีขั้นไหนไม่ผ่าน
# ขั้นที่ต้องใช้เบราว์เซอร์ (verify-all.sh) ไม่อยู่ที่นี่ ให้รันในเครื่องก่อนส่งซิป
set -u
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
FAILED=()
LOG=$(mktemp)
trap 'rm -f "$LOG"' EXIT

run() {
  local label="$1"; shift
  if "$@" > "$LOG" 2>&1; then
    PASS=$((PASS + 1))
    echo "ok    $label"
  else
    FAIL=$((FAIL + 1))
    FAILED+=("$label")
    echo "FAIL  $label"
    tail -n 12 "$LOG" | sed 's/^/        /'
  fi
}

# โครงสร้างและไฟล์ที่ต้องมี (ซิปไม่ครบต้องไม่ถูกคอมมิต)
for f in index.html js/local-llm.js js/mim-llm.js js/llm-providers.js mim/mim.js mim/engine/37-thinker.js tools/verify-all.sh tools/check.js; do
  run "มีไฟล์ $f" test -f "$f"
done

run "ตรวจโครงสร้างแบบเข้ม (check.js --strict)" node tools/check.js --strict
run "ไฟล์สร้างอัตโนมัติตรงกับโค้ด (NOW.md)" node tools/make-now.js --check
run "ไฟล์ packs ตรงกับโค้ด" python3 tools/make-packs.py --check

# เทสต์ที่ไม่ใช้เบราว์เซอร์เท่านั้น (continue, card, research ใช้ harness ของเบราว์เซอร์ จึงอยู่ใน verify-all เท่านั้น)
for t in music-logic music-playlist mood cg-pick; do
  run "เทสต์ $t" node "tools/test/$t.test.js"
done

for t in engine-tests nadia-test learn-test chat-behavior-test breadth-test skills-test coin-test sources-test webcand-test selfstudy-test gaps-test play-test; do
  run "มิ้ม $t" node "mim/tests/$t.js"
done
run "มิ้ม เกณฑ์กันตอบผิด (eval-retrieval --gate)" node mim/tests/eval-retrieval.js --gate
run "ตัวตรวจโหมด 1 (mim-llm)" node tools/test/mim-llm.test.js
run "ชั้นโค้ดของโมเดลในเครื่อง (local-code-guard)" node tools/test/local-code-guard.test.js

echo ""
echo "สรุป: ผ่าน $PASS ไม่ผ่าน $FAIL"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## ประตูตรวจ (ไม่ใช้เบราว์เซอร์)"
    echo "ผ่าน $PASS · ไม่ผ่าน $FAIL"
    for f in "${FAILED[@]:-}"; do [ -n "$f" ] && echo "- ไม่ผ่าน: $f"; done
  } >> "$GITHUB_STEP_SUMMARY"
fi
[ "$FAIL" -eq 0 ]
