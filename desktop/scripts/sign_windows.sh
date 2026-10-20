#!/usr/bin/env bash
# Sign Windows binaries and installers with signtool (Authenticode).
#
# Usage: sign_windows.sh FILE...
#
# Requires:
#   WINDOWS_CERT_PFX_BASE64  base64 of the code-signing .pfx
#   WINDOWS_CERT_PASSWORD    password for that .pfx; PowerShell reads it from
#                            the environment, so it never reaches a command line
#
# Optional:
#   SIGNTOOL                 path to signtool.exe (otherwise found in PATH or
#                            the Windows 10/11 SDK)
#   WINDOWS_TIMESTAMP_URL    RFC 3161 timestamp service
#
# The .pfx is imported into the current user's certificate store for the run and
# removed again on exit; signtool then signs by thumbprint. signtool has no way
# to read the password from a file or stdin, and `/p` would expose it to every
# process on the machine, so this script never passes it on the command line.
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
THUMBPRINT=""

cleanup() {
  rm -f "$PFX"
  if [ -n "$THUMBPRINT" ]; then
    # Drop the imported certificate and its private key again; the runner is
    # ephemeral, but a developer's machine is not.
    powershell.exe -NoProfile -NonInteractive -Command \
      "Get-ChildItem -Path 'Cert:\\CurrentUser\\My\\${THUMBPRINT}' | Remove-Item -Force" \
      >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

printf '%s' "$WINDOWS_CERT_PFX_BASE64" | base64_decode > "$PFX"
chmod 600 "$PFX"

# Import-PfxCertificate needs a Windows path and reads the password from the
# environment, so neither the .pfx path nor the password appears in argv.
if command -v cygpath >/dev/null 2>&1; then
  PFX_PATH=$(cygpath -w "$PFX")
else
  PFX_PATH="$PFX"
fi
export PFX_PATH WINDOWS_CERT_PASSWORD

if ! THUMBPRINT=$(powershell.exe -NoProfile -NonInteractive -Command '
  $ErrorActionPreference = "Stop"
  $secure = ConvertTo-SecureString -String $env:WINDOWS_CERT_PASSWORD -AsPlainText -Force
  $certs = Import-PfxCertificate -FilePath $env:PFX_PATH -CertStoreLocation Cert:\CurrentUser\My -Password $secure
  $signing = $certs | Where-Object { $_.HasPrivateKey } | Select-Object -First 1
  if (-not $signing) { throw "The .pfx holds no certificate with a private key." }
  $signing.Thumbprint
' | tr -d '\r' | tail -1); then
  echo "Could not import the code-signing certificate; check" >&2
  echo "WINDOWS_CERT_PFX_BASE64 and WINDOWS_CERT_PASSWORD." >&2
  exit 1
fi
if [ -z "$THUMBPRINT" ]; then
  echo "The imported certificate has no thumbprint." >&2
  exit 1
fi
echo "Using certificate $THUMBPRINT"

for file in "$@"; do
  if [ ! -f "$file" ]; then
    echo "Not a file: $file" >&2
    exit 1
  fi
  echo "Signing $file"
  "$SIGNTOOL" sign \
    /fd SHA256 /td SHA256 /tr "$TIMESTAMP_URL" \
    /sha1 "$THUMBPRINT" "$file"
  "$SIGNTOOL" verify /pa /q "$file"
  echo "Verified $file"
done
