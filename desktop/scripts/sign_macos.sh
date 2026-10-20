#!/usr/bin/env bash
# Sign macOS code with a Developer ID identity and the hardened runtime.
#
# Usage: sign_macos.sh PATH...   (.app bundle and/or .dmg)
#
# Requires:
#   APPLE_SIGNING_IDENTITY  "Developer ID Application: Name (TEAMID)"
#   APPLE_CERT_P12_BASE64   base64 of the Developer ID Application .p12
#   APPLE_CERT_PASSWORD     password for that .p12
#
# Optional:
#   CODESIGN_TIMESTAMP      --timestamp (default). Set it empty to skip Apple's
#                           timestamp service, which will not stamp a throwaway
#                           self-signed certificate; CI uses that to exercise
#                           the import path without an Apple account.
#
# The certificate is imported into a throwaway keychain so `codesign` finds the
# identity without prompts. Every Mach-O file inside a bundle is signed before
# the bundle itself: the three JVM launchers (app, worker, bundled bin/java)
# carry packaging/entitlements.plist; libraries are signed without it.
set -euo pipefail
cd "$(dirname "$0")/.."

ENTITLEMENTS="${ENTITLEMENTS:-packaging/entitlements.plist}"

# A hardened-runtime bundle and a plain file (the .dmg) need different flags;
# the timestamp is optional so a self-signed certificate can be tested.
CODESIGN_APP=(--force --options runtime)
CODESIGN_FILE=(--force)
if [ -n "${CODESIGN_TIMESTAMP---timestamp}" ]; then
  CODESIGN_APP+=(--timestamp)
  CODESIGN_FILE+=(--timestamp)
fi

if [ "$(uname -s)" != Darwin ]; then
  echo "Developer ID signing can only run on macOS." >&2
  exit 1
fi

: "${APPLE_SIGNING_IDENTITY:?APPLE_SIGNING_IDENTITY is not set}"

if [ $# -eq 0 ]; then
  echo "usage: sign_macos.sh PATH... (.app or .dmg)" >&2
  exit 2
fi

if [ ! -f "$ENTITLEMENTS" ]; then
  echo "Entitlements file not found: $ENTITLEMENTS" >&2
  exit 1
fi

# macOS base64 uses -D, GNU coreutils (Git Bash, Linux) uses -d.
base64_decode() {
  if base64 -D </dev/null >/dev/null 2>&1; then
    base64 -D
  else
    base64 -d
  fi
}

P12="${TMPDIR:-/tmp}/parens-signing-$$.p12"
PEM="${TMPDIR:-/tmp}/parens-signing-$$.pem"
KEYCHAIN="${PARENS_KEYCHAIN:-${TMPDIR:-/tmp}/parens-signing-$$.keychain-db}"
# od/tr are always present; this avoids depending on openssl.
KEYCHAIN_PASSWORD=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
# bash 3.2 (macOS /bin/bash) has no mapfile; keep the list in an array by
# reading it line by line.
ORIGINAL_KEYCHAINS=()
while IFS= read -r keychain; do
  ORIGINAL_KEYCHAINS+=("$keychain")
done < <(security list-keychains -d user | tr -d '"')
ORIGINAL_DEFAULT=$(security default-keychain -d user | tr -d '"')

cleanup() {
  if [ "${#ORIGINAL_KEYCHAINS[@]}" -gt 0 ]; then
    security list-keychains -d user -s "${ORIGINAL_KEYCHAINS[@]}" 2>/dev/null || true
  fi
  if [ -n "$ORIGINAL_DEFAULT" ]; then
    security default-keychain -d user -s "$ORIGINAL_DEFAULT" 2>/dev/null || true
  fi
  security delete-keychain "$KEYCHAIN" 2>/dev/null || true
  rm -f "$P12" "$PEM"
}
trap cleanup EXIT

: "${APPLE_CERT_P12_BASE64:?APPLE_CERT_P12_BASE64 is not set}"
: "${APPLE_CERT_PASSWORD:?APPLE_CERT_PASSWORD is not set}"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to unpack the .p12 (macOS ships LibreSSL)." >&2
  exit 1
fi

printf '%s' "$APPLE_CERT_P12_BASE64" | base64_decode > "$P12"
chmod 600 "$P12"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"

# `security import` can only take a .p12 passphrase as -P, i.e. on the command
# line, where every process on the machine can read it. Unpack the .p12 with
# openssl instead (it reads the passphrase from the environment) and import the
# resulting unencrypted PEM, which needs no passphrase at all. The PEM is 0600
# and deleted as soon as the key is in the keychain.
if ! openssl pkcs12 -in "$P12" -nodes -out "$PEM" \
  -passin env:APPLE_CERT_PASSWORD >/dev/null; then
  echo "Could not unpack the .p12; check APPLE_CERT_P12_BASE64 and" >&2
  echo "APPLE_CERT_PASSWORD." >&2
  exit 1
fi
if [ ! -s "$PEM" ]; then
  echo "openssl wrote an empty PEM for $P12." >&2
  exit 1
fi
chmod 600 "$PEM"
security import "$PEM" -k "$KEYCHAIN" -T /usr/bin/codesign
rm -f "$P12" "$PEM"
security set-key-partition-list \
  -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
if [ "${#ORIGINAL_KEYCHAINS[@]}" -gt 0 ]; then
  security list-keychains -d user -s "$KEYCHAIN" "${ORIGINAL_KEYCHAINS[@]}"
else
  security list-keychains -d user -s "$KEYCHAIN"
fi
security default-keychain -d user -s "$KEYCHAIN"

echo "Using identity: $APPLE_SIGNING_IDENTITY"

# Avoid `file | grep -q`: under `set -o pipefail`, grep's early exit can make
# file die with SIGPIPE and turn a real match into a failure.
is_macho() {
  case "$(file -b "$1" 2>/dev/null)" in
    *Mach-O*) return 0 ;;
  esac
  return 1
}

