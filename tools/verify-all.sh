#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."
fail=0
step() { echo; echo "== $1"; shift; "$@" || { echo "FAILED: $*"; fail=1; }; }
step "static gate (strict)" node tools/check.js --strict
step "web tests" node tools/test/web.test.js
if [ -d node_modules/playwright ] || [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ] || command -v npx >/dev/null 2>&1; then
  step "browser tests" node tools/test/browser.test.js
  step "outlaw offline (service worker precache, network cut)" node tools/test/outlaw-offline.test.js
else
  echo "skip browser tests (no playwright)"
fi
step "auto-continue tests" node tools/test/continue.test.js
step "card + self-stop tests" node tools/test/card.test.js
step "music logic tests" node tools/test/music-logic.test.js
step "research + Google tests" node tools/test/research.test.js
step "NOW.md matches code" node tools/make-now.js --check
step "packs manifest matches files" python3 tools/make-packs.py --check
if [ -f android/core-tests/run.sh ] && command -v java >/dev/null 2>&1; then step "android core (JVM)" bash android/core-tests/run.sh; fi
echo
if [ "$fail" = 0 ]; then echo "ALL GREEN"; else echo "SOMETHING FAILED"; exit 1; fi
