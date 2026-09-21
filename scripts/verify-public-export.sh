#!/bin/sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_directory/.." && pwd)
output_root="$project_root/apps/web/out"
run_id=20260915T111513Z-space-station-fps-opencode-qwen38-ninfer-medium-2bbbf0
source_index_id=c291cmNlL2luZGV4Lmh0bWw

fail() {
  printf 'public_export_error=%s\n' "$1" >&2
  exit 1
}

[ -d "$output_root" ] || fail "static output is missing; run pnpm --filter @aibench/web build first"

for file in \
  "$output_root/es/runs/$run_id.html" \
  "$output_root/en/runs/$run_id.html" \
  "$output_root/runs/$run_id/files/$source_index_id" \
  "$output_root/es/tests/space-station-fps.html" \
  "$output_root/en/tests/space-station-fps.html" \
  "$output_root/es/systems/opencode-qwen38-ninfer-medium.html" \
  "$output_root/en/systems/opencode-qwen38-ninfer-medium.html"
do
  [ -f "$file" ] || fail "expected route is missing: $file"
done

grep -Fq "Official failed result" "$output_root/en/runs/$run_id.html" || fail "English run summary is missing"
grep -Fq "/runs/$run_id/files/$source_index_id" "$output_root/en/runs/$run_id.html" || fail "clean public file URL is missing"
if grep -R -E '192\.168\.|Bearer[[:space:]]+[A-Za-z0-9_-]{10,}|api[_-]?key[[:space:]]*[:=]' "$output_root" >/dev/null 2>&1; then
  fail "static output contains a private endpoint or credential-shaped value"
fi
if grep -R -F -e '/api/runs' -e '/actions/' -e '/state/' -e 'apps/console' "$output_root" >/dev/null 2>&1; then
  fail "static output contains an operator-console or private-state reference"
fi

printf 'public_export_status=ok\n'
