# Parens desktop runtime — Phase 0 slice

This is the disposable vertical slice from Phase 0 of
[`docs/JVM_DESKTOP_MIGRATION_PLAN.md`](../docs/JVM_DESKTOP_MIGRATION_PLAN.md).
It proves the architecture before the course UI is migrated:

- A JVM app process serving a UI on `127.0.0.1` from a random port.
- A token-protected HTTP API (`eval`, `exercise`, `runtime`, `reset`).
- A separate child JVM that evaluates real Clojure, killed and restarted on timeout.
- A Linux `jpackage` app-image with no first-run downloads.

It is **not** the final app. The page under `resources/public` is a small harness,
not the course UI.

## Run

JDK 25 LTS is required. `project.clj` and the scripts fail with a clear error on
any other Java version.

```bash
lein uberjar
./scripts/run.sh                 # opens the browser
./scripts/run.sh --no-open       # prints the URL and token, for scripts/CI
```

The launcher prints:

```
PARENS_URL=http://127.0.0.1:<port>/#token=<token>
PARENS_PORT=<port>
PARENS_TOKEN=<token>
```

The token is random per launch and lives in the URL fragment, so it is not sent
to the server in a request line or a referrer. Browser code sends it as
`X-Parens-Token`.

Options: `--port N`, `--token T` (tests only), `--timeout-ms N`, `--no-open`.

## API

All `/api/*` routes except `/api/health` require `X-Parens-Token`.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/health` | — | `{ok, status, server-pid}` |
| GET | `/api/runtime` | — | `{ok, pid, clojure, java, timeout-ms, server-pid}` |
| POST | `/api/eval` | `{code, ns?}` | `{ok, value, output, error, ms}` or `{ok:false, timeout:true}` |
| POST | `/api/exercise` | `{code, tests:[string]}` | `{ok, passed, results:[{test,ok,detail}], runError, output, ms}` |
| POST | `/api/reset` | — | restarts the worker |

`value` is `pr-str` of the last form. `output` captures `println`/`prn` and stderr.
Exercise code runs in a fresh `exerciseN` namespace with `answer` bound to the
last value, matching the current app's `runExerciseTests` semantics.

## Security model

- Loopback bind only (`127.0.0.1`), random port, random 32-byte token.
- `Host` must be `127.0.0.1`/`localhost` (blocks DNS rebinding).
- `Origin`, when present, must be the local app origin; no CORS headers.
- `Sec-Fetch-Site`, when present, must be `same-origin` or `none`.
- Strict CSP on the static page; no inline scripts or styles.
- Body size limit and code length limit.

The evaluator is **not a sandbox**. Learner code is trusted local code: it can
read files and open sockets. The child process protects the app from hangs and
`System/exit`, not from a determined user.

## Worker lifecycle

- One warm child JVM per app, EDN over stdin/stdout, serialized requests.
- 2 s timeout by default. On timeout the parent calls `destroyForcibly`, starts a
  new worker, and returns `{ok:false, timeout:true}`. Namespace state is lost.
- `System/exit` closes the child; the parent sees EOF and restarts on the next
  request.
- Requests after a timeout/crash are slower by one worker boot (~1 s here).
- The child is launched with the current classpath made absolute, from a temp
  working directory.

In a `jpackage` app image the runtime may be built with
`--strip-native-commands`, so there is no `lib/runtime/bin/java`. The build
script copies the build JDK's launcher into the image; `ParensWorker` (an
additional `jpackage` launcher) is kept as a fallback.

## Verify

```bash
lein test                       # token/Host/Origin + worker recovery
lein uberjar
node scripts/phase0_check.mjs --json benchmarks/results.json
```

`lein test` covers the security boundary at the handler level (`test/parens/api_test.clj`)
and the worker lifecycle against a real child JVM (`test/parens/runtime_test.clj`: timeout
kill/restart, `System/exit`, exercise grading). `.github/workflows/desktop-ci.yml` runs
those plus the end-to-end checker on JDK 25.

The checker starts the app, validates auth/Host/Origin rejection, exercises JVM
semantics (ratios, `Math/`, Long, numeric equality, divide-by-zero), runs the
exercise path, measures cold start and eval latency, proves timeout and
`System/exit` recovery, and verifies that no worker JVM survives shutdown.

## Linux app image

```bash
# jpackage needs objcopy (binutils):
#   Ubuntu: sudo apt-get install -y binutils
#   Fedora: sudo dnf install -y binutils
#   NixOS:  nix shell nixpkgs#binutils -c bash scripts/build_appimage.sh
bash scripts/build_appimage.sh
node scripts/phase0_check.mjs \
  --command "$(pwd)/target/jpackage/ParensPhase0/bin/ParensPhase0" \
  --json benchmarks/jpackage-results.json
