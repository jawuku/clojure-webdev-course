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

All of these must be green before tagging. The Linux `.deb` and `.rpm` artifacts
are `target/dist` directories holding the package, `SHA256SUMS`, and — when
`.github/workflows/desktop-release.yml` has a GPG key — `SHA256SUMS.asc`.

The macOS and Windows signing jobs in `desktop-release.yml` need these
repository secrets:

| Secret | Used for |
| --- | --- |
| `APPLE_SIGNING_IDENTITY`, `APPLE_CERT_P12_BASE64`, `APPLE_CERT_PASSWORD` | Developer ID signing |
| `APPLE_NOTARY_KEY_P8_BASE64`, `APPLE_NOTARY_KEY_ID`, `APPLE_NOTARY_KEY_ISSUER` | notarization |
| `WINDOWS_CERT_PFX_BASE64`, `WINDOWS_CERT_PASSWORD` | Authenticode signing |
| `LINUX_GPG_PRIVATE_KEY_BASE64` | optional — GPG signature over the Linux `SHA256SUMS` |
| `LINUX_GPG_KEY_ID`, `LINUX_GPG_PASSPHRASE` | optional — key selection and passphrase |

Without them, builds are unsigned: macOS Gatekeeper and Windows SmartScreen
will warn on first launch, and the Linux packages ship an unsigned
`SHA256SUMS`. That is acceptable for a development build, not for a public
release.

## 2. Manual install pass (per OS)

Use a machine or VM that has never had Parens installed. For each target:

1. Download the installer from the workflow run and verify it before installing.
   For Linux, take the whole artifact directory (package, `SHA256SUMS`, and
   `SHA256SUMS.asc` when signed) and run `sha256sum -c SHA256SUMS`; with a
   signature, first import the release key and run
   `gpg --verify SHA256SUMS.asc SHA256SUMS`. The macOS and Windows artifacts
   publish no checksum file yet, so this step cannot be completed for them.
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
   The same applies to the app window's isolated browser profile: deleting
   `<app-data>/browser-profile` must not lose progress either.
8. Quit and check for orphans:
   - Linux/macOS: `pgrep -fl parens` (or `jps -l`) shows no app or worker JVM;
   - Windows: Task Manager shows no `Parens` or `java.exe` left behind.
9. Uninstall and confirm the app directory is gone; the app-data directory
   (`state.edn`, browser profile) is expected to remain.

Repeat for Linux (`.deb` and `.rpm` if both are published), macOS (Apple
silicon and Intel if both are built), and Windows (`.msi` and `.exe`).

## 3. Known limitations to state in the release notes

- No code-signing certificates in CI means unsigned builds unless the secrets
  above are configured. Only the Linux packages publish a checksum, and its
  GPG signature is optional: without `LINUX_GPG_PRIVATE_KEY_BASE64`,
  `SHA256SUMS` proves the download is intact, not who built it. macOS and
  Windows installers have no published checksum.
- The evaluator is a child JVM with a timeout and a temp working directory, not
  a security sandbox; it is intended for the learner's own code on their own
  machine.
- Progress lives in `state.edn` in the platform app-data directory; the
  browser profile only mirrors it, so clearing site data or the app window's
  profile keeps it. Deleting the app-data directory does reset progress.
