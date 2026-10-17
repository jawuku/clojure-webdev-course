# Phase 0 results — local JVM vertical slice

Date: 2026-10-17
Status: **PASS** (28/28 checker checks on the uberjar, the Linux `jpackage` app-image,
Ubuntu 24.04 and Fedora 43 rebuilds, and the installed `.deb` and `.rpm`; 15 `lein test`
tests cover the security boundary and worker recovery)

The slice lives in [`desktop/`](../desktop/README.md). It is a throwaway harness, not
the course UI.

## Environment

| | |
| --- | --- |
| OS | Linux 7.2.10 x86_64 (NixOS), 4 CPUs |
| Java | GraalVM CE 25.0.2 (OpenJDK 25.0.2) |
| Clojure | 1.12.5 |
| HTTP | http-kit 2.8.0, Ring-style handler |
| JSON | Cheshire 5.13.0 |
| Node | 24.21.0 (checker only) |
| jpackage | 25.0.2 |

Two JVMs run per app: the server/launcher JVM and the child evaluator JVM.

## Artifacts

| Artifact | Path | Size |
| --- | --- | --- |
| Standalone uberjar | `desktop/target/parens-desktop.jar` | 6.2 MB |
| Linux app-image | `desktop/target/jpackage/ParensPhase0` | 182 MB |
| Launcher | `desktop/target/jpackage/ParensPhase0/bin/ParensPhase0` | — |
| Ubuntu `.deb` | `desktop/target/deb/parens_0.1.0_amd64.deb` | 44 MB |
| Fedora `.rpm` | `desktop/target/rpm/RPMS/x86_64/parens-0.1.0-1.fc43.x86_64.rpm` | 56 MB |
| Raw results | `desktop/benchmarks/{results,jpackage-results,ubuntu-results,fedora-results,deb-results,rpm-results}.json` | — |

The app-image is self-contained: bundled runtime, bundled UI, no first-run downloads.

## Measured results

Sequential requests over loopback, one fresh HTTP connection per request. "Wall" is
client-side; "server p95" is the eval round-trip reported by the server. Warm-up was 10
evals. The worker is started in the background so the UI can paint first.

| Metric | Uberjar | jpackage app-image |
| --- | ---: | ---: |
| Cold start: launch → HTTP server ready | **1.39 s** | **1.69 s** |
| Time to first eval result (includes worker boot) | **2.70 s** | **3.32 s** |
| First eval wall (worker boot) | 1.19 s | 1.43 s |
| RSS after warm-up: app / worker | 122.8 / 115.6 MB | 99.5 / 115.2 MB |
| Eval `(+ 1 2)`, 100 runs: p50 | 8.80 ms | 8.69 ms |
| Eval, 100 runs: **p95** | **15.21 ms** | **14.21 ms** |
| Eval, 100 runs: p99 / max | 18.62 / 21.70 ms | 17.58 / 35.15 ms |
| Eval, 100 runs: server p95 | 11.83 ms | 10.48 ms |
| Eval, 200 runs: p50 / p95 | 7.87 / 16.51 ms | 6.15 / 10.27 ms |
| Eval, 200 runs: p99 / max | 24.56 / 29.80 ms | 12.37 / 14.15 ms |
| Eval, 200 runs: server p95 | 12.06 ms | 7.28 ms |
| `(reduce + (range 100000))`, 20 runs: p50 / p95 | 12.02 / 19.31 ms | 12.02 / 20.17 ms |
| Exercise check, 20 runs: p50 / p95 | 10.55 / 23.97 ms | 11.40 / 23.37 ms |
| Timeout request, `(while true)` (2 s limit) | 2028 ms | 2021 ms |
| Recovery after timeout (kill + reboot + eval) | 1457 ms | 1341 ms |
| Recovery after `(System/exit 0)` | 1246 ms | 1245 ms |

The Phase 0 target was eval p95 < 150 ms; the measured p95 is ~15 ms, about 10× under
target. The first eval is ~1 s slower than later evals because it waits for the child
JVM boot. The two JVMs together use ~238 MB RSS in the uberjar run; the app-image run
reported ~215 MB. RSS is sampled once after warm-up, not a peak measurement.

