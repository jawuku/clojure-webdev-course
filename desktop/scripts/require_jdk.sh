#!/usr/bin/env bash
# Shared toolchain pin for the Phase 0 slice. Source it from a script that
# already uses `set -euo pipefail`; a mismatch returns non-zero and stops the
# caller before anything is built or run.

REQUIRED_JAVA_VERSION=25

if ! command -v java >/dev/null 2>&1; then
  echo "JDK $REQUIRED_JAVA_VERSION LTS is required, but java is not on PATH." >&2
  return 1
fi

JAVA_SPEC=$(java -XshowSettings:properties -version 2>&1 \
  | awk -F'= ' '/java.specification.version/{print $2}' | head -1)

if [ "$JAVA_SPEC" != "$REQUIRED_JAVA_VERSION" ]; then
  echo "JDK $REQUIRED_JAVA_VERSION LTS is required (found ${JAVA_SPEC:-unknown})." >&2
  echo "Point JAVA_HOME/PATH at a JDK $REQUIRED_JAVA_VERSION install." >&2
  return 1
fi
