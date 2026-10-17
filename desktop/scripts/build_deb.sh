#!/usr/bin/env bash
# Build a Debian/Ubuntu .deb from the app image.
#
# The app image is built first (and gets the bin/java fix), then installed under
# /opt/parens with a /usr/bin/parens wrapper, a desktop entry, an icon, and the
# license. This is deliberately not `jpackage --type deb`: jpackage's deb
# runtime has the same missing-bin/java problem, and repacking gives us one
# runtime layout to validate.
set -euo pipefail
cd "$(dirname "$0")/.."

PKG_NAME="${PKG_NAME:-parens}"
APP_VERSION="${APP_VERSION:-0.1.0}"
APP_IMAGE_NAME="${APP_IMAGE_NAME:-ParensPhase0}"
DEB_ARCH="${DEB_ARCH:-}"
DEB_MAINTAINER="${DEB_MAINTAINER:-Parens maintainers <noreply@example.com>}"

source scripts/require_jdk.sh

if ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "dpkg-deb is required (Ubuntu: sudo apt-get install -y dpkg)." >&2
  exit 1
fi

DEB_ARCH="${DEB_ARCH:-$(dpkg --print-architecture)}"

bash scripts/build_appimage.sh

APP_IMAGE="target/jpackage/$APP_IMAGE_NAME"
STAGE="target/deb/${PKG_NAME}_${APP_VERSION}_${DEB_ARCH}"
DEB="target/deb/${PKG_NAME}_${APP_VERSION}_${DEB_ARCH}.deb"

rm -rf "$STAGE" "$DEB"
mkdir -p "$STAGE/DEBIAN" \
         "$STAGE/opt/$PKG_NAME" \
         "$STAGE/usr/bin" \
         "$STAGE/usr/share/applications" \
         "$STAGE/usr/share/icons/hicolor/scalable/apps" \
         "$STAGE/usr/share/doc/$PKG_NAME"

cp -a "$APP_IMAGE/." "$STAGE/opt/$PKG_NAME/"

cat > "$STAGE/usr/bin/parens" <<EOF
#!/bin/sh
exec /opt/$PKG_NAME/bin/$APP_IMAGE_NAME "\$@"
EOF
chmod 0755 "$STAGE/usr/bin/parens"

install -m 0644 packaging/parens.desktop \
  "$STAGE/usr/share/applications/$PKG_NAME.desktop"
install -m 0644 packaging/parens.svg \
  "$STAGE/usr/share/icons/hicolor/scalable/apps/parens.svg"
install -m 0644 ../LICENSE "$STAGE/usr/share/doc/$PKG_NAME/copyright"

INSTALLED_SIZE=$(du -sk "$STAGE" | cut -f1)

cat > "$STAGE/DEBIAN/control" <<EOF
Package: $PKG_NAME
Version: $APP_VERSION
Architecture: $DEB_ARCH
Maintainer: $DEB_MAINTAINER
Installed-Size: $INSTALLED_SIZE
Depends: libc6 (>= 2.35), zlib1g
Recommends: libx11-6, libxext6, libxrender1, libxi6, libxtst6, xdg-utils
Section: education
Priority: optional
Homepage: https://github.com/jawuku/clojure-webdev-course
Description: Learn Clojure with a local JVM
 Parens serves its course UI on loopback and evaluates code in a separate,
 killable JVM. This Phase 0 slice includes the Clojure course runtime.
EOF

dpkg-deb --build --root-owner-group "$STAGE" "$DEB"

echo
echo "Package:  $DEB"
echo "Size:     $(du -h "$DEB" | cut -f1)"
echo "Install:  sudo apt install ./$DEB"
