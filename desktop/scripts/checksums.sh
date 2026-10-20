#!/usr/bin/env bash
# Collect release artifacts into one publishable directory and hash them.
#
# Usage: checksums.sh [--out DIR] FILE...
#
# The directory holds a copy of every artifact plus SHA256SUMS, so a user can
# download that directory's contents and run `sha256sum -c SHA256SUMS` with no
# other files (macOS: `shasum -a 256 -c SHA256SUMS`). The checksum file is
# verified against the copies before the script exits: a SHA256SUMS that does
# not match its own packages never ships.
#
# Runs on Linux, macOS (/bin/bash 3.2) and Git Bash on Windows; the Linux
# publisher, publish_linux.sh, adds an optional GPG signature on top.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=target/dist
if [ "${1:-}" = "--out" ]; then
  if [ $# -lt 2 ]; then
    echo "usage: checksums.sh [--out DIR] FILE..." >&2
    exit 2
  fi
  OUT="$2"
  shift 2
fi

if [ $# -eq 0 ]; then
  echo "usage: checksums.sh [--out DIR] FILE..." >&2
  exit 2
fi

# sha256sum is coreutils (Linux, and Git Bash on Windows); macOS has shasum.
if command -v sha256sum >/dev/null 2>&1; then
  SHA256=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  SHA256=(shasum -a 256)
else
  echo "sha256sum (or shasum) is required." >&2
  exit 1
fi

mkdir -p "$OUT"
OUT_ABS=$(cd "$OUT" && pwd -P)

names=()
for file in "$@"; do
  if [ ! -f "$file" ]; then
    echo "Not a file: $file" >&2
    exit 1
  fi
  name=$(basename "$file")
  if [ "${#names[@]}" -gt 0 ]; then
    for seen in "${names[@]}"; do
      if [ "$seen" = "$name" ]; then
        echo "Two artifacts share the name $name; publish them separately." >&2
        exit 1
      fi
    done
  fi
  names+=("$name")

  src=$(cd "$(dirname "$file")" && pwd -P)
  if [ "$src/$name" != "$OUT_ABS/$name" ]; then
    cp -f "$file" "$OUT/$name"
  fi
done

# Old sums and a signature over them are stale from here on. sign_linux.sh
# replaces the .asc when signing is enabled.
rm -f "$OUT/SHA256SUMS" "$OUT/SHA256SUMS.asc"

# Sort in the C locale so the file is identical regardless of the machine's
# locale. bash 3.2 (macOS /bin/bash) has no mapfile, so read the sorted names
# line by line instead.
sorted=()
while IFS= read -r name; do
  sorted+=("$name")
done < <(printf '%s\n' "${names[@]}" | LC_ALL=C sort)
names=("${sorted[@]}")

tmp=$(mktemp "$OUT/.SHA256SUMS.XXXXXX")
trap 'rm -f "$tmp"' EXIT
# mktemp creates 0600; the published file has to be readable.
chmod 0644 "$tmp"
for name in "${names[@]}"; do
  (cd "$OUT" && "${SHA256[@]}" "$name") >> "$tmp"
done
mv "$tmp" "$OUT/SHA256SUMS"
trap - EXIT

# Prove the file we are about to publish against the copies next to it. The
# names in SHA256SUMS are bare file names, so this must run from $OUT.
(cd "$OUT" && "${SHA256[@]}" -c SHA256SUMS >/dev/null)

listed() {
  local needle="$1" name
  for name in "${names[@]}"; do
    [ "$name" = "$needle" ] && return 0
  done
  return 1
}

# A package left behind by an earlier publish would ship without a checksum
# entry. Keep it (the directory belongs to the caller) but say so.
for extra in "$OUT"/*; do
  name=$(basename "$extra")
  case "$name" in
    SHA256SUMS | SHA256SUMS.asc) continue ;;
  esac
  if ! listed "$name"; then
    echo "Warning: $OUT/$name is not listed in SHA256SUMS (left from an earlier publish?)." >&2
  fi
done

echo "Checksums: $OUT/SHA256SUMS"
cat "$OUT/SHA256SUMS"
