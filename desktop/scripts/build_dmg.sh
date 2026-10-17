#!/usr/bin/env bash
# Package the macOS app image as a .dmg.
#
# jpackage cannot turn an existing app image into a .dmg, and its app-image
# output needs the bin/java fix and ad-hoc signature applied by
# scripts/build_appimage.sh. Instead of running `jpackage --type dmg` again
# (which would repeat those steps silently), this script packages the image
# that build_appimage.sh produced with hdiutil:
#
#   target/dmg/ParensPhase0-<version>-<arch>.dmg
#
# The volume holds ParensPhase0.app plus the usual /Applications symlink, so
# installation is the normal drag-to-Applications flow.
#
# Set SKIP_APPIMAGE=1 to reuse target/jpackage/ParensPhase0.app (CI builds and
# checks it first); otherwise the app image is rebuilt here.
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="${APP_NAME:-ParensPhase0}"
# jpackage rejects a macOS bundle version whose first component is zero, so the
# app image (and therefore the dmg) is 1.0.0 even though the jar is 0.1.0.
APP_VERSION="${APP_VERSION:-1.0.0}"
SKIP_APPIMAGE="${SKIP_APPIMAGE:-0}"

source scripts/require_jdk.sh

if [ "$(uname -s)" != Darwin ]; then
  echo "A .dmg can only be built on macOS; jpackage cannot cross-build." >&2
  exit 1
fi

if ! command -v hdiutil >/dev/null 2>&1 || ! command -v ditto >/dev/null 2>&1; then
  echo "hdiutil and ditto are required to build a .dmg." >&2
  exit 1
fi

if [ "$SKIP_APPIMAGE" != "1" ]; then
  APP_NAME="$APP_NAME" APP_VERSION="$APP_VERSION" bash scripts/build_appimage.sh
fi

APP_DIR="target/jpackage/$APP_NAME.app"
if [ ! -d "$APP_DIR" ]; then
  echo "$APP_DIR is missing; run scripts/build_appimage.sh first." >&2
  exit 1
fi

# Refuse to label the dmg differently from the bundle it contains.
BUNDLE_VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" \
  "$APP_DIR/Contents/Info.plist")
if [ "$BUNDLE_VERSION" != "$APP_VERSION" ]; then
  echo "APP_VERSION is $APP_VERSION but $APP_DIR is $BUNDLE_VERSION; rebuild the app image or unset APP_VERSION." >&2
  exit 1
fi
ARCH=$(uname -m)
DMG="target/dmg/${APP_NAME}-${APP_VERSION}-${ARCH}.dmg"

STAGE=$(mktemp -d "${TMPDIR:-/tmp}/parens-dmg.XXXXXX")
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

# ditto (rather than cp -R) keeps the bundle's symlinks, metadata, and
# extended attributes, which a signed .app depends on.
ditto "$APP_DIR" "$STAGE/$APP_NAME.app"
ln -s /Applications "$STAGE/Applications"

mkdir -p target/dmg
rm -f "$DMG"
hdiutil create -volname "$APP_NAME $APP_VERSION" -srcfolder "$STAGE" \
  -format UDZO -ov "$DMG" >/dev/null
hdiutil verify "$DMG" >/dev/null

echo
echo "DMG: $DMG"
du -sh "$DMG"
