#!/usr/bin/env bash
# Prepares a dependency that does not build for js/wasm.
# gopkg.in/Sirupsen/logrus.v0 calls IsTerminal(io.Writer), which exists only on
# unix/windows targets. This copies the module to OUT, adds terminal_js.go, and
# points go.mod at the copy with a replace directive.
#
# NOTE: this edits go.mod of the module it runs in. Run it only in CI or in a
# throwaway copy. Do not commit the result.
#   bash tools/nds-core/prepare-js-deps.sh [OUT]
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:-${RUNNER_TEMP:-/tmp}/logrus-js}"
LDIR=$(go list -m -f '{{.Dir}}' gopkg.in/Sirupsen/logrus.v0)
if [ -z "$LDIR" ] || [ ! -d "$LDIR" ]; then
  echo "logrus.v0 is not in the module cache; run go mod download first"; exit 1
fi
rm -rf "$OUT"
cp -r "$LDIR" "$OUT"
chmod -R u+w "$OUT"
printf '//go:build js\n\npackage logrus\n\nimport "io"\n\nfunc IsTerminal(w io.Writer) bool { return false }\n' > "$OUT/terminal_js.go"
[ -f "$OUT/go.mod" ] || printf 'module gopkg.in/Sirupsen/logrus.v0\n\ngo 1.21\n' > "$OUT/go.mod"
go mod edit -replace=gopkg.in/Sirupsen/logrus.v0="$OUT"
echo "logrus.v0 replaced by $OUT for js/wasm builds"
