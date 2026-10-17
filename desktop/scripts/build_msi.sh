#!/usr/bin/env bash
# Build a Windows .msi with jpackage. Run from Git Bash.
#
# Unlike the .deb and .rpm, which repack a validated app image, there is no
# supported way to turn an existing app image into an .msi: jpackage builds the
# runtime itself. That runtime may omit runtime/bin/java.exe, so the app falls
# back to the ParensWorker launcher (see runtime.clj); the installed-package
# check in CI proves the worker starts from the installed copy.
#
# jpackage's MSI support needs the WiX Toolset (candle.exe/light.exe) on PATH.
# GitHub's windows runners ship WiX 3.x; desktop-ci.yml puts it on PATH and
# installs it via Chocolatey if it is missing.
#
#   target/msi/ParensPhase0-<version>.msi
#
# For the .exe installer see build_exe.sh; the shared setup lives in
# win_common.sh. Set REBUILD_JAR=0 to package an existing
# target/parens-desktop.jar (CI builds the jar once on Linux).
set -euo pipefail

# shellcheck source=scripts/win_common.sh
source "$(dirname "$0")/win_common.sh"

win_require_environment
win_prepare_input
win_jpackage msi target/msi
