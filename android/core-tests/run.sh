#!/usr/bin/env bash
# Compiles app/nino/core (pure Java, no Android imports) and runs its tests on a plain JVM.
# CI runs this before Gradle so a broken core never reaches an APK. Needs: JDK 17+, openssl, keytool.
set -euo pipefail
cd "$(dirname "$0")"
SRC=../app/src/main/java/app/nino/core
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

# 1) The core must only use APIs that exist on Android API 26 (a Java 8 level API surface).
if grep -nE 'import android\.|\.readAllBytes\(|\.isBlank\(|\.strip\(|List\.of\(|Map\.of\(|Set\.of\(|Files\.(readString|writeString)|\.repeat\(|ProcessHandle|\bvar [a-z]' "$SRC"/*.java; then
  echo "core uses an Android import or an API newer than Java 8 (see lines above)"; exit 1
fi

# 2) Compile the core exactly as the app ships it (with a full JDK, --release 8 pins the API surface), then the tests separately
#    (the tests use com.sun.net.httpserver for the local OTA server, which is not part of what ships).
mkdir -p "$OUT/core" "$OUT/test"
if command -v javac >/dev/null 2>&1; then
  if javac --release 8 -version >/dev/null 2>&1; then FLAGS="--release 8"; else FLAGS="-source 8 -target 8"; fi
  javac $FLAGS -Xlint:-options -Xlint:-deprecation -d "$OUT/core" "$SRC"/*.java
  javac -Xlint:-options -Xlint:-deprecation -cp "$OUT/core" -d "$OUT/test" src/app/nino/core/*.java
else
  java Javac.java -source 8 -target 8 -Xlint:-options -Xlint:-deprecation -d "$OUT/core" "$SRC"/*.java
  java Javac.java -Xlint:-options -Xlint:-deprecation -cp "$OUT/core" -d "$OUT/test" src/app/nino/core/*.java
fi

# 3) Run. The tests use tools/ci/sign-file.sh so the CI signing path is exercised for real.
java -Dnino.root=../.. -cp "$OUT/core:$OUT/test" app.nino.core.TestMain
