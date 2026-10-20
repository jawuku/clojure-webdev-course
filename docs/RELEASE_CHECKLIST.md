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

All of these must be green before tagging. Every installer artifact is a
`target/dist` directory holding the installer and `SHA256SUMS`; the Linux
`.deb`/`.rpm` artifacts add `SHA256SUMS.asc` when
`.github/workflows/desktop-release.yml` has a GPG key.

The macOS and Windows signing jobs in `desktop-release.yml` need these
repository secrets:

| Secret | Used for |
| --- | --- |
| `APPLE_SIGNING_IDENTITY`, `APPLE_CERT_P12_BASE64`, `APPLE_CERT_PASSWORD` | Developer ID signing |
| `APPLE_NOTARY_KEY_P8_BASE64`, `APPLE_NOTARY_KEY_ID`, `APPLE_NOTARY_KEY_ISSUER` | notarization |
| `WINDOWS_CERT_PFX_BASE64`, `WINDOWS_CERT_PASSWORD` | Authenticode signing |
| `LINUX_GPG_PRIVATE_KEY_BASE64` | optional — GPG signature over the Linux `SHA256SUMS` |
| `LINUX_GPG_KEY_ID`, `LINUX_GPG_PASSPHRASE` | optional — key selection and passphrase |

Without them, installers are unsigned: macOS Gatekeeper and Windows SmartScreen
will warn on first launch, and the Linux `SHA256SUMS` has no GPG signature. The
macOS and Windows `SHA256SUMS` files are always unsigned; for them the code
signature on the installer carries authenticity. That is acceptable for a
development build, not for a public release.

### Release key

The Linux jobs sign `SHA256SUMS` only when `LINUX_GPG_PRIVATE_KEY_BASE64` is
set. Before the first signed release, and after every rotation:

1. Create a dedicated signing key with
   `bash scripts/generate_release_key.sh --name … --email … --out …`, attach
   `parens-release-key.asc` to the `desktop-v*` release, and record the
   fingerprint in the release notes and below.
2. Store the armored secret key, base64-encoded, as
   `LINUX_GPG_PRIVATE_KEY_BASE64`, plus `LINUX_GPG_KEY_ID` and, for a protected
   key, `LINUX_GPG_PASSPHRASE`. Never commit the secret half or attach it to a
   release.
3. Run `desktop-release.yml` and confirm the fingerprint printed by
   `sign_linux.sh` in the job log matches the published one.

Creation, export, publishing and rotation commands are in
[`desktop/README.md`](../desktop/README.md#publishing-the-release-key); the
steps users follow are in
[Verifying a signed release](../desktop/README.md#verifying-a-signed-release).

**Release key** — `Parens releases <jawuku@users.noreply.github.com>`, created
2026-10-20, expires 2028-10-19, passphrase-protected: signing needs
`LINUX_GPG_PASSPHRASE` and fails rather than prompting without it.

```
6953 163A A328 002E 01D9  166F 39CC 9A29 063E 447B
```

Publish this grouped fingerprint in the release notes as well; users compare it
with `gpg --show-keys --with-fingerprint parens-release-key.asc`. Record the new
value here (and in the notes) after a rotation.

## 2. Manual install pass (per OS)

Use a machine or VM that has never had Parens installed. For each target:

1. Download the whole artifact directory from the workflow run and verify it
   before installing: it holds the installer and `SHA256SUMS`. Run
   `sha256sum -c SHA256SUMS` (`shasum -a 256 -c SHA256SUMS` on macOS; on
   Windows without Git Bash, `certutil -hashfile <installer> SHA256`). For
   Linux with a signature, fetch `parens-release-key.asc` from the release,
   compare its fingerprint with the published one, import it, then run
   `gpg --verify SHA256SUMS.asc SHA256SUMS` and confirm `gpg` prints that same
   fingerprint.
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
  above are configured. Every installer publishes a `SHA256SUMS`, but only the
  Linux one can be GPG-signed, and that signature is optional: without
  `LINUX_GPG_PRIVATE_KEY_BASE64`, `SHA256SUMS` proves the download is intact,
  not who built it. The macOS and Windows checksums are never GPG-signed;
  check their code signature instead (`codesign -dv --verbose=4`,
  `signtool verify /pa`). The Linux signature is only meaningful when users
  compare the key fingerprint with the one published in the release notes.
- The evaluator is a child JVM with a timeout and a temp working directory, not
  a security sandbox; it is intended for the learner's own code on their own
  machine.
- Progress lives in `state.edn` in the platform app-data directory; the
  browser profile only mirrors it, so clearing site data or the app window's
  profile keeps it. Deleting the app-data directory does reset progress.
