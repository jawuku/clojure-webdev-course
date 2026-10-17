#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/require_jdk.sh
exec java -XX:TieredStopAtLevel=1 -jar target/parens-desktop.jar "$@"
