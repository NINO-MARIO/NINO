#!/usr/bin/env bash
# Packs a prepared web tree into the OTA bundle: web-bundle.zip + bundle.json (+ bundle.json.sig) + latest.json.
# usage: tools/ci/make-bundle.sh WEB_DIR OUT_DIR      env: GITHUB_SHA GITHUB_RUN_NUMBER [NINO_KEYSTORE NINO_KS_PASS]
set -euo pipefail
WEB="${1:?web dir}"; OUT="${2:?out dir}"
SHA="${GITHUB_SHA:?}"; RUN="${GITHUB_RUN_NUMBER:?}"
mkdir -p "$OUT"; rm -f "$OUT"/web-bundle.zip "$OUT"/bundle.json "$OUT"/bundle.json.sig "$OUT"/latest.json
VERSION=$(sed -n "s/.*NINO_VERSION='\([0-9][0-9.]*\)'.*/\1/p" "$WEB/version.js" | head -1)
MINBRIDGE=$(sed -n "s/.*NINO_BRIDGE_API=\([0-9]*\).*/\1/p" "$WEB/version.js" | head -1)
MSG=$(git log -1 --format=%s 2>/dev/null | cut -c1-200 || true)
# relative names only (no leading ./), stable order, no extra file attributes
( cd "$WEB" && find . -type f -printf '%P\n' | LC_ALL=C sort | zip -q -X -@ "$OUT/web-bundle.zip" )
python3 - "$OUT" "$SHA" "$RUN" "$VERSION" "${MINBRIDGE:-0}" "$MSG" <<'PY'
import hashlib, json, os, sys, datetime
out, sha, run, version, minb, msg = sys.argv[1:7]
z = os.path.join(out, "web-bundle.zip")
data = open(z, "rb").read()
tag = "web-" + sha[:7]
built = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
bundle = {"schema": 1, "id": tag, "version": version, "commit": sha, "message": msg, "builtAt": built, "run": int(run),
          "minBridge": int(minb), "zip": {"name": "web-bundle.zip", "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}}
json.dump(bundle, open(os.path.join(out, "bundle.json"), "w"), indent=1, ensure_ascii=False)
json.dump({"tag": tag, "commit": sha, "version": version, "run": int(run), "builtAt": built, "message": msg},
          open(os.path.join(out, "latest.json"), "w"), indent=1, ensure_ascii=False)
PY
if [ -n "${NINO_KEYSTORE:-}" ] && [ -n "${NINO_KS_PASS:-}" ]; then
  bash "$(dirname "$0")/sign-file.sh" "$NINO_KEYSTORE" "$OUT/bundle.json" "$OUT/bundle.json.sig"
  echo "bundle signed with the app signing key"
else
  echo "::warning::no signing key - bundle is unsigned (only debug builds of the app accept it)"
fi
ls -la "$OUT"
