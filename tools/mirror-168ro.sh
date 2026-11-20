#!/usr/bin/env bash
# ดาวน์โหลดเว็บ 168ro.online เก็บไว้ใน games/168ro/ เพื่อเปิดในแอป NINO ได้โดยไม่มีเน็ต
#
# รันบนเครื่องที่มีอินเทอร์เน็ต (ต้องมี wget):
#   bash tools/mirror-168ro.sh
#
# ถ้าเว็บต้องล็อกอิน: ส่งออกคุกกี้ของเว็บเป็นไฟล์ cookies.txt (รูปแบบ Netscape)
# จากส่วนขยาย "cookies.txt" ของเบราว์เซอร์ แล้วรัน:
#   COOKIES=cookies.txt bash tools/mirror-168ro.sh
# สคริปต์นี้ไม่เก็บรหัสผ่านไว้ที่ใดเลย
#
# ถ้าดาวน์โหลดล้มเหลว โฟลเดอร์เดิมจะไม่ถูกแตะ
set -eu
cd "$(dirname "$0")/.."

SITE="${SITE:-https://168ro.online/}"
DEST="games/168ro"
HOST=$(echo "$SITE" | sed -E 's#^https?://([^/:]+).*#\1#')
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ARGS=(
  --recursive --level=5 --page-requisites --convert-links --adjust-extension
  --no-parent --restrict-file-names=windows
  --domains="$HOST" --wait=0.3 --random-wait --timeout=30 --tries=2
  --directory-prefix="$TMP" --no-verbose
)
if [ -n "${COOKIES:-}" ]; then
  [ -f "$COOKIES" ] || { echo "ไม่พบไฟล์คุกกี้: $COOKIES"; exit 1; }
  ARGS+=(--load-cookies "$COOKIES")
fi

echo "กำลังดาวน์โหลด $SITE ..."
wget "${ARGS[@]}" "$SITE" || echo "(บางไฟล์โหลดไม่ได้ ดูข้อความด้านบน ถ้าหน้าหลักโหลดได้ ก็ยังใช้งานได้)"

# wget ตั้งชื่อโฟลเดอร์ตามโฮสต์ (มีพอร์ตจะเปลี่ยนเป็น + ) จึงหาโฟลเดอร์ที่สร้างขึ้นจริง
SRC=$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)
if [ -z "$SRC" ] || [ ! -f "$SRC/index.html" ]; then
  echo "ไม่ได้ไฟล์หน้าหลัก index.html ยกเลิก ไม่แตะสำเนาเดิม"
  exit 1
fi

# สลับโฟลเดอร์แบบทั้งก้อน: เขียนลง .new ก่อน แล้วค่อยแทนที่
rm -rf "$DEST.new"
mkdir -p "$DEST.new"
cp -R "$SRC/." "$DEST.new/"
rm -rf "$DEST"
mv "$DEST.new" "$DEST"

python3 tools/make-manifests.py >/dev/null
echo "เสร็จแล้ว: $(find "$DEST" -type f ! -name offline-files.json | wc -l) ไฟล์ใน $DEST"
echo "ถ้าเว็บมีไฟล์จากโดเมนอื่น (เช่น CDN) ไฟล์เหล่านั้นจะไม่ถูกเก็บ"
echo "ต่อไป: อัปเดตแอป NINO ให้มีไฟล์นี้ แล้วเปิดแอปออนไลน์หนึ่งครั้งเพื่อให้เก็บลงเครื่อง"
