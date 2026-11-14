#!/usr/bin/env bash
# Verifies a built OTA dist/ with the app's own Java classes.  usage: android/core-tests/verify.sh DIST_DIR [CERT.der|none]
set -euo pipefail
cd "$(dirname "$0")"
OUT="$(mktemp -d)"; trap 'rm -rf "$OUT"' EXIT
SRC=../app/src/main/java/app/nino/core
if command -v javac >/dev/null 2>&1; then
  javac -source 8 -target 8 -Xlint:-options -d "$OUT" "$SRC"/*.java src/app/nino/core/VerifyBundle.java 2>/dev/null || javac -d "$OUT" "$SRC"/*.java src/app/nino/core/VerifyBundle.java
else
  java Javac.java -source 8 -target 8 -Xlint:-options -Xlint:-deprecation -d "$OUT" "$SRC"/*.java src/app/nino/core/VerifyBundle.java
fi
DIST="$(cd "$1" && pwd)"
java -cp "$OUT" app.nino.core.VerifyBundle "$DIST" "${2:-none}"
