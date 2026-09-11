#!/bin/sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
bench_root=${BENCH_ROOT:-/Volumes/MacOS_VMs/xataka-ai-bench}
source_root=${AIBENCH_LEGACY_SOURCE:-/Users/javipas/qwen-vs-codex-tests}
legacy_root="$bench_root/legacy"
destination_root="$legacy_root/qwen-vs-codex-tests"

fixture_argument=
if [ "$#" -gt 0 ]; then
  [ "$#" -eq 1 ] && [ "$1" = "--test-fixtures" ] || {
    printf 'archive_error=usage: archive-legacy.sh [--test-fixtures]\n' >&2
    exit 2
  }
  fixture_argument=--test-fixtures
fi

if [ -n "$fixture_argument" ]; then
  "$script_directory/verify-storage.sh" "$fixture_argument"
else
  "$script_directory/verify-storage.sh"
fi
[ -d "$source_root" ] || { printf 'archive_error=source does not exist: %s\n' "$source_root" >&2; exit 1; }
[ ! -e "$destination_root" ] || { printf 'archive_error=destination already exists: %s\n' "$destination_root" >&2; exit 1; }
command -v ditto >/dev/null 2>&1 || { printf 'archive_error=ditto is unavailable\n' >&2; exit 1; }
command -v mkbom >/dev/null 2>&1 || { printf 'archive_error=mkbom is unavailable\n' >&2; exit 1; }
command -v lsbom >/dev/null 2>&1 || { printf 'archive_error=lsbom is unavailable\n' >&2; exit 1; }
command -v xattr >/dev/null 2>&1 || { printf 'archive_error=xattr is unavailable\n' >&2; exit 1; }

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

metadata_inventory() {
  root=$1
  output=$2
  bom=$3
  mkbom "$root" "$bom"
  lsbom "$bom" | LC_ALL=C sort > "$output"
}

extended_attribute_inventory() {
  root=$1
  output=$2
  (
    cd "$root"
    LC_ALL=C xattr -lr -x .
  ) > "$output"
}

acl_inventory() {
  root=$1
  output=$2
  (
    cd "$root"
    LC_ALL=C /bin/ls -leR .
  ) > "$output"
}

mkdir -p "$legacy_root"
inventory "$source_root" "$temporary_directory/source-before.sha256"
metadata_inventory "$source_root" "$temporary_directory/source-before.metadata" "$temporary_directory/source-before.bom"
extended_attribute_inventory "$source_root" "$temporary_directory/source-before.xattrs"
acl_inventory "$source_root" "$temporary_directory/source-before.acls"

ditto --rsrc --extattr --acl "$source_root" "$destination_root"

inventory "$destination_root" "$temporary_directory/destination.sha256"
metadata_inventory "$destination_root" "$temporary_directory/destination.metadata" "$temporary_directory/destination.bom"
extended_attribute_inventory "$destination_root" "$temporary_directory/destination.xattrs"
acl_inventory "$destination_root" "$temporary_directory/destination.acls"
inventory "$source_root" "$temporary_directory/source-after.sha256"
metadata_inventory "$source_root" "$temporary_directory/source-after.metadata" "$temporary_directory/source-after.bom"
extended_attribute_inventory "$source_root" "$temporary_directory/source-after.xattrs"
acl_inventory "$source_root" "$temporary_directory/source-after.acls"

if ! cmp -s "$temporary_directory/source-before.sha256" "$temporary_directory/source-after.sha256" ||
   ! cmp -s "$temporary_directory/source-before.metadata" "$temporary_directory/source-after.metadata" ||
   ! cmp -s "$temporary_directory/source-before.xattrs" "$temporary_directory/source-after.xattrs" ||
   ! cmp -s "$temporary_directory/source-before.acls" "$temporary_directory/source-after.acls"; then
  printf 'archive_error=source changed during copy; copied data retained for inspection\n' >&2
  exit 1
fi

if ! cmp -s "$temporary_directory/source-after.sha256" "$temporary_directory/destination.sha256" ||
   ! cmp -s "$temporary_directory/source-after.metadata" "$temporary_directory/destination.metadata" ||
   ! cmp -s "$temporary_directory/source-after.xattrs" "$temporary_directory/destination.xattrs" ||
   ! cmp -s "$temporary_directory/source-after.acls" "$temporary_directory/destination.acls"; then
  printf 'archive_error=source and destination inventories differ; copied data retained for inspection\n' >&2
  exit 1
fi

cp "$temporary_directory/destination.sha256" "$legacy_root/inventory.sha256"
cp "$temporary_directory/destination.metadata" "$legacy_root/inventory.metadata"
cp "$temporary_directory/destination.xattrs" "$legacy_root/inventory.xattrs"
cp "$temporary_directory/destination.acls" "$legacy_root/inventory.acls"
file_count=$(wc -l < "$legacy_root/inventory.sha256" | tr -d ' ')
entry_count=$(wc -l < "$legacy_root/inventory.metadata" | tr -d ' ')
byte_count=$(du -sk "$destination_root" | awk '{ print $1 * 1024 }')
inventory_hash=$(shasum -a 256 "$legacy_root/inventory.sha256" | awk '{ print $1 }')
metadata_hash=$(shasum -a 256 "$legacy_root/inventory.metadata" | awk '{ print $1 }')
xattrs_hash=$(shasum -a 256 "$legacy_root/inventory.xattrs" | awk '{ print $1 }')
acls_hash=$(shasum -a 256 "$legacy_root/inventory.acls" | awk '{ print $1 }')
created_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

printf '{\n  "schemaVersion": "1.0.0",\n  "createdAt": "%s",\n  "source": "%s",\n  "destination": "%s",\n  "fileCount": %s,\n  "entryCount": %s,\n  "byteCount": %s,\n  "inventorySha256": "%s",\n  "metadataInventorySha256": "%s",\n  "extendedAttributesInventorySha256": "%s",\n  "aclInventorySha256": "%s",\n  "verified": true,\n  "sourceStable": true,\n  "metadataVerified": true,\n  "extendedAttributesVerified": true,\n  "aclVerified": true,\n  "sourceRemoved": false\n}\n' \
  "$created_at" "$source_root" "$destination_root" "$file_count" "$entry_count" "$byte_count" \
  "$inventory_hash" "$metadata_hash" "$xattrs_hash" "$acls_hash" \
  > "$legacy_root/inventory.json"

printf 'archive_status=ok\n'
printf 'destination=%s\n' "$destination_root"
printf 'file_count=%s\n' "$file_count"
printf 'inventory=%s\n' "$legacy_root/inventory.sha256"
printf 'source_removed=false\n'
