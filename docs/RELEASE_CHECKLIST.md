# Release Checklist

CI builds, installs and checks every package on its own OS, but a release still
needs one human pass on real desktops. Signing and notarization also need
credentials that are not in the repository.

## 1. Let CI produce the artifacts

Push the release commit and wait for both workflows:

- **Desktop runtime** (`.github/workflows/desktop-ci.yml`) — `lein test`, then
  `.deb`, `.rpm`, Linux app images, macOS app image + `.dmg`, Windows app image
  + `.msi` + `.exe`. Each installer is installed, checked with
  `phase0_check.mjs`, checked with `offline_smoke.mjs`, and uninstalled.
- **Frontend** (`.github/workflows/frontend-ci.yml`) — lint, Vite build, stale
  bundle check, offline check, content audit, semantics guard, and the browser
  smoke test on Ubuntu, macOS and Windows.

All of these must be green before tagging. The signing jobs in
`.github/workflows/desktop-release.yml` need these repository secrets:

| Secret | Used for |
| --- | --- |
| `MACOS_CERTIFICATE_P12`, `MACOS_CERTIFICATE_PASSWORD`, `MACOS_KEYCHAIN_PASSWORD` | Developer ID signing |
| `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD` | notarization |
| `WINDOWS_CERTIFICATE_PFX`, `WINDOWS_CERTIFICATE_PASSWORD` | Authenticode signing |

Without them, builds are unsigned: macOS Gatekeeper and Windows SmartScreen
will warn on first launch. That is acceptable for a development build, not for
a public release.

## 2. Manual install pass (per OS)

Use a machine or VM that has never had Parens installed. For each target:

1. Download the installer from the workflow run and verify its checksum.
2. Install it the normal way (double-click `.dmg`/`.msi`/`.exe`, or
   `sudo apt install ./parens_*.deb` / `sudo dnf install ./parens-*.rpm`).
3. Launch from the desktop menu or applications folder:
   - with Chrome/Chromium/Edge/Brave installed, the UI opens in an app window;
     without one it opens in the default browser (`--no-app-window` forces the
     fallback);
   - the UI renders with self-hosted fonts (no flash of fallback text);
   - the welcome lesson shows the runtime as ready.
4. Launch it a second time: no new server starts, the running window comes
   forward, and the process exits. `jps -l`/Task Manager still shows one app JVM.
5. Run `(map inc [1 2 3])` in a lesson snippet — expect `(2 3 4)`.
6. Open the REPL, define `(def release-check 41)`, then use the topbar
   **Restart runtime** control and evaluate `release-check` — expect an
   "unable to resolve symbol" error, proving the worker was replaced.
7. Make progress in a lesson, quit, relaunch — the lesson and progress are
   restored from the app-data `state.edn`. Check that the file exists in the
   platform app-data directory and that clearing the browser site data does not lose
   progress (the file is the source of truth; the browser only mirrors it).
8. Quit and check for orphans:
   - Linux/macOS: `pgrep -fl parens` (or `jps -l`) shows no app or worker JVM;
   - Windows: Task Manager shows no `Parens` or `java.exe` left behind.
9. Uninstall and confirm the app directory is gone; user data in the browser
   profile is expected to remain.

Repeat for Linux (`.deb` and `.rpm` if both are published), macOS (Apple
silicon and Intel if both are built), and Windows (`.msi` and `.exe`).

## 3. Known limitations to state in the release notes

- No code-signing certificates in CI means unsigned builds unless the secrets
  above are configured.
- The evaluator is a child JVM with a timeout and a temp working directory, not
  a security sandbox; it is intended for the learner's own code on their own
  machine.
- Progress is stored in the browser profile, so clearing site data resets it.
