#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")/.."
echo "ติดตั้งสภาพแวดล้อมเทสต์เบราว์เซอร์ (ไม่รวมอยู่ในซิป: เบราว์เซอร์ราว 650 MB)"
echo "ขนาดจอที่เทสต์ใช้: 390 x 844 (tools/test/harness.js)"
if ! node -e "require('playwright')" >/dev/null 2>&1; then
  npm i --no-save playwright@1.63.0
fi
npx playwright install chromium
echo "เสร็จแล้ว รันเทสต์ทั้งชุดด้วย: bash tools/verify-all.sh"
