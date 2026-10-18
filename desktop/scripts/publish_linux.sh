#!/usr/bin/env bash
# One publish step for the Linux packages: the packages, a SHA256SUMS file, and
# — when a signing key is configured — the signature over those checksums.
#
# Usage: publish_linux.sh FILE...
#
# Env (all optional):
#   LINUX_GPG_PRIVATE_KEY_BASE64  enables signing; see scripts/sign_linux.sh
#   LINUX_GPG_KEY_ID
#   LINUX_GPG_PASSPHRASE
#
# Signing is optional on purpose: pull-request CI and contributors publish
# checksums without keys, and desktop-release.yml supplies the secret when the
# repository has one. The output directory is target/dist.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -eq 0 ]; then
  echo "usage: publish_linux.sh FILE..." >&2
  exit 2
fi

bash scripts/checksums.sh "$@"

if [ -n "${LINUX_GPG_PRIVATE_KEY_BASE64:-}" ]; then
  bash scripts/sign_linux.sh target/dist
else
  echo
  echo "LINUX_GPG_PRIVATE_KEY_BASE64 is not set; publishing SHA256SUMS unsigned."
  echo "Verification without a key: sha256sum -c SHA256SUMS"
fi

echo
echo "Release directory: target/dist"
ls -l target/dist
