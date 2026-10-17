#!/usr/bin/env bash
# Check that the release-signing secrets are present.
#
# Signing is confined to .github/workflows/desktop-release.yml, which is
# triggered manually or by a desktop-v* tag. Pull-request CI never needs these
# values, so a missing secret fails only the release job, with the names of
# every missing variable.
#
#   bash scripts/require_release_secrets.sh macos
#   bash scripts/require_release_secrets.sh windows
set -euo pipefail

mode="${1:-}"

case "$mode" in
  macos)
    required=(
      APPLE_SIGNING_IDENTITY
      APPLE_CERT_P12_BASE64
      APPLE_CERT_PASSWORD
      APPLE_NOTARY_KEY_P8_BASE64
      APPLE_NOTARY_KEY_ID
      APPLE_NOTARY_KEY_ISSUER
    )
    ;;
  windows)
    required=(
      WINDOWS_CERT_PFX_BASE64
      WINDOWS_CERT_PASSWORD
    )
    ;;
  *)
    echo "usage: require_release_secrets.sh macos|windows" >&2
    exit 2
    ;;
esac

missing=()
for name in "${required[@]}"; do
  if [ -z "${!name:-}" ]; then
    missing+=("$name")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing release secret(s) for $mode:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  echo >&2
  echo "Signing runs only in .github/workflows/desktop-release.yml. Add the" >&2
  echo "secrets listed in desktop/README.md, or build unsigned artifacts with" >&2
  echo "desktop-ci.yml / the local scripts." >&2
  exit 1
fi

echo "Release secrets for $mode are present."
