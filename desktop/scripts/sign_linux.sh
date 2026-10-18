#!/usr/bin/env bash
# GPG-sign the Linux packages' SHA256SUMS file.
#
# Usage: sign_linux.sh [DIR]            (default: target/dist)
#
# Env:
#   LINUX_GPG_PRIVATE_KEY_BASE64  base64 of an ASCII-armored secret key (required)
#   LINUX_GPG_KEY_ID              key to sign with (default: the imported key)
#   LINUX_GPG_PASSPHRASE          passphrase for that key, if it has one
#
# The key is imported into a throwaway GNUPGHOME, so signing never touches the
# runner's or developer's keyring. The result is an armored detached signature,
# SHA256SUMS.asc, which is verified against the imported key before the script
# succeeds; the fingerprint is printed so the release notes can publish it.
set -euo pipefail
cd "$(dirname "$0")/.."

DIR="${1:-target/dist}"
SUMS="$DIR/SHA256SUMS"

if ! command -v gpg >/dev/null 2>&1; then
  echo "gpg is required (Ubuntu/Fedora: gnupg)." >&2
  exit 1
fi
if [ ! -f "$SUMS" ]; then
  echo "No $SUMS; run scripts/checksums.sh first." >&2
  exit 1
fi
: "${LINUX_GPG_PRIVATE_KEY_BASE64:?LINUX_GPG_PRIVATE_KEY_BASE64 is not set}"

# Re-hash before signing: a signature over stale checksums is worse than none.
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$DIR" && sha256sum -c SHA256SUMS >/dev/null)
else
  (cd "$DIR" && shasum -a 256 -c SHA256SUMS >/dev/null)
fi

# macOS base64 uses -D, GNU coreutils uses -d.
base64_decode() {
  if base64 -D </dev/null >/dev/null 2>&1; then
    base64 -D
  else
    base64 -d
  fi
}

GNUPGHOME="$(mktemp -d)"
export GNUPGHOME
chmod 0700 "$GNUPGHOME"
trap 'rm -rf "$GNUPGHOME"' EXIT

printf '%s' "$LINUX_GPG_PRIVATE_KEY_BASE64" | base64_decode | gpg --batch --import >/dev/null 2>&1

key="${LINUX_GPG_KEY_ID:-}"
if [ -z "$key" ]; then
  # The first secret key in the imported block; with one key that is the key.
  key=$(gpg --batch --with-colons --list-secret-keys \
    | awk -F: '/^fpr:/ {print $10; exit}')
fi
if [ -z "$key" ]; then
  echo "No secret key was imported from LINUX_GPG_PRIVATE_KEY_BASE64." >&2
  exit 1
fi

sign_args=(
  --batch --yes
  --armor --detach-sign
  --local-user "$key"
  --output "$SUMS.asc"
)
if [ -n "${LINUX_GPG_PASSPHRASE:-}" ]; then
  # The passphrase goes through a file descriptor, never argv, so it cannot be
  # read from the process list.
  sign_args+=(--pinentry-mode loopback --passphrase-fd 3)
  gpg "${sign_args[@]}" "$SUMS" 3<<<"$LINUX_GPG_PASSPHRASE"
else
  sign_args+=(--pinentry-mode loopback --passphrase "")
  gpg "${sign_args[@]}" "$SUMS"
fi

head -1 "$SUMS.asc" | grep -q '^-----BEGIN PGP SIGNATURE-----$' || {
  echo "$SUMS.asc is not an armored detached signature." >&2
  exit 1
}
gpg --batch --verify "$SUMS.asc" "$SUMS"

fingerprint=$(gpg --batch --with-colons --fingerprint "$key" \
  | awk -F: '/^fpr:/ {print $10; exit}')

echo
echo "Signed:      $SUMS.asc"
echo "Key:         ${fingerprint:-$key}"
