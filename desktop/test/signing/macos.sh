#!/usr/bin/env bash
# The macOS .p12 password must never reach a command line.
#
# Runs the real scripts/sign_macos.sh on any host: fake `uname` answers Darwin,
# fake `security`, `codesign`, `openssl` and `file` record argv, and the `.p12`
# never really exists. The point is that `security import` is not given -P and
# that openssl reads the passphrase from the environment instead.
set -euo pipefail
cd "$(dirname "$0")/../.."
. test/signing/lib.sh

signing_init macos
APP="$WORK/Parens.app"
mkdir -p "$APP/Contents/MacOS"
printf 'fake launcher\n' > "$APP/Contents/MacOS/ParensPhase0"
printf 'fake library\n' > "$APP/Contents/lib.dylib"

signing_stub uname <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  -s | "") echo Darwin ;;
  *) echo arm64 ;;
esac
EOF

signing_stub security <<EOF
#!/usr/bin/env bash
printf 'security %s\n' "\$*" >> "$CALLS"
case "\$*" in
  *" -s "*) exit 0 ;;
  *list-keychains* | *default-keychain*)
    printf '    "/Users/test/Library/Keychains/login.keychain-db"\n'
    ;;
esac
exit 0
EOF

signing_stub codesign <<EOF
#!/usr/bin/env bash
printf 'codesign %s\n' "\$*" >> "$CALLS"
case "\$*" in
  *" -dv "*) printf 'Authority=Developer ID Application: Parens (TEST)\n' ;;
esac
exit 0
EOF

signing_stub openssl <<EOF
#!/usr/bin/env bash
printf 'openssl %s\n' "\$*" >> "$CALLS"
out=""
prev=""
for a in "\$@"; do
  [ "\$prev" = "-out" ] && out="\$a"
  prev="\$a"
done
[ -n "\$out" ] || exit 0
printf '%s\n' '-----BEGIN PRIVATE KEY-----' 'fake-key-material' '-----END PRIVATE KEY-----' > "\$out"
exit 0
EOF

signing_stub file <<'EOF'
#!/usr/bin/env bash
echo 'Mach-O 64-bit executable arm64'
EOF

PEM_BEFORE=$(signing_count_glob 'parens-signing-*.pem')

echo "sign_macos.sh: .p12 password stays off the command line"
PATH="$BIN:$PATH" \
APPLE_SIGNING_IDENTITY="Developer ID Application: Parens (TEST)" \
APPLE_CERT_P12_BASE64="$(signing_b64 fake-p12)" \
APPLE_CERT_PASSWORD="$SECRET" \
  bash scripts/sign_macos.sh "$APP" >/dev/null

signing_assert_no_secret "sign_macos.sh"

grep -E '^security import ' "$CALLS" | grep -qE '(^| )-P ' &&
  signing_fail "security import was given -P, the .p12 passphrase"

grep -qF -- '-passin env:APPLE_CERT_PASSWORD' "$CALLS" ||
  signing_fail "openssl was not given the passphrase through the environment"

signing_assert_cleanup "sign_macos.sh" 'parens-signing-*.pem' "$PEM_BEFORE"

grep -qF 'security delete-keychain' "$CALLS" ||
  signing_fail "the throwaway keychain was not deleted"

grep -qE '^codesign .*--sign ' "$CALLS" ||
  signing_fail "no code was signed"

grep -E '^codesign .*--sign ' "$CALLS" | grep -qF -- '--timestamp' ||
  signing_fail "the default run did not request a timestamp"

# CODESIGN_TIMESTAMP= is what lets CI sign with a self-signed certificate.
echo "sign_macos.sh: CODESIGN_TIMESTAMP= omits the timestamp"
: > "$CALLS"
PATH="$BIN:$PATH" \
APPLE_SIGNING_IDENTITY="Developer ID Application: Parens (TEST)" \
APPLE_CERT_P12_BASE64="$(signing_b64 fake-p12)" \
APPLE_CERT_PASSWORD="$SECRET" \
CODESIGN_TIMESTAMP= \
  bash scripts/sign_macos.sh "$APP" >/dev/null

grep -qF -- '--timestamp' "$CALLS" &&
  signing_fail "CODESIGN_TIMESTAMP= still asked for a timestamp"

signing_assert_no_secret "sign_macos.sh with CODESIGN_TIMESTAMP="

# Negative case: a copy that passes -P must be caught. The copy lives in a small
# tree that mirrors the real layout, because the script resolves its entitlements
# file relative to itself.
mkdir -p "$WORK/tree/scripts" "$WORK/tree/packaging"
cp packaging/entitlements.plist "$WORK/tree/packaging/"
sed 's|security import "$PEM" -k "$KEYCHAIN" -T /usr/bin/codesign|security import "$PEM" -k "$KEYCHAIN" -P "$APPLE_CERT_PASSWORD" -T /usr/bin/codesign|' \
  scripts/sign_macos.sh > "$WORK/tree/scripts/passes-secret.sh"
grep -qF -- '-P "$APPLE_CERT_PASSWORD"' "$WORK/tree/scripts/passes-secret.sh" ||
  signing_fail "could not build the negative case; the security import call changed shape"

: > "$CALLS"
PATH="$BIN:$PATH" \
APPLE_SIGNING_IDENTITY="Developer ID Application: Parens (TEST)" \
APPLE_CERT_P12_BASE64="$(signing_b64 fake-p12)" \
APPLE_CERT_PASSWORD="$SECRET" \
  bash "$WORK/tree/scripts/passes-secret.sh" "$APP" >/dev/null 2>&1 || true
grep -qF -- "$SECRET" "$CALLS" ||
  signing_fail "the check missed a script that passes the .p12 password"
