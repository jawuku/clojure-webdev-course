#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="${APP_NAME:-ParensPhase0}"
APP_VERSION="${APP_VERSION:-0.1.0}"

source scripts/require_jdk.sh

if ! command -v jpackage >/dev/null 2>&1; then
  echo "jpackage is required; it ships with the JDK." >&2
  exit 1
fi

JPACKAGE_MAJOR=$(jpackage --version 2>/dev/null | head -1 | cut -d. -f1)
if [ "$JPACKAGE_MAJOR" != "$REQUIRED_JAVA_VERSION" ]; then
  echo "jpackage $REQUIRED_JAVA_VERSION is required (found ${JPACKAGE_MAJOR:-unknown})." >&2
  exit 1
fi

if ! command -v objcopy >/dev/null 2>&1; then
  echo "jpackage needs binutils (objcopy) on Linux. On NixOS: nix shell nixpkgs#binutils" >&2
  exit 1
fi

lein uberjar

rm -rf target/jpackage-input target/jpackage
mkdir -p target/jpackage-input
cp target/parens-desktop.jar target/jpackage-input/

jpackage \
  --type app-image \
  --name "$APP_NAME" \
  --app-version "$APP_VERSION" \
  --vendor "Parens" \
  --description "Parens Phase 0 vertical slice" \
  --input target/jpackage-input \
  --main-jar parens-desktop.jar \
  --main-class parens.main \
  --add-launcher "ParensWorker=packaging/worker.properties" \
  --dest target/jpackage \
  --java-options "-XX:TieredStopAtLevel=1" \
  --java-options "-Xmx512m"

APP_DIR="target/jpackage/$APP_NAME"

# jpackage may build the runtime with --strip-native-commands, leaving no
# bin/java. The app needs one to launch the child evaluator JVM. Put the build
# JDK's launcher into the runtime; it uses the bundled libs via $ORIGIN.
if [ ! -x "$APP_DIR/lib/runtime/bin/java" ]; then
  BUILD_JAVA_HOME=$(java -XshowSettings:properties -version 2>&1 \
    | awk -F'= ' '/java.home/{print $2}' | head -1)
  mkdir -p "$APP_DIR/lib/runtime/bin"
  cp "$BUILD_JAVA_HOME/bin/java" "$APP_DIR/lib/runtime/bin/java"
  chmod +x "$APP_DIR/lib/runtime/bin/java"
  echo "Added runtime bin/java from $BUILD_JAVA_HOME"
fi

# NixOS has no /lib/libz.so.1, and jpackage does not bundle zlib. If the
# generated runtime cannot resolve it, copy zlib in so the app image is
# runnable on this machine (normal Linux distributions already provide it).
if ldd "$APP_DIR/lib/runtime/lib/libjli.so" 2>/dev/null | grep -q 'libz.so.1 => not found'; then
  ZLIB=$(ls /nix/store/*zlib-*/lib/libz.so.1 2>/dev/null | head -1 || true)
  if [ -n "$ZLIB" ]; then
    cp "$ZLIB" "$APP_DIR/lib/runtime/lib/libz.so.1"
    echo "Bundled zlib: $ZLIB"
  else
    echo "Warning: libz.so.1 is missing from the runtime and no Nix zlib was found." >&2
  fi
fi

echo
echo "App image: $APP_DIR"
du -sh "$APP_DIR"
echo "Launcher:  $APP_DIR/bin/$APP_NAME"
