#!/bin/sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
bench_root=${BENCH_ROOT:-/Volumes/MacOS_VMs/xataka-ai-bench}
source_root=${AIBENCH_LEGACY_SOURCE:-/Users/javipas/qwen-vs-codex-tests}
legacy_root="$bench_root/legacy"
destination_root="$legacy_root/qwen-vs-codex-tests"

"$script_directory/verify-storage.sh"
[ -d "$source_root" ] || { printf 'archive_error=source does not exist: %s\n' "$source_root" >&2; exit 1; }
[ ! -e "$destination_root" ] || { printf 'archive_error=destination already exists: %s\n' "$destination_root" >&2; exit 1; }
command -v ditto >/dev/null 2>&1 || { printf 'archive_error=ditto is unavailable\n' >&2; exit 1; }

temporary_directory=$(mktemp -d "${TMPDIR:-/tmp}/aibench-archive.XXXXXX")
cleanup() {
  rm -rf "$temporary_directory"
}
trap cleanup EXIT HUP INT TERM

inventory() {
  root=$1
  output=$2
  (
    cd "$root"
    find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256
  ) > "$output"
}

mkdir -p "$legacy_root"
inventory "$source_root" "$temporary_directory/source.sha256"
ditto "$source_root" "$destination_root"
inventory "$destination_root" "$temporary_directory/destination.sha256"

if ! cmp -s "$temporary_directory/source.sha256" "$temporary_directory/destination.sha256"; then
  printf 'archive_error=source and destination inventories differ; copied data retained for inspection\n' >&2
  exit 1
fi

cp "$temporary_directory/destination.sha256" "$legacy_root/inventory.sha256"
file_count=$(wc -l < "$legacy_root/inventory.sha256" | tr -d ' ')
byte_count=$(du -sk "$destination_root" | awk '{ print $1 * 1024 }')
inventory_hash=$(shasum -a 256 "$legacy_root/inventory.sha256" | awk '{ print $1 }')
created_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

printf '{\n  "schemaVersion": "1.0.0",\n  "createdAt": "%s",\n  "source": "%s",\n  "destination": "%s",\n  "fileCount": %s,\n  "byteCount": %s,\n  "inventorySha256": "%s",\n  "verified": true,\n  "sourceRemoved": false\n}\n' \
  "$created_at" "$source_root" "$destination_root" "$file_count" "$byte_count" "$inventory_hash" \
  > "$legacy_root/inventory.json"

printf 'archive_status=ok\n'
printf 'destination=%s\n' "$destination_root"
printf 'file_count=%s\n' "$file_count"
printf 'inventory=%s\n' "$legacy_root/inventory.sha256"
printf 'source_removed=false\n'
