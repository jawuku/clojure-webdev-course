#!/usr/bin/env bash
# The Windows .pfx password must never reach signtool's argument list.
#
# Runs the real scripts/sign_windows.sh on any host: a fake `uname` answers
# MINGW64_NT so the platform guard passes, a fake `powershell.exe` reports the
# thumbprint, and a fake `signtool.exe` records argv instead of signing.
set -euo pipefail
cd "$(dirname "$0")/../.."
. test/signing/lib.sh

signing_init windows
THUMBPRINT="ABCDEF0123456789ABCDEF0123456789ABCDEF01"
INSTALLER="$WORK/Parens-1.0.0.msi"

signing_stub uname <<'EOF'
#!/usr/bin/env bash
echo MINGW64_NT-10.0
EOF

# Logs argv and whether the password arrived in its environment; the cleanup
# call removes the certificate and is recorded the same way.
signing_stub powershell.exe <<EOF
#!/usr/bin/env bash
printf 'powershell.exe env-secret=%s argv=%s\n' "\${WINDOWS_CERT_PASSWORD:+yes}" "\$*" >> "$CALLS"
case "\$*" in
  *Remove-Item*) exit 0 ;;
esac
echo "$THUMBPRINT"
EOF

signing_stub signtool.exe <<EOF
#!/usr/bin/env bash
printf 'signtool.exe %s\n' "\$*" >> "$CALLS"
exit 0
EOF

printf 'fake installer\n' > "$INSTALLER"
PFX_BEFORE=$(signing_count_glob 'parens-signing-*.pfx')

echo "sign_windows.sh: .pfx password stays off the command line"
PATH="$BIN:$PATH" \
WINDOWS_CERT_PFX_BASE64="$(signing_b64 fake-pfx)" \
WINDOWS_CERT_PASSWORD="$SECRET" \
  bash scripts/sign_windows.sh "$INSTALLER" >/dev/null

signing_assert_no_secret "sign_windows.sh"

grep -qE '^signtool\.exe sign .*/sha1 '"$THUMBPRINT" "$CALLS" ||
  signing_fail "signtool was not called with /sha1 <thumbprint>"

grep -E '^signtool\.exe ' "$CALLS" | grep -qE '(^| )/(p|f) ' &&
  signing_fail "signtool was called with /p or /f instead of a thumbprint"

grep -qF 'env-secret=yes' "$CALLS" ||
  signing_fail "the password never reached PowerShell, so this proves nothing"

grep -qF 'Remove-Item' "$CALLS" ||
  signing_fail "the imported certificate was not removed again"

signing_assert_cleanup "sign_windows.sh" 'parens-signing-*.pfx' "$PFX_BEFORE"

# Negative case: a copy that passes /p must be caught, so this test cannot pass
# by inspecting nothing.
sed 's|/sha1 "$THUMBPRINT" "$file"|/f "$PFX" /p "$WINDOWS_CERT_PASSWORD" "$file"|' \
  scripts/sign_windows.sh > "$WORK/passes-password.sh"
grep -qF '/p "$WINDOWS_CERT_PASSWORD"' "$WORK/passes-password.sh" ||
  signing_fail "could not build the negative case; the signtool call changed shape"

: > "$CALLS"
PATH="$BIN:$PATH" \
WINDOWS_CERT_PFX_BASE64="$(signing_b64 fake-pfx)" \
WINDOWS_CERT_PASSWORD="$SECRET" \
  bash "$WORK/passes-password.sh" "$INSTALLER" >/dev/null 2>&1 || true
grep -qF -- "$SECRET" "$CALLS" ||
  signing_fail "the check missed a script that passes the password"
