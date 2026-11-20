#!/usr/bin/env bash
# Signs FILE with the private key inside a PKCS12 keystore (the same key that signs the APK).
# usage: NINO_KS_PASS=... tools/ci/sign-file.sh KEYSTORE FILE OUT.sig
# The signature is RSA PKCS#1 v1.5 over SHA-256; the app verifies it with its own signing certificate.
set -euo pipefail
ks="${1:?keystore}"; f="${2:?file}"; out="${3:?out}"
: "${NINO_KS_PASS:?NINO_KS_PASS must be set}"
key="$(mktemp)"
trap 'rm -f "$key"' EXIT
openssl pkcs12 -in "$ks" -nodes -nocerts -passin env:NINO_KS_PASS 2>/dev/null | openssl pkey -out "$key"
openssl dgst -sha256 -sign "$key" -out "$out" "$f"
