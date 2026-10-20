#!/usr/bin/env bash
# Create the Linux release signing key and the files that publish it.
#
# Usage:
#   generate_release_key.sh --name NAME --email EMAIL [--out DIR]
#                           [--expire DURATION] [--force]
#
# Writes, into DIR (default: target/release-key):
#   parens-release-key.asc           ASCII-armored public key
#   parens-release-key.fingerprint   the 40 hex-digit fingerprint
#   parens-release-key.secret.asc    ASCII-armored secret key (0600)
#   parens-release-key.b64           base64 of the secret key, one line (0600)
#   parens-release-key.rev.asc       revocation certificate, ready to import (0600)
#
# Env:
#   LINUX_GPG_PASSPHRASE  protects the key (and is the CI passphrase);
#                         unset means an unprotected key, which is what
#                         sign_linux.sh expects when no passphrase is set
#
# The key is created in a throwaway GNUPGHOME, so the caller's keyring is never
# touched, and the outputs are staged and only moved into place after the
# fingerprint, the public export and the base64 secret have all been checked.
# Existing files are never overwritten without --force.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=target/release-key
NAME=""
EMAIL=""
EXPIRE="2y"
FORCE=0

usage() {
  cat <<'EOF'
usage: generate_release_key.sh --name NAME --email EMAIL [--out DIR]
                               [--expire DURATION] [--force]

  --name NAME      key user ID name, e.g. "Parens releases"
  --email EMAIL    key user ID address, e.g. releases@example.com
  --out DIR        output directory (default: target/release-key)
  --expire DUR     GPG expiry, e.g. 1y, 2y, 0 for none (default: 2y)
  --force          replace existing files in DIR

LINUX_GPG_PASSPHRASE protects the key (and must match the CI secret);
unset creates an unprotected key.
EOF
}

die() {
  echo "$*" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --out)
      [ $# -ge 2 ] || die "--out needs a directory"
      OUT="$2"
      shift 2
      ;;
    --name)
      [ $# -ge 2 ] || die "--name needs a value"
      NAME="$2"
      shift 2
      ;;
    --email)
      [ $# -ge 2 ] || die "--email needs a value"
      EMAIL="$2"
      shift 2
      ;;
    --expire)
      [ $# -ge 2 ] || die "--expire needs a GPG duration (e.g. 1y, 2y, 0)"
      EXPIRE="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "unknown option: $1"
      ;;
  esac
done

[ -n "$NAME" ] || die "--name is required (e.g. --name \"Parens releases\")"
[ -n "$EMAIL" ] || die "--email is required (e.g. --email releases@example.com)"
case "$EMAIL" in
  *@*.*) ;;
  *) die "--email does not look like an address: $EMAIL" ;;
esac
case "$NAME" in
  *"<"* | *">"*) die "--name must not contain angle brackets" ;;
esac

command -v gpg >/dev/null 2>&1 || die "gpg is required (Ubuntu/Fedora: gnupg)."
command -v gpgconf >/dev/null 2>&1 || die "gpgconf is required (Ubuntu/Fedora: gnupg)."

mkdir -p "$OUT"
OUT_ABS=$(cd "$OUT" && pwd -P)

files=(
  parens-release-key.asc
  parens-release-key.fingerprint
  parens-release-key.secret.asc
  parens-release-key.b64
  parens-release-key.rev.asc
)
existing=()
for name in "${files[@]}"; do
  if [ -e "$OUT_ABS/$name" ]; then
    existing+=("$OUT_ABS/$name")
  fi
done
if [ "${#existing[@]}" -gt 0 ] && [ "$FORCE" != "1" ]; then
  echo "Refusing to overwrite existing release key files:" >&2
  printf '  %s\n' "${existing[@]}" >&2
  echo "Pass --force to replace them (the old secret will be gone)." >&2
  exit 1
fi

umask 077
# Explicit templates keep BSD mktemp (macOS) happy.
GNUPGHOME=$(mktemp -d "${TMPDIR:-/tmp}/parens-release-key.XXXXXX")
export GNUPGHOME
chmod 0700 "$GNUPGHOME"
STAGE=$(mktemp -d "$OUT_ABS/.release-key.XXXXXX")

cleanup() {
  # The agent outlives gpg unless it is stopped; kill it before removing HOME.
  gpgconf --kill all >/dev/null 2>&1 || true
  rm -rf "$GNUPGHOME" "$STAGE"
}
trap cleanup EXIT

PASSPHRASE="${LINUX_GPG_PASSPHRASE:-}"
IDENTITY="$NAME <$EMAIL>"

echo "Generating rsa4096 signing key for $IDENTITY (expires: $EXPIRE)"
# The passphrase goes through stdin, never argv, so it cannot be read from the
# process list. An empty passphrase creates an unprotected key.
if ! printf '%s' "$PASSPHRASE" | gpg --batch --pinentry-mode loopback \
  --passphrase-fd 0 \
  --quick-gen-key "$IDENTITY" rsa4096 sign "$EXPIRE" >/dev/null 2>"$STAGE/gpg.log"; then
  cat "$STAGE/gpg.log" >&2
  die "gpg could not create the key."
fi