These are single-run samples taken after the cleanup on a shared 4-core host whose load
average was ~3.7; startup figures varied by up to ~2 s between runs (a first launch from
a cold page cache was slower still), and the eval tail moves with host load. Treat
startup and recovery numbers as upper bounds. The p95 margin is large enough that host
noise does not change the gate decision.

## Standard Linux validation (Ubuntu 24.04)

The app-image was rebuilt and checked outside NixOS to confirm the packaging is not
NixOS-specific:

| | |
| --- | --- |
| Distro | Ubuntu 24.04.3 LTS base rootfs (glibc 2.39) |
| JDK / jpackage | Temurin 25.0.4.1+1 |
| Toolchain | Lein 2.12.0, binutils 2.42, Node 22.14.0 |
| Method | `proot` userspace chroot (no Docker, VM, or root) |

`lein uberjar` and `scripts/build_appimage.sh` completed unchanged. The script printed
`Added runtime bin/java ...` — jpackage's runtime omitted `bin/java` on Ubuntu too, so
that step is general `jpackage` behavior, not a NixOS workaround. It did **not** bundle
zlib; Ubuntu's `libz.so.1` resolved normally. The checker then passed **28/28** against
the Ubuntu-built image (144 MB): cold start 1.36 s, first eval 2.71 s, eval p95 12.2 ms
(200-run p95 9.18 ms), timeout 2023 ms, recovery 1.29 s / 1.20 s, RSS 72.4 + 87.5 MB,
no orphan worker.

With the build JDK moved out of the rootfs, the image still launched, evaluated
`(+ 1 2)` → `3`, and reported its own `java 25.0.4.1` runtime, so it does not depend on
the JDK used to build it.

## Ubuntu 24.04 `.deb`

`scripts/build_deb.sh` repacks the validated app image — not `jpackage --type deb`,
which would repeat the missing-`bin/java` problem — into a 44 MB package (146,932 KiB
installed). It installs `/opt/parens`, `/usr/bin/parens`, a desktop entry, a scalable
icon, and the MIT license; depends are `libc6 (>= 2.35)` and `zlib1g`.

Validated in the same Ubuntu rootfs: `dpkg -i` succeeded, `/usr/bin/parens` passed
**28/28** checks (cold start 1.36 s, first eval 2.63 s, eval p95 12.7 ms, timeout
2022 ms, recovery 1.14 s / 1.12 s, RSS 71.1 + 85.8 MB), it launched with the build JDK
removed, and `dpkg -r parens` removed the installed files.

## Fedora 43 validation

Same app-image build on Fedora 43 (Container Image, glibc 2.42, Temurin 25.0.4.1,
binutils 2.45.1), again under `proot`:

`lein uberjar` and `scripts/build_appimage.sh` succeeded unchanged. `jpackage` again
omitted `bin/java`, so the script copied it; zlib was found in the system and was not
bundled. The checker passed **28/28** (cold start 1.33 s, first eval 2.60 s, eval p95
11.4 ms, timeout 2022 ms, recovery 1.12 s / 1.12 s, RSS 73.7 + 87.6 MB, no orphan
worker). The image also launched and evaluated with the build JDK removed.

## Fedora 43 `.rpm`

`scripts/build_rpm.sh` repacks the Fedora-built app image into a 56 MB RPM
(`parens-0.1.0-1.fc43.x86_64`, 149.8 MB installed). The spec disables automatic ELF
requirements — the runtime bundles its own libraries — so the only requires are
`glibc` and `zlib`; X11 and `xdg-utils` are recommended.

Validated in the Fedora rootfs: `rpm -ivh` succeeded, `/usr/bin/parens` passed **28/28**
(cold start 1.41 s, first eval 2.70 s, eval p95 11.7 ms, timeout 2021 ms, recovery
1.10 s / 1.11 s, RSS 72.7 + 86.3 MB), it ran with the build JDK removed, and
`rpm -e parens` removed the installed files. The `fedora-rpm` job in
`.github/workflows/desktop-ci.yml` repeats these steps in a `fedora:43` container.

That job has since run on GitHub Actions (run 39047176861): `dnf install` resolved the
prerequisites, the RPM built in the container (44 MB), `rpm -ivh` succeeded, the
installed `/usr/bin/parens` passed **28/28** checks (cold start 526 ms, first eval
1.04 s, eval p95 3.9 ms, timeout recovery 445 ms, crash recovery 440 ms, no orphan
worker), `rpm -e parens` removed it, and the RPM plus `rpm-results.json` were uploaded
as artifacts. The runner reported only deprecation notices, not failures; the workflow
now uses `actions/setup-java@v6`.

