#!/usr/bin/env bash
# The Linux GPG passphrase must never reach gpg's argument list.
#
# Runs the real scripts/sign_linux.sh against a fake `gpg` that records argv and
# reports whether the passphrase arrived on file descriptor 3, which is how the
# script is supposed to hand it over.
set -euo pipefail
cd "$(dirname "$0")/../.."
. test/signing/lib.sh

signing_init linux
FPR="0123456789ABCDEF0123456789ABCDEF01234567"
DIR="$WORK/dist"

# Test fixtures, not the script under test: the real hashing tool is used so
# sign_linux.sh's own re-hash step runs for real.
if command -v sha256sum >/dev/null 2>&1; then
  HASH="sha256sum"
else
  HASH="shasum -a 256"
fi
mkdir -p "$DIR"
printf 'fake package\n' > "$DIR/parens_0.1.0_amd64.deb"
(cd "$DIR" && $HASH parens_0.1.0_amd64.deb > SHA256SUMS)

signing_stub gpg <<EOF
#!/usr/bin/env bash
printf 'gpg argv: %s\n' "\$*" >> "$CALLS"
case " \$* " in
  *" --import "*)
    cat > /dev/null
    exit 0
    ;;
  *" --list-secret-keys "*)
    printf 'fpr:::::::::$FPR:\n'
    exit 0
    ;;
  *" --fingerprint "*)
    printf 'fpr:::::::::$FPR:\n'
    exit 0
    ;;
esac
# Signing call: the passphrase must arrive on fd 3, never in argv.
if { IFS= read -r pass <&3; } 2>/dev/null && [ -n "\$pass" ]; then
  printf 'gpg fd3-passphrase=yes\n' >> "$CALLS"
fi
out=""
prev=""
for a in "\$@"; do
  [ "\$prev" = "--output" ] && out="\$a"
  prev="\$a"
done
[ -n "\$out" ] || exit 0
printf '%s\n' '-----BEGIN PGP SIGNATURE-----' '' 'fake-signature' '-----END PGP SIGNATURE-----' > "\$out"
exit 0
EOF

echo "sign_linux.sh: GPG passphrase stays off the command line"
PATH="$BIN:$PATH" \
LINUX_GPG_PRIVATE_KEY_BASE64="$(signing_b64 fake-key)" \
LINUX_GPG_PASSPHRASE="$SECRET" \
  bash scripts/sign_linux.sh "$DIR" >/dev/null

signing_assert_no_secret "sign_linux.sh"

grep -qF -- '--passphrase-fd 3' "$CALLS" ||
  signing_fail "gpg was not told to read the passphrase from fd 3"

grep -qE -- '--passphrase( |$)' "$CALLS" &&
  signing_fail "gpg was given --passphrase on the command line"

grep -qF 'fd3-passphrase=yes' "$CALLS" ||
  signing_fail "the passphrase never reached gpg, so this proves nothing"

[ -f "$DIR/SHA256SUMS.asc" ] ||
  signing_fail "sign_linux.sh produced no signature"

# Negative case: a copy that puts the passphrase in argv must be caught.
sed 's|--pinentry-mode loopback --passphrase-fd 3|--pinentry-mode loopback --passphrase "$LINUX_GPG_PASSPHRASE"|' \
  scripts/sign_linux.sh > "$WORK/passes-secret.sh"
grep -qF -- '--passphrase "$LINUX_GPG_PASSPHRASE"' "$WORK/passes-secret.sh" ||
  signing_fail "could not build the negative case; the gpg call changed shape"

: > "$CALLS"
PATH="$BIN:$PATH" \
LINUX_GPG_PRIVATE_KEY_BASE64="$(signing_b64 fake-key)" \
LINUX_GPG_PASSPHRASE="$SECRET" \
  bash "$WORK/passes-secret.sh" "$DIR" >/dev/null 2>&1 || true
grep -qF -- "$SECRET" "$CALLS" ||
  signing_fail "the check missed a script that passes the passphrase in argv"
