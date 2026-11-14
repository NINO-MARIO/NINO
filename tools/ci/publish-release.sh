#!/usr/bin/env bash
# Publishes the OTA bundle as release web-<sha7> (draft first, so the app never sees half-uploaded assets),
# moves the "web-latest" pointer forward (never backward), and prunes old bundles.
# usage: tools/ci/publish-release.sh DIST_DIR     env: GH_TOKEN GITHUB_SHA GITHUB_RUN_NUMBER
set -euo pipefail
D="${1:?dist dir}"; TAG="web-${GITHUB_SHA:0:7}"; RUN="${GITHUB_RUN_NUMBER:?}"
KEEP="${NINO_KEEP_BUNDLES:-30}"
VERSION=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['version'])" "$D/bundle.json")
FILES=("$D/web-bundle.zip" "$D/bundle.json")
[ -f "$D/bundle.json.sig" ] && FILES+=("$D/bundle.json.sig")
NOTES="Web layer of NINO v$VERSION (run $RUN, commit ${GITHUB_SHA:0:7}). The app downloads this by itself - you do not need to."
if gh release view "$TAG" >/dev/null 2>&1; then
  gh release upload "$TAG" "${FILES[@]}" --clobber
else
  gh release create "$TAG" "${FILES[@]}" --draft --prerelease --target "$GITHUB_SHA" --title "NINO web v$VERSION · run $RUN" --notes "$NOTES"
  gh release edit "$TAG" --draft=false --prerelease
fi
echo "published $TAG"

# pointer: only move forward, so a slow older run can never overwrite a newer one
CUR=$(gh release download web-latest -p latest.json -O - 2>/dev/null | python3 -c 'import sys,json;print(int(json.load(sys.stdin).get("run",0)))' 2>/dev/null || echo 0)
if [ "${CUR:-0}" -lt "$RUN" ]; then
  gh release view web-latest >/dev/null 2>&1 || gh release create web-latest --title "NINO web (ล่าสุด)" --notes "ตัวชี้ไปยังเวอร์ชันเว็บล่าสุด (ไฟล์เล็ก ๆ ที่แอปอ่านเอง)" --prerelease
  gh release upload web-latest "$D/latest.json" --clobber
  echo "web-latest -> $TAG (run $RUN)"
else
  echo "web-latest already points to run $CUR (newer than $RUN), left alone"
fi

# retention (best effort)
gh release list --limit 300 --json tagName,createdAt \
  -q "[.[]|select(.tagName|test(\"^web-[0-9a-f]{7}\$\"))]|sort_by(.createdAt)|reverse|.[$KEEP:]|.[].tagName" 2>/dev/null \
  | while read -r t; do [ -n "$t" ] && gh release delete "$t" --cleanup-tag -y || true; done || true
