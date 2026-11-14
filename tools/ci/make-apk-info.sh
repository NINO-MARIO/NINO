#!/usr/bin/env bash
# Writes apk.json next to NINO.apk (what the app reads before it downloads an update).
# usage: tools/ci/make-apk-info.sh APK OUT.json VERSION_CODE VERSION_NAME     env: GITHUB_SHA GITHUB_RUN_NUMBER SIGNED
set -euo pipefail
APK="${1:?apk}"; OUT="${2:?out}"; CODE="${3:?code}"; NAME="${4:?name}"
BRIDGE=$(sed -n 's/.*const val BRIDGE_API = \([0-9]*\).*/\1/p' android/app/src/main/java/app/nino/NativeBridge.kt | head -1)
python3 - "$APK" "$OUT" "$CODE" "$NAME" "${BRIDGE:-0}" <<'PY'
import hashlib, json, os, sys, datetime
apk, out, code, name, bridge = sys.argv[1:6]
data = open(apk, "rb").read()
json.dump({"schema": 1, "versionCode": int(code), "versionName": name, "commit": os.environ.get("GITHUB_SHA", ""),
           "run": int(os.environ.get("GITHUB_RUN_NUMBER", "0") or 0), "size": len(data), "sha256": hashlib.sha256(data).hexdigest(),
           "bridgeApi": int(bridge), "signed": os.environ.get("SIGNED") == "1",
           "builtAt": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")}, open(out, "w"), indent=1)
PY
cat "$OUT"
