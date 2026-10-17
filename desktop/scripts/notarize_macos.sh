#!/usr/bin/env bash
# Notarize and staple a signed .app or .dmg with Apple's notary service.
#
# Usage: notarize_macos.sh PATH...
#
# Requires an App Store Connect API key (the credential Apple recommends for
# CI; an Apple ID app-specific password would also work but is not wired here):
#   APPLE_NOTARY_KEY_P8_BASE64  base64 of the AuthKey_<id>.p8 file
#   APPLE_NOTARY_KEY_ID         the key ID
#   APPLE_NOTARY_KEY_ISSUER     the App Store Connect issuer UUID
#
# notarytool accepts a .zip, .dmg or .pkg, so an .app is zipped for submission
# and the bundle itself is stapled. After stapling, `spctl` runs the same
# Gatekeeper assessment a user's Mac would.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$(uname -s)" != Darwin ]; then
  echo "Notarization can only run on macOS." >&2
  exit 1
fi

if [ $# -eq 0 ]; then
  echo "usage: notarize_macos.sh PATH... (.app or .dmg)" >&2
  exit 2
fi

for name in APPLE_NOTARY_KEY_P8_BASE64 APPLE_NOTARY_KEY_ID APPLE_NOTARY_KEY_ISSUER; do
  if [ -z "${!name:-}" ]; then
    echo "$name is not set." >&2
    exit 1
  fi
done

# macOS base64 uses -D, GNU coreutils uses -d.
base64_decode() {
  if base64 -D </dev/null >/dev/null 2>&1; then
    base64 -D
  else
    base64 -d
  fi
}

KEY_FILE="${TMPDIR:-/tmp}/AuthKey_${APPLE_NOTARY_KEY_ID}.p8"
printf '%s' "$APPLE_NOTARY_KEY_P8_BASE64" | base64_decode > "$KEY_FILE"
chmod 600 "$KEY_FILE"
trap 'rm -f "$KEY_FILE"' EXIT

# notarytool exits zero for rejected submissions in some versions, so the JSON
# status is authoritative. sed avoids depending on node/python on the runner.
json_status() {
  awk '/"status"/ {
    sub(/^.*"status"[[:space:]]*:[[:space:]]*"/, "")
    sub(/".*$/, "")
    print
    exit
  }'
}

submit() {
  local artifact="$1"
  local output status
  output=$(xcrun notarytool submit "$artifact" \
    --key "$KEY_FILE" \
    --key-id "$APPLE_NOTARY_KEY_ID" \
    --issuer "$APPLE_NOTARY_KEY_ISSUER" \
    --wait --output-format json)
  printf '%s\n' "$output"
  status=$(printf '%s' "$output" | json_status)
  if [ "$status" != "Accepted" ]; then
    echo "Notarization did not succeed (status: ${status:-unknown})." >&2
    exit 1
  fi
}

for target in "$@"; do
  case "$target" in
    *.app)
      ZIP="${TMPDIR:-/tmp}/$(basename "$target" .app)-notarize.zip"
      rm -f "$ZIP"
      ditto -c -k --keepParent "$target" "$ZIP"
      submit "$ZIP"
      rm -f "$ZIP"
      xcrun stapler staple "$target"
      xcrun stapler validate "$target"
      spctl --assess --type execute --verbose=2 "$target"
      ;;
    *.dmg)
      submit "$target"
      xcrun stapler staple "$target"
      xcrun stapler validate "$target"
      spctl --assess --type open --context context:primary-signature --verbose=2 "$target"
      ;;
    *)
      echo "Unsupported path: $target (expected .app or .dmg)" >&2
      exit 2
      ;;
  esac
done