`proot` changes the userland root, not the kernel, so this validates library resolution
and package behavior on Ubuntu and Fedora — not installer integration or desktop
entries. The `app-image` and `fedora-rpm` CI jobs repeat the Ubuntu and Fedora builds
on GitHub-hosted runners, where all eight jobs pass.

## Cross-platform app images

`app-image` builds and checks the Linux app image on both Ubuntu 24.04 and 26.04;
`macos-app-image` (arm64) and `windows-app-image` (x64) do the same on their host OS,
since `jpackage` cannot cross-build. All four pass **28/28** (run 39049177456):

| Runner | Cold start | First eval | Eval p95 | Timeout recovery |
| --- | --- | --- | --- | --- |
| Ubuntu 24.04 | 2.19 s | 2.81 s | 3.0 ms | 543 ms |
| Ubuntu 26.04 | 2.37 s | 3.02 s | 3.5 ms | 568 ms |
| macOS | 0.41 s | 0.84 s | 2.5 ms | 339 ms |
| Windows | 0.65 s | 1.22 s | 2.7 ms | 487 ms |

Platform handling this required:

- macOS rejects an app version whose first component is zero, so the per-OS app images
  are packaged as `1.0.0` rather than `0.1.0`.
- Windows launchers need `--win-console`, otherwise the launcher handshake has no
  stdout; the evaluator is launched from the bundled runtime's `java.exe`.
- Windows has no `SIGTERM`, so the checker terminates the process tree with
  `taskkill /T /F` and compares captured output with normalized newlines.
- macOS app images are ad-hoc signed (`codesign --sign -`), which Apple silicon
  requires before it executes them.

## Checks (28/28 passed on the uberjar, app-image, .deb, and .rpm)

**Boot and serving**
- Launcher prints a random per-launch token (32 random bytes, base64url).
- `/api/health` is 200 without a token.
- `/` serves the UI harness; the page carries the strict CSP.
- First eval succeeds after the worker boots.

**Auth and request filtering**
- Missing token → 401; wrong token → 401.
- Foreign `Origin` → 403; `Sec-Fetch-Site: cross-site` → 403.
- Foreign `Host` → 403 (DNS-rebinding guard).
- Invalid namespace → 400.

**Real JVM Clojure**
- `(println "hi") (+ 1 2)` → value `3`, output `hi\n`.
- `(/ 1 2)` → `1/2` (ratio, not `0.5`).
- `(Math/sqrt 16)` → `4.0` (JVM static call).
- `(class 1)` → `java.lang.Long`.
- `(= 1 1.0)` → `false`; `(== 1 1.0)` → `true`.
- `(/ 1 0)` → `java.lang.ArithmeticException: Divide by zero`.

**Exercises**
- A correct `twice` passes 2/2 in a fresh `exerciseN` namespace.
- A wrong `twice` reports the failing test and detail.

**Failure containment**
- `(while true)` is killed at the timeout; a new worker pid appears; the next eval works.
- `(System/exit 0)` kills only the worker; the next eval works.
- SIGTERM exits the app and leaves no worker process behind.

## What broke and what fixed it

1. **`StringWriter.length`** — the worker's output capture used a nonexistent field.
   Fixed by measuring `(str err)` instead.
2. **Cold start was 4.7 s** — app JVM boot, `clojure.main` startup for the worker, and
   sequential startup. Fixes: start the HTTP server before the worker; launch the AOT
   worker class directly instead of `clojure.main -m`; enable direct linking; add
   `-XX:TieredStopAtLevel=1`. Result: ~1.4 s to the UI, ~2.7 s to the first eval.
3. **`jpackage` failed without `objcopy`** — this NixOS image has binutils in the Nix
   store but not on `PATH`. The build script now checks for it and tells you to run
   `nix shell nixpkgs#binutils`.
4. **The app-image launcher exited 1 with no output** — the generated runtime could not
   find `libz.so.1` (NixOS has no `/lib/libz.so.1`). The build script detects the missing
   dependency and bundles Nix's zlib. A trivial Hello World app reproduced the same
   failure, confirming it was environmental, not app-specific.
