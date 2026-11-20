#!/usr/bin/env bash
# Decrypts android/signing/nino.jks.enc when the NINO_SIGN_PASS secret exists. Exports NINO_KEYSTORE and SIGNED for later steps.
# Without a key the build still runs, but the APK is signed with a throwaway debug key and cannot update an installed copy.
# env: SIGN_PASS (the secret), RUNNER_TEMP, GITHUB_ENV
set -euo pipefail
HAS_FILE=0; [ -f android/signing/nino.jks.enc ] && HAS_FILE=1
HAS_PASS=0; [ -n "${SIGN_PASS:-}" ] && HAS_PASS=1
if [ "$HAS_PASS" = 1 ] && [ "$HAS_FILE" = 1 ]; then
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:SIGN_PASS \
    -in android/signing/nino.jks.enc -out "$RUNNER_TEMP/nino.jks" \
    || { echo "::error::รหัส NINO_SIGN_PASS ไม่ตรงกับตอนสร้างกุญแจ (แก้ค่า secret ให้ตรง แล้วรันใหม่)"; exit 1; }
  { echo "NINO_KEYSTORE=$RUNNER_TEMP/nino.jks"; echo "SIGNED=1"; } >> "$GITHUB_ENV"
  echo "restored the signing key"
elif [ "$HAS_FILE" = 1 ]; then
  echo "::warning::มีไฟล์กุญแจในรีโปแล้ว แต่ยังไม่ได้ตั้ง secret NINO_SIGN_PASS จึงใช้ debug key ชั่วคราว"
  echo "ยังไม่มีกุญแจลงนาม จะได้ APK แบบ debug และ bundle แบบไม่มีลายเซ็น"
else
  echo "::warning::ยังไม่มีกุญแจลงนามในรีโป (android/signing/nino.jks.enc) จะได้ APK แบบ debug ที่ติดตั้งทับกันไม่ได้ และ bundle แบบไม่มีลายเซ็น"
  echo "ยังไม่มีกุญแจลงนาม จะได้ APK แบบ debug และ bundle แบบไม่มีลายเซ็น"
fi