FPR=$(gpg --batch --with-colons --list-secret-keys "$EMAIL" \
  | awk -F: '/^fpr:/ {print $10; exit}')
case "$FPR" in
  "" | *[!0-9A-F]*)
    die "Could not read a fingerprint for the new key."
    ;;
esac
if [ "${#FPR}" -ne 40 ]; then
  die "Unexpected fingerprint length ${#FPR}: $FPR"
fi

# The public export must describe the key we just made.
gpg --batch --armor --export "$FPR" > "$STAGE/parens-release-key.asc"
PUB_FPR=$(gpg --batch --with-colons --show-keys "$STAGE/parens-release-key.asc" \
  | awk -F: '/^fpr:/ {print $10; exit}')
[ "$PUB_FPR" = "$FPR" ] || die "Exported public key does not match $FPR."

# A protected key must be unlocked to export it; gpg asks the agent unless the
# passphrase is supplied, and this script must never fall back to a prompt.
if ! printf '%s' "$PASSPHRASE" | gpg --batch --pinentry-mode loopback \
  --passphrase-fd 0 --armor --export-secret-keys "$FPR" \
  > "$STAGE/parens-release-key.secret.asc"; then
  die "Could not export the secret key for $FPR."
fi

# macOS base64 uses -D, GNU coreutils uses -d; the file must be one line so it
# can be pasted or read into an environment variable unchanged.
base64_decode() {
  if base64 -D </dev/null >/dev/null 2>&1; then
    base64 -D
  else
    base64 -d
  fi
}
base64 < "$STAGE/parens-release-key.secret.asc" | tr -d '\n' > "$STAGE/parens-release-key.b64"

# GnuPG writes the certificate with explanatory prose and a colon-hidden block.
# Strip both so the file can be imported as-is when the key is retired.
REV="$GNUPGHOME/openpgp-revocs.d/$FPR.rev"
[ -f "$REV" ] || die "GnuPG did not write a revocation certificate at $REV."
sed -n '/BEGIN PGP PUBLIC KEY BLOCK/,$p' "$REV" | sed 's/^://' \
  > "$STAGE/parens-release-key.rev.asc"

printf '%s\n' "$FPR" > "$STAGE/parens-release-key.fingerprint"

# Import the published artifacts into an empty keyring: the public key must
# yield the fingerprint, and the base64 secret must decode and import to the
# same key, proving the CI secret is usable.
VERIFY_HOME=$(mktemp -d "${TMPDIR:-/tmp}/parens-release-verify.XXXXXX")
chmod 0700 "$VERIFY_HOME"
decoded=$(mktemp "${TMPDIR:-/tmp}/parens-release-secret.XXXXXX")
trap 'cleanup; rm -rf "$VERIFY_HOME" "$decoded"' EXIT

if ! GNUPGHOME="$VERIFY_HOME" gpg --batch --import \
  "$STAGE/parens-release-key.asc" >/dev/null 2>&1; then
  die "The exported public key does not import."
fi
imported_pub=$(GNUPGHOME="$VERIFY_HOME" gpg --batch --with-colons --list-keys \
  | awk -F: '/^fpr:/ {print $10; exit}')
[ "$imported_pub" = "$FPR" ] || die "Imported public key is $imported_pub, not $FPR."

base64_decode < "$STAGE/parens-release-key.b64" > "$decoded"
if ! GNUPGHOME="$VERIFY_HOME" gpg --batch --import "$decoded" >/dev/null 2>&1; then
  die "The base64 secret key does not decode and import."
fi
imported_sec=$(GNUPGHOME="$VERIFY_HOME" gpg --batch --with-colons --list-secret-keys \
  | awk -F: '/^fpr:/ {print $10; exit}')
[ "$imported_sec" = "$FPR" ] || die "Imported secret key is $imported_sec, not $FPR."

chmod 0644 "$STAGE/parens-release-key.asc" "$STAGE/parens-release-key.fingerprint"
chmod 0600 "$STAGE/parens-release-key.secret.asc" "$STAGE/parens-release-key.b64" \
  "$STAGE/parens-release-key.rev.asc"

for name in "${files[@]}"; do
  mv -f "$STAGE/$name" "$OUT_ABS/$name"
done

echo
echo "Fingerprint: $FPR"
gpg --batch --fingerprint "$FPR" | sed -n '2p' | sed 's/^ */  /'
echo
echo "Public key:  $OUT_ABS/parens-release-key.asc"
echo "Revocation:  $OUT_ABS/parens-release-key.rev.asc (keep offline)"
echo
echo "Next:"
echo "  gh secret set LINUX_GPG_PRIVATE_KEY_BASE64 < $OUT_ABS/parens-release-key.b64"
echo "  gh secret set LINUX_GPG_KEY_ID --body $FPR"
if [ -n "$PASSPHRASE" ]; then
  echo "  gh secret set LINUX_GPG_PASSPHRASE --body '…'   (the key is protected)"
else
  echo "  (the key has no passphrase; leave LINUX_GPG_PASSPHRASE unset)"
fi
echo "  attach the public key to the release and publish the fingerprint"
echo "  in the release notes and docs/RELEASE_CHECKLIST.md"
