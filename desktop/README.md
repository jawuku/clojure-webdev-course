# Parens desktop app

This is the local JVM app from [Phase 0](../docs/PHASE0_RESULTS.md) of
[`docs/JVM_DESKTOP_MIGRATION_PLAN.md`](../docs/JVM_DESKTOP_MIGRATION_PLAN.md), now
serving the current Vite UI and both JVM-native courses (Phases 1–4):

- A JVM app process serving a UI on `127.0.0.1` from a random port.
- A token-protected HTTP API (`eval`, `hiccup`, `exercise`, `set-ns`, `runtime`,
  `reset`, `preview/session`).
- A separate child JVM that evaluates real Clojure, killed and restarted on timeout.
- Hiccup rendering with the real `hiccup.core/html`, plus the Course 2 capstone Ring app
  at `/preview/todos` (vendored htmx, session-cookie gated).
- A Linux `jpackage` app-image with no first-run downloads.

`resources/public` is the built UI, copied there by `yarn build:desktop` in
`frontend/` and committed so `lein uberjar` and the packaging jobs work from a plain
checkout. CI fails if it is stale.

## Run

JDK 25 LTS is required. `project.clj` and the scripts fail with a clear error on
any other Java version.

```bash
# Build the UI first (after changing anything under frontend/)
cd ../frontend && yarn install && yarn build:desktop && cd ../desktop

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

Options: `--port N`, `--token T` (tests only), `--timeout-ms N`, `--no-open`,
`--no-app-window`, `--state-dir DIR` (default: the platform app-data directory).

## Launcher

- **One instance per state directory.** The launcher holds an OS file lock on
  `<state-dir>/instance.lock` and publishes `<state-dir>/instance.url`
  (owner-only on POSIX) once the server is listening. A second launch cannot
  take the lock: it reads the URL, opens the running UI, prints
  `Parens is already running.`, and exits 0. The OS releases the lock when the
  process exits, so a crash never leaves a stale lock — the file itself is kept
  on purpose.
- **Readiness.** `run-server` is synchronous, and the launcher additionally
  polls `GET /api/health` (5s budget) before opening the UI, so the first page
  load never races the listener.
- **App window.** A Chromium-family browser (Chrome, Chromium, Edge, Brave) is
  launched with `--app=<url>`, an isolated
  `--user-data-dir=<state-dir>/browser-profile`, `--no-first-run` and
  `--no-default-browser-check`. This keeps the user's normal browser profile
  untouched and works even when a browser is already running. Detection looks
  in PATH on Linux, `/Applications` on macOS, and the usual Program Files /
  LOCALAPPDATA paths on Windows. `PARENS_BROWSER=/path/to/browser` overrides
  detection; `--no-app-window` (or `--no-open`) skips the window.
- **Fallback.** With no Chromium-family browser the URL opens through
  `Desktop.browse` or the platform opener (`open`, `rundll32`, `xdg-open`).
- **Ports.** `--port N` requests a fixed loopback port; if it is taken the
  launcher explains the conflict and suggests omitting `--port`. The default
  picks a free port.
- **Shutdown.** The shutdown hook stops the HTTP server, kills the worker JVM,
  removes `instance.url`, and releases the lock.

## API

All `/api/*` routes except `/api/health` require `X-Parens-Token`.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/health` | — | `{ok, status, server-pid}` |
| GET | `/api/runtime` | — | `{ok, active-ns, pid, clojure, java, timeout-ms, server-pid}` |
| POST | `/api/set-ns` | `{ns}` | `{ok, ns}` — default namespace for evals that omit `ns` |
| POST | `/api/eval` | `{code, ns?}` | `{ok, value, output, error, ms}` or `{ok:false, timeout:true}` |
| POST | `/api/hiccup` | `{code, ns?}` | `{ok, html, output, error, ms}` — the last form rendered by `hiccup.core/html` |
| POST | `/api/exercise` | `{code, tests:[string]}` | `{ok, passed, results:[{test,ok,detail}], runError, output, ms}` |
| POST | `/api/preview/session` | — | `{ok}` + a `parens-preview` `Set-Cookie` for the live capstone |
| POST | `/api/reset` | — | restarts the worker |
| GET | `/api/state` | — | `{ok, state:{bucket → value}}` from `state.edn` |
| PUT | `/api/state` | `{key, value}` | `{ok, key, buckets}` — merges one bucket; `value: null` deletes it |

`value` is `pr-str` of the last form. Code is read and evaluated one top-level form at a
time (like a REPL), so `defprotocol`/`defrecord` definitions are visible to later forms.
`output` captures `println`/`prn` and stderr. Errors include the compiler cause chain.
Exercise code runs in a fresh `exerciseN` namespace with `answer` bound to the last value,
matching the app's `runExerciseTests` semantics.

## Live course preview

Course 2 renders Hiccup through `/api/hiccup` (the worker calls the real
`hiccup.core/html`) and embeds it in a sandboxed iframe. Its capstone is a small Ring app:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/preview/todos` | full page, server-rendered Hiccup + vendored htmx |
| POST | `/preview/todos` | add a todo; returns the `#todos` fragment plus an out-of-band input reset |
| POST | `/preview/todos/:id/toggle` | toggle done; returns the fragment |
| POST | `/preview/todos/:id/delete` | delete; returns the fragment |

These routes do **not** use `X-Parens-Token` — an iframe navigation cannot set headers.
They require the `parens-preview` cookie issued by the token-protected
`/api/preview/session`, and still pass the Host/Origin/`Sec-Fetch-Site` checks. State lives
in a per-launch atom; it is a teaching demo, not user data.

## Security model

- Loopback bind only (`127.0.0.1`), random port, random 32-byte token.
- `Host` must be `127.0.0.1`/`localhost` (blocks DNS rebinding).
- `Origin`, when present, must be the local app origin; no CORS headers.
- `Sec-Fetch-Site`, when present, must be `same-origin` or `none`.
- Strict CSP on the static page; no inline scripts and no `unsafe-eval` (HTMX's
  `hx-on` handlers would need it, so the preview uses an out-of-band swap instead).
  `style-src` allows inline styles because CodeMirror injects its theme into a `<style>`
  element at runtime; `frame-src 'self'` allows the same-origin capstone iframe.
- The preview page sets its own stricter CSP (`default-src 'none'`, `script-src 'self'`,
  `style-src 'unsafe-inline'`) and requires the per-launch preview cookie, which is
  `HttpOnly` and `SameSite=Strict`.
- Body size limit and code length limit.

The evaluator is **not a sandbox**. Learner code is trusted local code: it can
read files and open sockets. The child process protects the app from hangs and
`System/exit`, not from a determined user.

## State

Learner state lives in one EDN file in the platform app-data directory:

| OS | Path |
| --- | --- |
| Linux | `$XDG_CONFIG_HOME/parens/state.edn` (default `~/.config/parens/state.edn`) |
| macOS | `~/Library/Application Support/Parens/state.edn` |
| Windows | `%APPDATA%\Parens\state.edn` |

It is `{:version 1 :buckets {"parens_clojure_v1" {...} "parens_active_course_v1"
"clojure" ...}}`, one bucket per key the UI has always used. `PUT /api/state`
merges a bucket; a `null` value deletes it. Writes go to a temp file in the same
directory and are moved into place with `ATOMIC_MOVE` (falling back to a plain
replace on filesystems that cannot), so a crash never leaves a half-written
file. A corrupt file is moved aside as `state.edn.corrupt-<timestamp>`.

The UI keeps a `localStorage` mirror for first paint (`public/theme-init.js`) and
for running without a server; `frontend/src/lib/store.js` hydrates the mirror
from the file before React renders, uploads old browser buckets on the first
launch after upgrading, and falls back to the mirror if `GET /api/state` fails.
Use `--state-dir` to keep tests and the packaged checkers away from the real
profile.

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
lein test                       # token/Host/Origin, worker recovery, state store, launcher
lein uberjar
node scripts/phase0_check.mjs --json benchmarks/results.json
node scripts/offline_smoke.mjs --json benchmarks/offline-smoke.json
```

`lein test` covers the security boundary at the handler level (`test/parens/api_test.clj`)
and the worker lifecycle against a real child JVM (`test/parens/runtime_test.clj`: timeout
kill/restart, `System/exit`, exercise grading). `.github/workflows/desktop-ci.yml` runs
those plus the end-to-end checker on JDK 25.

The checker starts the app, validates auth/Host/Origin rejection, exercises JVM
semantics (ratios, `Math/`, Long, numeric equality, divide-by-zero), runs the
exercise path, measures cold start and eval latency, proves timeout and
`System/exit` recovery, and verifies that no worker JVM survives shutdown. The
rendered UI (Hiccup previews, the capstone Ring app, exercises) is covered by
`frontend/scripts/smoke.mjs`, which CI runs on Linux, macOS and Windows against the
shared uberjar. The human install pass, signing secrets and release notes are in
[`docs/RELEASE_CHECKLIST.md`](../docs/RELEASE_CHECKLIST.md).

`node scripts/offline_smoke.mjs` is the packaged-app offline check. It starts a
package (or the uberjar), crawls every asset the shipped HTML and CSS reference,
and fails if one is missing, empty, or points at another origin. It then evaluates
`(+ 1 2)` through the packaged worker JVM and checks that quitting leaves no orphan
worker. Pass `--command /path/to/launcher` to test an installed app image, `.deb`,
`.rpm`, `.dmg`, `.msi`, or `.exe`; CI runs it on every packaged artifact.

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
node scripts/offline_smoke.mjs \
  --command "$(pwd)/target/jpackage/ParensPhase0/bin/ParensPhase0" \
  --json benchmarks/jpackage-offline.json
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
install check in a `fedora:43` container on GitHub Actions; it passes 31/31.

## macOS .dmg

```bash
bash scripts/build_dmg.sh                            # builds the app image first
hdiutil attach target/dmg/ParensPhase0-1.0.0-*.dmg   # drag the app to Applications
```

The script packages the app image from `scripts/build_appimage.sh` with `hdiutil`
(the `.app` plus an `/Applications` symlink) instead of running
`jpackage --type dmg`, so the image keeps the `bin/java` fix and the ad-hoc
signature. Set `SKIP_APPIMAGE=1` to reuse an image that was already built and
checked. `APP_VERSION` defaults to `1.0.0` because jpackage rejects a macOS
bundle version starting with zero (the jar stays `0.1.0`); the script refuses to
package an app image whose `CFBundleShortVersionString` differs. Local builds are
ad-hoc signed; signing and notarization for release are below.

## Windows .msi and .exe

```bash
# Git Bash; WiX Toolset (candle.exe/light.exe) must be on PATH
bash scripts/build_msi.sh
bash scripts/build_exe.sh
msiexec /i target/msi/ParensPhase0-1.0.0.msi
```

jpackage has no way to package an existing app image as an `.msi`/`.exe`, so
these run `jpackage --type msi` / `--type exe` and build the runtime again.
Unlike Linux, jpackage keeps `runtime/bin/java.exe` in the Windows runtime,
which the child evaluator needs; the installed-package check fails if it is
missing. `--win-console` is required for the launcher handshake, so the
installed app opens a console window. `REBUILD_JAR=0` reuses an existing
`target/parens-desktop.jar`. `APP_NAME`, `APP_VERSION`, and `REBUILD_JAR`
override the defaults. Both scripts share `scripts/win_common.sh`; their
output goes to `target/msi` and `target/exe`.

The `.exe` is jpackage's wrapper (`msiwrapper.exe`) with the `.msi` embedded:
it forwards its arguments to `msiexec /i`, so `/quiet /norestart` installs it
silently, and a bare `uninstall` argument removes the product silently using
the embedded product code. That is how CI exercises it.

## Signing and notarization

Signing lives in `.github/workflows/desktop-release.yml`, not in pull-request CI, so
PRs never need certificates. The release workflow runs on `workflow_dispatch` or a
`desktop-v*` tag and fails early with the names of any missing secrets.

| Secret | Used for |
| --- | --- |
| `APPLE_SIGNING_IDENTITY` | `codesign` identity, e.g. `Developer ID Application: Name (TEAMID)` |
| `APPLE_CERT_P12_BASE64` | base64 of the Developer ID Application `.p12` |
| `APPLE_CERT_PASSWORD` | password for that `.p12` |
| `APPLE_NOTARY_KEY_P8_BASE64` | base64 of the App Store Connect API key (`AuthKey_<id>.p8`) |
| `APPLE_NOTARY_KEY_ID` | API key ID |
| `APPLE_NOTARY_KEY_ISSUER` | App Store Connect issuer UUID |
| `WINDOWS_CERT_PFX_BASE64` | base64 of the Authenticode code-signing `.pfx` |
| `WINDOWS_CERT_PASSWORD` | password for that `.pfx` |

The workflow runs this check first; it also works locally and names every missing
variable:

```bash
bash scripts/require_release_secrets.sh macos
bash scripts/require_release_secrets.sh windows
```

macOS signing imports the certificate into a throwaway keychain, signs every Mach-O
file in the bundle (the app launcher, the worker launcher, and the bundled
`bin/java`, which all host a JVM, get `packaging/entitlements.plist`), then signs the
bundle with the hardened runtime and a secure timestamp. Notarization submits a
`.app` as a zip, staples the bundle, and verifies it with `spctl`; the `.dmg` is then
built from the stapled app, signed, notarized and stapled as well.

```bash
bash scripts/sign_macos.sh target/jpackage/ParensPhase0.app
bash scripts/notarize_macos.sh target/jpackage/ParensPhase0.app
SKIP_APPIMAGE=1 APP_VERSION=1.0.0 bash scripts/build_dmg.sh
bash scripts/sign_macos.sh target/dmg/*.dmg
bash scripts/notarize_macos.sh target/dmg/*.dmg
```

Windows signing uses `signtool` with SHA-256 and an RFC 3161 timestamp, then verifies
each file with `signtool verify /pa` — the assessment SmartScreen and the installer
make. The app-image launchers and the `.msi`/`.exe` installers are signed. jpackage
builds a fresh app image for each installer, so the launchers inside an installed
copy are not individually signed; the installer signature covers delivery.

```bash
bash scripts/sign_windows.sh target/jpackage/ParensPhase0/ParensPhase0.exe \
  target/jpackage/ParensPhase0/ParensWorker.exe
bash scripts/sign_windows.sh target/msi/*.msi target/exe/*.exe
```

`SIGNTOOL`, `WINDOWS_TIMESTAMP_URL`, `PARENS_KEYCHAIN`, and `ENTITLEMENTS` override
the defaults. Nothing here is a sandbox: the entitlements are the standard JVM set
for the hardened runtime, not App Sandbox.

## CI

`.github/workflows/desktop-ci.yml` builds and checks the app image on Ubuntu 24.04,
Ubuntu 26.04, macOS (arm64), and Windows (x64), plus the `.deb` and `.rpm`; every job
runs the same 31-check suite. The macOS job also builds a `.dmg`, installs the app
into `/Applications`, and re-runs the checks against that copy. The Windows job
builds an `.msi` and an `.exe`, installs each in turn, checks the installed launcher
against the same 31 checks, and uninstalls it. Those artifacts are unsigned;
`desktop-release.yml` produces the signed and notarized ones.

## Known limitations

- Linux installers validated on Ubuntu 24.04 and Fedora 43 x86_64 under `proot`;
  macOS arm64 and Windows x64 app images and the `.dmg`/`.msi`/`.exe` installers are
  built and checked only in CI. Signing and notarization need certificates and are
  exercised only by `desktop-release.yml`; they have not run without them.
- JDK 25 LTS is pinned in `project.clj`, `scripts/run.sh`, and the app-image
  build. Measured on GraalVM CE 25.0.2 (NixOS) and Temurin 25.0.4.1 (Ubuntu
  24.04 under `proot`, and all CI app images).
- No true sandbox; see above.
- Timeout loses REPL/namespace state in the worker.
- Direct writes to `System/out` (rather than `println`) can corrupt the worker
  protocol; the parent treats that as a crash and restarts.
- The Phase 0 check verifies the served page and the API, not a rendered UI. The
  rendered UI is covered by `frontend/scripts/smoke.mjs` (`yarn smoke`), which drives
  Chromium through all 74 lessons against the built jar.

Measured results: [`docs/PHASE0_RESULTS.md`](../docs/PHASE0_RESULTS.md) and
[`docs/PHASE1_RESULTS.md`](../docs/PHASE1_RESULTS.md).
