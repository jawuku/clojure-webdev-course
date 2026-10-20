#!/usr/bin/env bash
# Shared plumbing for the signing-argv tests, sourced by the case scripts.
#
# Each case builds a directory of stub tools whose only job is to append their
# argv to $CALLS, runs the real signing script with a known secret, and asserts
# that the secret appears in no argument list. The stubs also record *how* the
# secret did reach them (environment variable or file descriptor), so a case
# cannot pass by never passing the secret at all.

# signing_init PLATFORM -- sets WORK, BIN, CALLS and SECRET.
signing_init() {
  WORK=$(mktemp -d "${TMPDIR:-/tmp}/parens-signing-check.XXXXXX")
  trap 'rm -rf "$WORK"' EXIT
  BIN="$WORK/bin"
  CALLS="$WORK/calls.log"
  SECRET="signing-check-$$-$1-secret"
  mkdir -p "$BIN"
  : > "$CALLS"
}

# signing_stub NAME -- writes stdin to $BIN/NAME and makes it executable.
signing_stub() {
  cat > "$BIN/$1"
  chmod +x "$BIN/$1"
}

# signing_fail MESSAGE -- prints the message and every recorded child, then exits.
signing_fail() {
  echo "FAIL: $1" >&2
  if [ -f "$CALLS" ]; then
    echo "--- recorded child processes ---" >&2
    sed 's/^/  /' "$CALLS" >&2
  fi
  exit 1
}

# signing_assert_no_secret WHAT -- the whole point of these tests.
signing_assert_no_secret() {
  if grep -qF -- "$SECRET" "$CALLS"; then
    signing_fail "$1 put its secret on a command line"
  fi
}

# signing_b64 STRING -- single-line base64 that works with both GNU and BSD
# base64 (no -w flag).
signing_b64() {
  printf '%s' "$1" | base64 | tr -d '\n'
}

# signing_count_glob PATTERN -- how many matching temp files exist right now.
signing_count_glob() {
  find "${TMPDIR:-/tmp}" -maxdepth 1 -name "$1" 2>/dev/null | wc -l | tr -d ' '
}

# signing_assert_cleanup DID_NOT_LEAVE PATTERN BEFORE
signing_assert_cleanup() {
  if [ "$(signing_count_glob "$2")" -gt "$3" ]; then
    signing_fail "$1 left $2 behind"
  fi
}