5. **The app-image runtime has no `bin/java`** (confirmed with Temurin 25 on Ubuntu 24.04,
   so this is not NixOS-specific) — `jpackage` builds it with
   `--strip-native-commands`, so the child worker could not be launched. The build script
   copies the build JDK's `bin/java` into the runtime; an additional `ParensWorker`
   jpackage launcher remains as a fallback. Without `bin/java`, the worker launcher's
   stdio protocol also failed when spawned from the app, so the `bin/java` path is the
   one used.

## Limitations

- **Linux installers and all app images.** `.deb` (Ubuntu 24.04) and `.rpm`
  (Fedora 43) are built, installed, and checked on x86_64. App images also build and
  pass on Ubuntu 24.04/26.04, macOS arm64, and Windows x64 in CI; `.dmg`, `.msi`, and
  `.exe` installers are not built yet, and other distributions remain untested.
- **Local validation on Ubuntu 24.04 and Fedora 43**, both under `proot` rather than a
  VM. `bin/java` had to be copied on both; zlib bundling was needed only on NixOS.
  macOS and Windows were exercised only by CI app images, not by an install or a
  desktop session.
- **JDK 25 LTS pinned.** `project.clj`, `scripts/run.sh`, and the app-image build reject
  any other Java version. Measured on GraalVM CE 25.0.2 (NixOS) and Temurin 25.0.4.1
  (Ubuntu, macOS, and Windows). `jpackage`'s runtime can omit native commands, which is
  why the build copies `bin/java`.
- **No real sandbox.** Learner code can read files and use the network. The child process
  protects the app from hangs and exits, not from a malicious user.
- **Timeout loses worker state.** A runaway snippet kills the REPL's definitions. This is
  acceptable for lessons/exercises but needs a UI explanation.
- **No rendered-UI check.** Chrome/Chromium is not installed here. The checker verifies
  the served HTML, CSP, and every API path; it does not execute the UI JavaScript.
- **Protocol edge cases.** Direct `System/out` writes or `alter-var-root` on `*out*` can
  corrupt the EDN channel; the parent detects the protocol error and restarts.
- **Static UI is a harness.** The real course UI is still the CRA app; Vite migration is
  Phase 1.

## Reproduce

```bash
cd desktop
lein test                       # token/Host/Origin, timeout/exit recovery
lein uberjar
node scripts/phase0_check.mjs --json benchmarks/results.json

# Linux app image. jpackage needs binutils (objcopy):
#   Ubuntu: sudo apt-get install -y binutils
#   Fedora: sudo dnf install -y binutils
#   NixOS:  nix shell nixpkgs#binutils -c bash scripts/build_appimage.sh
bash scripts/build_appimage.sh
node scripts/phase0_check.mjs \
  --command "$(pwd)/target/jpackage/ParensPhase0/bin/ParensPhase0" \
  --json benchmarks/jpackage-results.json

# Ubuntu .deb (dpkg-deb; no fakeroot)
bash scripts/build_deb.sh
sudo apt install ./target/deb/parens_0.1.0_amd64.deb
node scripts/phase0_check.mjs --command /usr/bin/parens \
  --json benchmarks/deb-results.json

# Fedora .rpm (rpm-build)
bash scripts/build_rpm.sh
sudo dnf install ./target/rpm/RPMS/x86_64/parens-0.1.0-1.fc43.x86_64.rpm
node scripts/phase0_check.mjs --command /usr/bin/parens \
  --json benchmarks/rpm-results.json
```

## Gate decision

**PASS.** The local-server architecture, real-JVM evaluation, timeout containment, auth
model, offline packaging, and Linux `jpackage` all work with measured margins. Proceed to
Phase 1 (Vite migration) and start the lesson-audit harness in parallel, as planned.

The two items carried into Phase 1/2 are now covered: (a)
`desktop/test/parens/runtime_test.clj` exercises timeout kill/restart, `System/exit`
containment, and exercise grading against the real child JVM; (b)
`desktop/test/parens/api_test.clj` covers the token, Host, Origin, and Sec-Fetch-Site
rules at the handler. `.github/workflows/desktop-ci.yml` runs both
suites plus the end-to-end checker on JDK 25.
