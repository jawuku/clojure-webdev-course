# Phase 7 — CI, Docs, Release

Status: **complete** (2026-10-18).

Phase 7 closes the migration plan: every gate the plan names runs in CI, the
browser suite runs on all three desktop targets, the repository documents what
ships and what does not, and the hosted-web question has a recorded answer.
Phase 6's file-backed state store is still open and is tracked in
[`JVM_DESKTOP_MIGRATION_PLAN.md`](JVM_DESKTOP_MIGRATION_PLAN.md).

## What Phase 7 added

### ESLint

- `frontend/eslint.config.mjs` — flat config over `src/**/*.{js,jsx}` and
  `scripts/**/*.mjs`: `@eslint/js` recommended, React Hooks recommended, and
  `react/jsx-uses-vars` (core `no-unused-vars` cannot see JSX usage on its own).
- `yarn lint` (`eslint src scripts --max-warnings 0`) is part of the Vite build
  job in CI.
- First run found nine findings, all fixed rather than suppressed:
  - `CodeEditor` assigned the latest `onChange`/`onRun` refs during render;
    they are now synced in an effect, so the editor still never captures a stale
    callback.
  - `CourseComplete` opened its celebration from a synchronous effect; it now
    derives the open state on mount and adjusts it during render when progress
    crosses 100%. A reloaded, already-complete course still celebrates once.
  - `SearchDialog` reset its query in an effect; the reset now happens when the
    dialog closes or a result is chosen.
  - Two unnecessary `\/` escapes in regex literals and two stale
    `eslint-disable` comments were removed.

### CI gates

| Gate | Workflow / job |
| --- | --- |
| `lein test` (API security + worker recovery + state store) | `desktop-ci.yml` · security |
| Full content audit (`yarn audit:content`) | `frontend-ci.yml` · content-audit |
| Static semantics guard (`yarn check:semantics --strict`) | `frontend-ci.yml` · content-semantics |
| Vite build + committed-bundle freshness + offline check | `frontend-ci.yml` · build |
| `yarn lint` | `frontend-ci.yml` · build |
| Browser smoke on Ubuntu, macOS and Windows | `frontend-ci.yml` · ui-smoke (matrix) |
| Install + `phase0_check.mjs` + `offline_smoke.mjs` per package | `desktop-ci.yml` · `.deb`, `.rpm`, app images, `.dmg`, `.msi`, `.exe` |

The per-OS smoke jobs share one uberjar artifact built on Ubuntu (a jar is
portable; `jpackage`, not the jar, is what needs each OS) and install the
matching Chromium before running `yarn smoke`. `fail-fast: false` keeps the
other two operating systems running when one fails.

### Release documentation

- [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) — the manual install pass per
  OS, signing/notarization secrets, and the automated gates that must be green
  first. CI's install/check/uninstall cycle is the machine-checked half; the
  checklist is the human half.
- README, PRD and the migration plan now state the same phase status.

### Hosted web build — not supported

Recorded decision: **Parens ships as a desktop app only.**

- The UI is served by the same JVM process that owns the evaluation worker.
  `/api/*` is bound to `127.0.0.1`, requires a per-launch token, and validates
  Host/Origin/`Sec-Fetch-Site`; a static host has no evaluator behind it.
- Hosting the app would mean running that JVM publicly and executing arbitrary
  learner code for anonymous users — a very different security and cost
  proposition, and one this project does not take on.
- `yarn dev` / `yarn preview` remain local development conveniences. The
  committed bundle in `desktop/resources/public` is an input to `jpackage`, not
  a deployable website.

### Licenses

No new license work was needed: [`LICENSE`](../LICENSE) is MIT for the source,
[`LICENSE-CONTENT.md`](../LICENSE-CONTENT.md) is CC BY 4.0 for all three
courses, and vendored HTMX keeps its own license (`frontend/public/vendor/`).

## Verification

Run locally on 2026-10-18:

- `yarn lint` — clean, `--max-warnings 0`.
- `yarn build:desktop` — rebuilds the bundle; `yarn check:offline` passes.
- `lein uberjar`, then `yarn smoke` with Chromium — **26/26 checks**, including
  all 74 lessons, search, REPL + reset, exercise persistence, the capstone Ring
  app, and zero console/page/request/external-origin errors.
- An ad-hoc Playwright check of the refactored celebration — **3/3**: opens when
  a course is already complete on load, stays closed after a reload, and opens
  when the final lesson is marked complete.
- Both workflows parse as valid YAML and every `desktop/`-relative step resolves
  to a real working directory.

## Limitations

- The new macOS/Windows smoke jobs and the packaging jobs run only on GitHub
  Actions; they were not executed locally.
- Signing/notarization remain release-time steps that need certificates and API
  keys (see the checklist).
- Phase 6's persistence and launcher work landed after this report; see
  [`PHASE6_RESULTS.md`](PHASE6_RESULTS.md).
