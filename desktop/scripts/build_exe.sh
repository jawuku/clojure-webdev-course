#!/usr/bin/env bash
# Build a Windows .exe installer with jpackage. Run from Git Bash.
#
# jpackage's .exe is a small wrapper (msiwrapper.exe) with an .msi embedded in
# it: it extracts the MSI and forwards its own command line to
# `msiexec /i`, and a single `uninstall` argument uninstalls the product
# silently. That makes the installer scriptable:
#
#   ParensPhase0-1.0.0.exe /quiet /norestart   # install
#   ParensPhase0-1.0.0.exe uninstall           # uninstall
#
# Like build_msi.sh it builds the runtime again (jpackage has no way to turn an
# existing app image into an installer), and it needs the WiX Toolset
# (candle.exe/light.exe) on PATH. Build both installers with build_msi.sh and
# this script when you need both artifacts.
#
#   target/exe/ParensPhase0-<version>.exe
#
# Set REBUILD_JAR=0 to package an existing target/parens-desktop.jar (CI builds
# the jar once on Linux).
set -euo pipefail

# shellcheck source=scripts/win_common.sh
source "$(dirname "$0")/win_common.sh"

win_require_environment
win_prepare_input
win_jpackage exe target/exe
