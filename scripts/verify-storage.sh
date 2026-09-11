#!/bin/sh
set -eu

bench_root=${BENCH_ROOT:-/Volumes/MacOS_VMs/xataka-ai-bench}
required_prefix=${AIBENCH_REQUIRED_PREFIX:-/Volumes/MacOS_VMs/}
minimum_bytes=${AIBENCH_MIN_AVAILABLE_BYTES:-10737418240}

fail() {
  printf 'storage_error=%s\n' "$1" >&2
  exit 1
}

case "$bench_root/" in
  "$required_prefix"*) ;;
  *) fail "benchmark root is outside required prefix: $required_prefix" ;;
esac

[ -d "$bench_root" ] || fail "benchmark root does not exist: $bench_root"
physical_root=$(cd "$bench_root" && pwd -P) || fail "cannot resolve benchmark root"
case "$physical_root/" in
  "$required_prefix"*) ;;
  *) fail "resolved benchmark root is outside required prefix: $physical_root" ;;
esac

if [ -n "${AIBENCH_DF_OUTPUT_FILE:-}" ]; then
  df_output=$(cat "$AIBENCH_DF_OUTPUT_FILE")
else
  df_output=$(df -Pk "$physical_root") || fail "cannot inspect mounted volume"
fi

mount_point=$(printf '%s\n' "$df_output" | awk 'NR == 2 { print $NF }')
available_kilobytes=$(printf '%s\n' "$df_output" | awk 'NR == 2 { print $4 }')
required_mount=${required_prefix%/}
[ "$mount_point" = "$required_mount" ] || fail "unexpected mount: $mount_point (expected $required_mount)"
case "$available_kilobytes" in
  ''|*[!0-9]*) fail "could not determine available space" ;;
esac
available_bytes=$((available_kilobytes * 1024))
[ "$available_bytes" -ge "$minimum_bytes" ] || fail "insufficient space: $available_bytes bytes available"

if [ -n "${AIBENCH_DISKUTIL_OUTPUT_FILE:-}" ]; then
  disk_info=$(cat "$AIBENCH_DISKUTIL_OUTPUT_FILE")
else
  command -v diskutil >/dev/null 2>&1 || fail "diskutil is unavailable"
  disk_info=$(diskutil info "$mount_point") || fail "cannot inspect volume metadata"
fi

field() {
  printf '%s\n' "$disk_info" | awk -F: -v label="$1" '
    index($1, label) {
      value = $2
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      print value
      exit
    }
  '
}

filesystem=$(field "File System Personality")
read_only=$(field "Read-Only Volume")
owners=$(field "Owners")
encrypted=$(field "Encrypted")
protocol=$(field "Protocol")

[ "$filesystem" = "APFS" ] || fail "unsupported filesystem: ${filesystem:-unknown}"
[ "$read_only" != "Yes" ] || fail "volume is read-only"

probe=$(mktemp "$physical_root/.aibench-write-probe.XXXXXX") || fail "volume is not writable"
rm -f "$probe"

docker_status=unavailable
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker_status=available
fi

printf 'storage_status=ok\n'
printf 'root=%s\n' "$physical_root"
printf 'mount=%s\n' "$mount_point"
printf 'filesystem=%s\n' "$filesystem"
printf 'available_bytes=%s\n' "$available_bytes"
printf 'owners=%s\n' "${owners:-unknown}"
printf 'encrypted=%s\n' "${encrypted:-unknown}"
printf 'protocol=%s\n' "${protocol:-unknown}"
printf 'docker=%s\n' "$docker_status"
