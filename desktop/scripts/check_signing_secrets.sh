#!/usr/bin/env bash
# Fail if a signing script puts a secret on a command line.
#
# Usage: check_signing_secrets.sh [PLATFORM...]     (default: linux macos windows)
#
# A secret in argv is readable by every process on the machine, so no script
# hands one to a tool that way: Linux uses a file descriptor for the GPG
# passphrase, macOS reads the .p12 passphrase from the environment via openssl,
# and Windows imports the .pfx so signtool signs by thumbprint.
#
# Each case under test/signing/ runs the real script against fake tools that
# record argv, asserts the secret appears nowhere in it, and then runs a copy of
# the script that does leak -- so a case cannot pass by inspecting nothing.
# Fakes mean no certificate, macOS host, Windows host or network is needed, and
# they run on every pull request.
set -euo pipefail
cd "$(dirname "$0")/.."

platforms=("$@")
if [ "${#platforms[@]}" -eq 0 ]; then
  platforms=(linux macos windows)
fi

for platform in "${platforms[@]}"; do
  case "$platform" in
    linux | macos | windows) ;;
    *)
      echo "Unknown platform: $platform (expected linux, macos or windows)" >&2
      exit 2
      ;;
  esac
  if ! bash "test/signing/$platform.sh"; then
    echo "FAIL: $platform signing leaks a secret on a command line" >&2
    exit 1
  fi
done

echo "OK: signing scripts keep their secrets out of every command line"
