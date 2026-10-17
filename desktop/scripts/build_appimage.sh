#!/usr/bin/env bash
# Build a self-contained app image for the host OS.
#
# jpackage cannot cross-build, so this runs on Linux, macOS, and Windows (Git
# Bash). Each platform gets the same uberjar and launcher options, but the
# generated layout differs:
#
#   Linux    target/jpackage/ParensPhase0/bin/ParensPhase0
#   macOS    target/jpackage/ParensPhase0.app/Contents/MacOS/ParensPhase0
#   Windows  target/jpackage/ParensPhase0/ParensPhase0.exe
#
# Set REBUILD_JAR=0 to package an existing target/parens-desktop.jar (CI builds
# the jar once on Linux and reuses it for the Windows image).
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="${APP_NAME:-ParensPhase0}"
APP_VERSION="${APP_VERSION:-0.1.0}"
REBUILD_JAR="${REBUILD_JAR:-1}"

source scripts/require_jdk.sh

case "$(uname -s)" in
  Linux) PLATFORM=linux ;;
  Darwin) PLATFORM=mac ;;
  MINGW* | MSYS* | CYGWIN*) PLATFORM=windows ;;
  *)
    echo "Unsupported platform: $(uname -s)" >&2
    exit 1
    ;;
esac

if ! command -v jpackage >/dev/null 2>&1; then
  echo "jpackage is required; it ships with the JDK." >&2
  exit 1
fi

JPACKAGE_MAJOR=$(jpackage --version 2>/dev/null | head -1 | cut -d. -f1)
if [ "$JPACKAGE_MAJOR" != "$REQUIRED_JAVA_VERSION" ]; then
  echo "jpackage $REQUIRED_JAVA_VERSION is required (found ${JPACKAGE_MAJOR:-unknown})." >&2
  exit 1
fi

if [ "$PLATFORM" = linux ] && ! command -v objcopy >/dev/null 2>&1; then
  echo "jpackage needs binutils (objcopy) on Linux. On NixOS: nix shell nixpkgs#binutils" >&2
  exit 1
fi

# jpackage's macOS bundler (and Windows installer versions) require the first
# component of the app version to be non-zero; 0.1.0 is not a valid bundle
# version on those platforms.
if [ "$PLATFORM" != linux ]; then
  case "$APP_VERSION" in
    [1-9]* | [1-9]*.*) : ;;
    *)
      echo "APP_VERSION must start with a non-zero number on $PLATFORM (got $APP_VERSION); try APP_VERSION=1.0.0." >&2
      exit 1
      ;;
  esac
fi

if [ "$REBUILD_JAR" = "1" ]; then
  lein uberjar
fi
if [ ! -f target/parens-desktop.jar ]; then
  echo "target/parens-desktop.jar is missing; run lein uberjar first." >&2
  exit 1
fi

rm -rf target/jpackage-input target/jpackage
mkdir -p target/jpackage-input
cp target/parens-desktop.jar target/jpackage-input/

JPACKAGE_ARGS=(
  --type app-image
  --name "$APP_NAME"
  --app-version "$APP_VERSION"
  --vendor "Parens"
  --description "Parens Phase 0 vertical slice"
  --input target/jpackage-input
  --main-jar parens-desktop.jar
  --main-class parens.main
  --add-launcher "ParensWorker=packaging/worker.properties"
  --dest target/jpackage
  --java-options "-XX:TieredStopAtLevel=1"
  --java-options "-Xmx512m"
)

if [ "$PLATFORM" = windows ]; then
  # Without a console the launcher has no stdout at all, and the launcher's
  # PARENS_PORT/PARENS_TOKEN handshake (used by scripts/run.sh and the checker)
  # relies on it.
  JPACKAGE_ARGS+=(--win-console)
fi

jpackage "${JPACKAGE_ARGS[@]}"

case "$PLATFORM" in
  linux)
    APP_DIR="target/jpackage/$APP_NAME"
    RUNTIME_DIR="$APP_DIR/lib/runtime"
    JAVA_BIN="$RUNTIME_DIR/bin/java"
    LAUNCHER="$APP_DIR/bin/$APP_NAME"
    ;;
  mac)
    APP_DIR="target/jpackage/$APP_NAME.app"
    RUNTIME_DIR="$APP_DIR/Contents/runtime/Contents/Home"
    JAVA_BIN="$RUNTIME_DIR/bin/java"
    LAUNCHER="$APP_DIR/Contents/MacOS/$APP_NAME"
    ;;
  windows)
    APP_DIR="target/jpackage/$APP_NAME"
    RUNTIME_DIR="$APP_DIR/runtime"
    JAVA_BIN="$RUNTIME_DIR/bin/java.exe"
    LAUNCHER="$APP_DIR/$APP_NAME.exe"
    ;;
esac

if [ ! -d "$APP_DIR" ]; then
  echo "jpackage did not produce $APP_DIR" >&2
  exit 1
fi

# jpackage may build the runtime with --strip-native-commands, leaving no
# java binary. The app needs one to launch the child evaluator JVM. Put the
# build JDK's launcher into the runtime; it resolves the bundled libraries
# relative to its own location.
if [ ! -x "$JAVA_BIN" ]; then
  BUILD_JAVA_HOME=$(java -XshowSettings:properties -version 2>&1 \
    | awk -F'= ' '/java.home/{print $2}' | head -1)
  mkdir -p "$(dirname "$JAVA_BIN")"
  cp "$BUILD_JAVA_HOME/bin/$(basename "$JAVA_BIN")" "$JAVA_BIN"
  chmod +x "$JAVA_BIN"
  echo "Added runtime $(basename "$JAVA_BIN") from $BUILD_JAVA_HOME"
fi

# NixOS has no /lib/libz.so.1, and jpackage does not bundle zlib. If the
# generated runtime cannot resolve it, copy zlib in so the app image is
# runnable on this machine (normal Linux distributions already provide it).
if [ "$PLATFORM" = linux ] &&
  ldd "$APP_DIR/lib/runtime/lib/libjli.so" 2>/dev/null | grep -q 'libz.so.1 => not found'; then
  ZLIB=$(ls /nix/store/*zlib-*/lib/libz.so.1 2>/dev/null | head -1 || true)
  if [ -n "$ZLIB" ]; then
    cp "$ZLIB" "$APP_DIR/lib/runtime/lib/libz.so.1"
    echo "Bundled zlib: $ZLIB"
  else
    echo "Warning: libz.so.1 is missing from the runtime and no Nix zlib was found." >&2
  fi
fi

# Apple silicon refuses to execute unsigned code. jpackage does not sign the
# app image it builds, so ad-hoc sign it here; the signing identity can be
# replaced later for notarized releases.
if [ "$PLATFORM" = mac ] && command -v codesign >/dev/null 2>&1; then
  codesign --force --deep --sign - "$APP_DIR"
  echo "Ad-hoc signed: $APP_DIR"
fi

echo
echo "App image: $APP_DIR"
du -sh "$APP_DIR"
echo "Launcher:  $LAUNCHER"
