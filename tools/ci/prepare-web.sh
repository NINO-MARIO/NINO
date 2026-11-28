#!/usr/bin/env bash
# Copies the web UI into DEST (outside the repo tree), builds Tailwind locally (no CDN), writes build-info.json
# and runs the static gate on the result. Used by both the OTA bundle job and the APK job so they ship identical files.
# usage: tools/ci/prepare-web.sh DEST
set -euo pipefail
DEST="${1:?destination dir}"
REPO="$(pwd)"
# generated docs/manifests are rebuilt from the code being shipped, so the bundle never carries a stale NOW.md or file list
node "$REPO/tools/make-now.js" || echo "::warning::could not refresh NOW.md"
python3 "$REPO/tools/make-manifests.py" > /dev/null || echo "::warning::could not refresh manifests"
rm -rf "$DEST"; mkdir -p "$DEST"
tar -cf - --exclude=./android --exclude=./.git --exclude=./.github --exclude=./tools --exclude=./legacy --exclude=./packs \
  --exclude='*.zip' --exclude=./.gitignore --exclude=./.nojekyll . | tar -xf - -C "$DEST"
[ -f "$DEST/index.html" ] || { echo "::error::index.html is missing from the web tree"; exit 1; }

# Tailwind: build the CSS once at CI time so the app never needs the CDN (best effort, keeps the CDN tag on failure)
(
  cd "$DEST"
  TW="${RUNNER_TEMP:-/tmp}/tailwindcss"
  if curl -sSfL -o "$TW" https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.17/tailwindcss-linux-x64; then
    chmod +x "$TW"
    printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > "${RUNNER_TEMP:-/tmp}/in.css"
    "$TW" -i "${RUNNER_TEMP:-/tmp}/in.css" -o tailwind.css --minify --content "./index.html,./*.js,./js/**/*.js,./local-ai/*.js" || true
    SIZE=$( [ -f tailwind.css ] && wc -c < tailwind.css || echo 0 )
    if [ "$SIZE" -gt 10000 ]; then
      sed -i 's#<script src="https://cdn.tailwindcss.com"></script>#<link rel="stylesheet" href="./tailwind.css">#' index.html
      if grep -q 'cdn.tailwindcss.com' index.html; then echo "::warning::CDN tag not replaced"; else echo "Tailwind CSS built ($SIZE bytes), CDN removed"; fi
    else
      rm -f tailwind.css
      echo "::warning::Tailwind build failed or too small, keeping the CDN"
    fi
  else
    echo "::warning::could not download the Tailwind binary, keeping the CDN"
  fi
) || echo "::warning::tailwind step failed, keeping the CDN"

bash "$REPO/tools/ci/build-nds.sh" "$DEST" || echo "::warning::ขั้นแกน NDS ล้ม ระบบอื่นยังบิลด์ต่อ"

# identity of this build: the app reads it to know what it is running (and what counts as "newer")
VERSION=$(sed -n "s/.*NINO_VERSION='\([0-9][0-9.]*\)'.*/\1/p" "$DEST/version.js" | head -1)
python3 - "$DEST/build-info.json" "$VERSION" <<'PY'
import json, os, sys, datetime
out, version = sys.argv[1], sys.argv[2]
json.dump({
    "commit": os.environ.get("GITHUB_SHA", ""),
    "run": int(os.environ.get("GITHUB_RUN_NUMBER", "0") or 0),
    "repo": os.environ.get("GITHUB_REPOSITORY", ""),
    "branch": os.environ.get("GITHUB_REF_NAME", "main"),
    "version": version,
    "builtAt": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
}, open(out, "w"), indent=1)
PY

# last line of defence: the tree we are about to ship must pass the same static checks as the repo
node "$REPO/tools/check.js" --root "$DEST"
echo "web tree ready: $(find "$DEST" -type f | wc -l) files, $(du -sh "$DEST" | cut -f1)"
