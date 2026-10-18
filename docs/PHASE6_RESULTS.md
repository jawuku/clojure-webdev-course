# Phase 6 — Persistence, Offline, Packaging, Launcher

Status: **complete** (2026-10-18).

Phase 6 turned the Phase 0 slice into an installable desktop app: learner state
moved out of the browser into `state.edn`, the packaged UI was proved offline,
installers are built and checked per OS in CI, and the launcher now behaves like
a desktop app (one instance, an app window, a deterministic start).

## Delivered

### Persistence

- `parens.state` owns one EDN file in the platform app-data directory:
  `~/.config/parens/state.edn` (or `$XDG_CONFIG_HOME`), `~/Library/Application
  Support/Parens/state.edn`, `%APPDATA%\Parens\state.edn`.
- Shape: `{:version 1 :buckets {"parens_clojure_v1" {...} ...}}`. Writes merge
  one bucket under a lock, go to a temp file in the same directory, and are
  moved into place with `ATOMIC_MOVE` (plain replace as fallback). A corrupt
  file is moved aside as `state.edn.corrupt-<timestamp>` instead of being
  overwritten.
- `GET/PUT /api/state` is token/Host/Origin protected like the other API routes;
  `value: null` deletes a bucket.
- `frontend/src/lib/store.js` is the one store API. `hydrateStore()` runs before
  the first React render: the file wins, a `localStorage` mirror is refreshed,
  and on the first launch after upgrading from the browser-only build the old
  buckets are uploaded. If no server answers, the mirror is the store.
- Theme, font size, progress, last location, active course, completion
  celebration flags and Regex Golf scores all use this path.

### Offline and packaging

- `desktop/scripts/offline_smoke.mjs` crawls every asset the packaged HTML/CSS
  references, evaluates Clojure through the packaged worker, and checks for
  orphan JVMs. It runs in CI against the `.deb`, `.rpm`, both Linux app images,
  macOS app image and installed `.dmg`, Windows app image and installed `.msi`
  and `.exe`.
- jpackage quirks found in Phase 0 are handled in the build scripts (missing
  `strip-native-commands` launcher, bundled zlib on NixOS), and the packaged
  apps keep working with a stripped runtime.

### Launcher

- **Single instance.** `instance.lock` is held with an OS file lock (released
  automatically on a crash). The owner publishes `instance.url` atomically with
  owner-only permissions. A second launch fails the lock, reads the URL (or
  waits up to 3s for it), opens the running UI, prints `Parens is already
  running.`, and exits 0 — no second server, port or worker JVM. The lock file
  is left on disk by design; the OS lock, not file existence, is the authority.
- **Port.** `--port N` still fixes the port; a taken port now prints a readable
  message and suggests omitting `--port` instead of a stack trace.
- **Readiness.** `run-server` is synchronous, and a `/api/health` probe now
  gates opening the UI (5s budget) instead of the old fixed 150ms sleep.
- **App window.** Chromium, Google Chrome, Microsoft Edge and Brave are
  detected on Linux (PATH), macOS (`/Applications/...`) and Windows
  (`ProgramFiles`, `ProgramFiles(x86)`, `LOCALAPPDATA`). They are launched with
  `--app=<url>`, an isolated `--user-data-dir=<app-data>/browser-profile`,
  `--no-first-run` and `--no-default-browser-check`, so the learner's everyday
  browser profile is untouched and a running browser cannot swallow the launch.
  `PARENS_BROWSER` overrides detection and `--no-app-window` forces the
  default-browser fallback (`Desktop.browse`, `open`, `rundll32` or `xdg-open`).
- **Clean shutdown.** The shutdown hook stops the HTTP server, kills the worker
  JVM, and removes `instance.url` while releasing the lock.
- `?lesson=` / `?view=` deep links still work, and all checkers pass
  `--state-dir` so they never touch a real profile.

## Verification

Locally on 2026-10-18:

- `lein test` — **45 tests / 201 assertions**, including `state_test.clj`,
  `api_test.clj` (`/api/state`) and `main_test.clj` (lock exclusivity, URL
  handoff/validation, `--app` argv, launcher flags).
- `node scripts/phase0_check.mjs` — **46/46**, including:
  - a second launch hands off and exits 0 while the first keeps serving;
  - `instance.url` is published and removed on exit;
  - `state.edn` is written atomically and survives a full app restart;
  - a fake Chromium receives `--app=<live URL>` and `--user-data-dir=...`
    (Unix).
- `yarn smoke` — **29/29**, including state.edn write + hydration after the
  browser mirror is cleared.
- `node scripts/offline_smoke.mjs` — 10/10.
- An ad-hoc upgrade check imported old `localStorage` buckets, then recovered
  them after clearing the mirror (6/6).

## Limitations

- The app-window path is verified by argv (a fake browser) and by the fallback
  code path, not by a human looking at a window; Windows skips the fake-browser
  check.
- Browser detection only covers the common Chromium-family install locations;
  `PARENS_BROWSER` is the escape hatch for unusual setups.
- A second launch opens the app window through the same isolated profile; if the
  first instance's browser is still shutting down, Chrome may take a moment to
  show it.
- Signing/notarization still needs release certificates, and the installer
  jobs still need one manual install pass per OS.