# Every launcher in Contents/MacOS (the app plus any --add-launcher ones, e.g.
# ParensWorker) and the bundled java binary host a JVM, so each needs the Java
# entitlements under the hardened runtime. bash's dynamic scoping lets this see
# APP_PATH set in sign_app.
APP_PATH=""
is_jvm_host() {
  case "$1" in
    "$APP_PATH/Contents/MacOS/"*) return 0 ;;
    "$APP_PATH/Contents/runtime/Contents/Home/bin/java") return 0 ;;
  esac
  return 1
}

sign_app() {
  local app="$1"
  local launcher
  APP_PATH="$app"

  echo "Signing nested code in $app"
  while IFS= read -r -d '' launcher; do
    if is_jvm_host "$launcher"; then
      continue
    fi
    if is_macho "$launcher"; then
      codesign "${CODESIGN_APP[@]}" --sign "$APPLE_SIGNING_IDENTITY" "$launcher"
    fi
  done < <(find "$app/Contents" -type f -print0)

  for launcher in "$app/Contents/MacOS"/* \
    "$app/Contents/runtime/Contents/Home/bin/java"; do
    if [ -f "$launcher" ] && is_macho "$launcher"; then
      codesign "${CODESIGN_APP[@]}" \
        --entitlements "$ENTITLEMENTS" --sign "$APPLE_SIGNING_IDENTITY" "$launcher"
    fi
  done

  codesign "${CODESIGN_APP[@]}" \
    --entitlements "$ENTITLEMENTS" --sign "$APPLE_SIGNING_IDENTITY" "$app"
  codesign --verify --deep --strict --verbose=2 "$app"
  codesign -dv --verbose=4 "$app" 2>&1 |
    grep -E '^(Authority|TeamIdentifier|Timestamp|Runtime Version|CodeDirectory)' || true
}

sign_dmg() {
  local dmg="$1"
  echo "Signing $dmg"
  codesign "${CODESIGN_FILE[@]}" --sign "$APPLE_SIGNING_IDENTITY" "$dmg"
  codesign --verify --verbose=2 "$dmg"
  codesign -dv --verbose=4 "$dmg" 2>&1 |
    grep -E '^(Authority|TeamIdentifier|Timestamp)' || true
}

for target in "$@"; do
  case "$target" in
    *.app) sign_app "$target" ;;
    *.dmg) sign_dmg "$target" ;;
    *)
      echo "Unsupported path: $target (expected .app or .dmg)" >&2
      exit 2
      ;;
  esac
done
