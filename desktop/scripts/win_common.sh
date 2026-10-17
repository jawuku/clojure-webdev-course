# shellcheck shell=bash
# Shared setup for the Windows installer scripts (build_msi.sh, build_exe.sh).
#
# Source it from a script that already uses `set -euo pipefail`. It changes the
# working directory to `desktop/`, validates the toolchain and the version, and
# provides the two steps both installer scripts run:
#
#   win_require_environment   checks Git Bash, JDK 25, jpackage, WiX, APP_VERSION
#   win_prepare_input         builds/reuses the uberjar in target/jpackage-input
#   win_jpackage TYPE DEST    runs jpackage for one installer type
#
# The scripts share target/jpackage-input, so do not run them concurrently.

WIN_APP_NAME="${APP_NAME:-ParensPhase0}"
# jpackage's Windows installer bundlers reject a version whose first component
# is zero, so 0.1.0 is not valid here.
WIN_APP_VERSION="${APP_VERSION:-1.0.0}"
WIN_REBUILD_JAR="${REBUILD_JAR:-1}"

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

win_require_environment() {
  source scripts/require_jdk.sh

  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*) ;;
    *)
      echo "Windows installers can only be built on Windows; jpackage cannot cross-build." >&2
      exit 1
      ;;
  esac

  if ! command -v jpackage >/dev/null 2>&1; then
    echo "jpackage is required; it ships with the JDK." >&2
    exit 1
  fi

  local jpackage_major
  jpackage_major=$(jpackage --version 2>/dev/null | head -1 | cut -d. -f1)
  if [ "$jpackage_major" != "$REQUIRED_JAVA_VERSION" ]; then
    echo "jpackage $REQUIRED_JAVA_VERSION is required (found ${jpackage_major:-unknown})." >&2
    exit 1
  fi

  if ! command -v candle.exe >/dev/null 2>&1 || ! command -v light.exe >/dev/null 2>&1; then
    echo "The WiX Toolset is required for .msi/.exe installers (candle.exe/light.exe not on PATH)." >&2
    exit 1
  fi

  case "$WIN_APP_VERSION" in
    [1-9]* | [1-9]*.*) : ;;
    *)
      echo "APP_VERSION must start with a non-zero number on Windows (got $WIN_APP_VERSION); try APP_VERSION=1.0.0." >&2
      exit 1
      ;;
  esac
}

win_prepare_input() {
  if [ "$WIN_REBUILD_JAR" = "1" ]; then
    lein uberjar
  fi
  if [ ! -f target/parens-desktop.jar ]; then
    echo "target/parens-desktop.jar is missing; run lein uberjar first." >&2
    exit 1
  fi

  rm -rf target/jpackage-input
  mkdir -p target/jpackage-input
  cp target/parens-desktop.jar target/jpackage-input/
}

win_jpackage() {
  local type="$1"
  local dest="$2"
  local pattern artifact

  case "$type" in
    msi) pattern='*.msi' ;;
    exe) pattern='*.exe' ;;
    *)
      echo "Unsupported Windows installer type: $type" >&2
      exit 1
      ;;
  esac

  rm -rf "$dest"
  mkdir -p "$dest"

  # --win-console keeps the launcher's PARENS_PORT/PARENS_TOKEN handshake on
  # stdout. Without it the launcher has no stdout at all, and the checker (and
  # scripts/run.sh) cannot discover the port and token.
  jpackage \
    --type "$type" \
    --name "$WIN_APP_NAME" \
    --app-version "$WIN_APP_VERSION" \
    --vendor "Parens" \
    --description "Parens Phase 0 vertical slice" \
    --input target/jpackage-input \
    --main-jar parens-desktop.jar \
    --main-class parens.main \
    --add-launcher "ParensWorker=packaging/worker.properties" \
    --dest "$dest" \
    --java-options "-XX:TieredStopAtLevel=1" \
    --java-options "-Xmx512m" \
    --win-console \
    --win-menu \
    --win-shortcut

  artifact=$(find "$dest" -maxdepth 1 -name "$pattern" -print -quit)
  if [ -z "$artifact" ] || [ ! -f "$artifact" ]; then
    echo "jpackage did not produce $pattern in $dest" >&2
    exit 1
  fi

  echo
  echo "Installer: $artifact"
  du -h "$artifact"
}