```

The app image is written to `target/jpackage/ParensPhase0` (~182 MB with the
bundled runtime on NixOS, ~144 MB on Ubuntu/Fedora with Temurin). `jpackage`'s
runtime may omit `bin/java`; the script copies the build JDK's launcher. That
happened with the NixOS GraalVM build and with Temurin 25 on Ubuntu 24.04 and
Fedora 43, so it is general `jpackage` behavior, not a NixOS workaround. On NixOS
the build also bundles zlib because the system provides no `/lib/libz.so.1`;
Ubuntu and Fedora resolve zlib normally and the script skips that step.

`jpackage` cannot cross-build: macOS and Windows installers must be built on
those OSes (CI matrix in Phase 6).

## Ubuntu .deb

```bash
bash scripts/build_deb.sh
sudo apt install ./target/deb/parens_0.1.0_amd64.deb
parens --no-open
```

The package installs the app image under `/opt/parens`, a `/usr/bin/parens`
wrapper, a desktop entry, the Clojure logo as a scalable icon, and the license.
It needs `dpkg-deb` (no `fakeroot`). Depends are `libc6`/`zlib1g`; X11 and
`xdg-utils` are recommended for opening the browser. `DEB_MAINTAINER`,
`APP_VERSION`, `APP_IMAGE_NAME`, and `DEB_ARCH` override the defaults. The script
repacks the app image instead of using `jpackage --type deb`, so the runtime
keeps the `bin/java` fix. Tested on Ubuntu 24.04 x86_64; see
[`docs/PHASE0_RESULTS.md`](../docs/PHASE0_RESULTS.md).

## Fedora .rpm

```bash
sudo dnf install -y rpm-build
bash scripts/build_rpm.sh
sudo dnf install ./target/rpm/RPMS/x86_64/parens-0.1.0-1.fc43.x86_64.rpm
parens --no-open
```

The package installs the app image under `/opt/parens`, a `/usr/bin/parens`
wrapper, a desktop entry, a scalable icon, and the license. `Requires: glibc,
zlib`; X11 and `xdg-utils` are recommended. The generated spec turns off automatic
ELF dependency generation (the runtime carries its own libraries) and strip/debug
post-processing, so the bundled runtime is packaged unchanged. `RPM_MAINTAINER`,
`APP_VERSION`, `APP_IMAGE_NAME`, and `RPM_RELEASE` override the defaults. Tested on
Fedora 43 x86_64; see [`docs/PHASE0_RESULTS.md`](../docs/PHASE0_RESULTS.md). The
`fedora-rpm` job in `.github/workflows/desktop-ci.yml` repeats the build, tests, and
install check in a `fedora:43` container on GitHub Actions; it passes 28/28.

## CI

`.github/workflows/desktop-ci.yml` builds and checks the app image on Ubuntu 24.04,
Ubuntu 26.04, macOS (arm64), and Windows (x64), plus the `.deb` and `.rpm`; every job
runs the same 28-check suite. The macOS and Windows jobs produce app images, not
native installers: `.dmg`/`.msi`/`.exe` packaging and code signing are still open.

## Known limitations

- Linux installers validated on Ubuntu 24.04 and Fedora 43 x86_64 under `proot`;
  macOS arm64 and Windows x64 app images are built and checked only in CI.
  `.dmg`/`.msi`/`.exe` installers and code signing are untested.
- JDK 25 LTS is pinned in `project.clj`, `scripts/run.sh`, and the app-image
  build. Measured on GraalVM CE 25.0.2 (NixOS) and Temurin 25.0.4.1 (Ubuntu
  24.04 under `proot`, and all CI app images).
- No true sandbox; see above.
- Timeout loses REPL/namespace state in the worker.
- Direct writes to `System/out` (rather than `println`) can corrupt the worker
  protocol; the parent treats that as a crash and restarts.
- The UI is a Phase 0 harness, and no browser was available here, so the check
  verifies the served page and the API rather than a rendered UI.

Measured results: [`docs/PHASE0_RESULTS.md`](../docs/PHASE0_RESULTS.md).
