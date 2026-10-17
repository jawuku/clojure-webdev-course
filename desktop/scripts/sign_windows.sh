#!/usr/bin/env bash
# Sign Windows binaries and installers with signtool (Authenticode).
#
# Usage: sign_windows.sh FILE...
#
# Requires:
#   WINDOWS_CERT_PFX_BASE64  base64 of the code-signing .pfx
#   WINDOWS_CERT_PASSWORD    password for that .pfx
#
# Optional:
#   SIGNTOOL                 path to signtool.exe (otherwise found in PATH or
#                            the Windows 10/11 SDK)
#   WINDOWS_TIMESTAMP_URL    RFC 3161 timestamp service
#
# Each file is signed with SHA-256 and then verified with `signtool verify /pa`,
# which is the check a user's SmartScreen/installer sees.
set -euo pipefail
cd "$(dirname "$0")/.."

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) ;;
  *)
    echo "Authenticode signing can only run on Windows." >&2
    exit 1
    ;;
esac

if [ $# -eq 0 ]; then
  echo "usage: sign_windows.sh FILE..." >&2
  exit 2
fi

: "${WINDOWS_CERT_PFX_BASE64:?WINDOWS_CERT_PFX_BASE64 is not set}"
: "${WINDOWS_CERT_PASSWORD:?WINDOWS_CERT_PASSWORD is not set}"

TIMESTAMP_URL="${WINDOWS_TIMESTAMP_URL:-http://timestamp.digicert.com}"

if [ -z "${SIGNTOOL:-}" ]; then
  SIGNTOOL=$(command -v signtool.exe 2>/dev/null || true)
fi
if [ -z "${SIGNTOOL:-}" ]; then
  SIGNTOOL=$(find "/c/Program Files (x86)/Windows Kits/10/bin" \
    -name signtool.exe -path '*x64*' 2>/dev/null | sort -V | tail -1 || true)
fi
if [ -z "${SIGNTOOL:-}" ] || [ ! -f "$SIGNTOOL" ]; then
  echo "signtool.exe was not found; install the Windows SDK or set SIGNTOOL." >&2
  exit 1
fi

# macOS base64 uses -D, GNU coreutils (Git Bash) uses -d.
base64_decode() {
  if base64 -D </dev/null >/dev/null 2>&1; then
    base64 -D
  else
    base64 -d
  fi
}

PFX="${TMPDIR:-/tmp}/parens-signing-$$.pfx"
printf '%s' "$WINDOWS_CERT_PFX_BASE64" | base64_decode > "$PFX"
chmod 600 "$PFX"
trap 'rm -f "$PFX"' EXIT

for file in "$@"; do
  if [ ! -f "$file" ]; then
    echo "Not a file: $file" >&2
    exit 1
  fi
  echo "Signing $file"
  "$SIGNTOOL" sign \
    /fd SHA256 /td SHA256 /tr "$TIMESTAMP_URL" \
    /f "$PFX" /p "$WINDOWS_CERT_PASSWORD" "$file"
  "$SIGNTOOL" verify /pa /q "$file"
  echo "Verified $file"
done
