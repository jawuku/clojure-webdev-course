# docs — Development Notes & QA History

This folder holds project documentation from the development process. **Nothing
here is used by the app itself** — the frontend never reads these files. They are
kept in the repo for transparency and future maintainers.

## Contents

### `PRD.md` — Product Requirements & development log

The product requirements document for the multi-course learning app ("Parens").
Its top section describes the **current** JVM/Vite app (Phases 0–7 complete); the rest is
the 2026-06 browser/SCI development log, kept for context. It records:

- The **original problem statement** (a beginner web-development course building on the
  existing Clojure course, originally written for ClojureScript in the browser).
- The **architecture** at the time it was written (React 19 / CRA+CRACO,
  SCI/Scittle in-browser evaluation, the reusable `buildCourse` engine,
  per-course namespaces). The app has since moved to a Vite build and a local
  JVM runtime; see `PHASE1_RESULTS.md` and `JVM_DESKTOP_MIGRATION_PLAN.md` for
  the current design. The browser course has since been replaced by the JVM
  Ring/Hiccup/HTMX course (`PHASE4_RESULTS.md`). The PRD's top section is the
  current summary; the older sections are explicitly historical.
- The **user personas** and core requirements.
- A **what's-been-implemented** history, including the notable decisions:
  the React 17 → 18 upgrade for live Reagent rendering, merging the standalone
  Regex course into the three-course app, the dual MIT + CC BY 4.0 licensing,
  and the decision to keep CRA instead of migrating to Vite.

It's the best starting point for understanding *why* the codebase looks the way
it does.

### `PHASE0_RESULTS.md` … `PHASE7_RESULTS.md` — migration QA history

One report per completed migration phase: the vertical JVM slice (Phase 0), the Vite UI
(Phase 1), the runtime API and content audit (Phase 2), the Clojure course on JVM semantics
(Phase 3), the Ring/Hiccup/HTMX web course (Phase 4), Regex on `java.util.regex`
(Phase 5), persistence/offline/packaging/launcher (Phase 6), and CI/docs/release
(Phase 7). Each records what changed, the measured numbers (startup, eval latency, audit
baselines, browser checks) and the remaining limitations. Phase 7 covers ESLint, the
per-OS browser matrix, the license/status documentation, and the "no hosted web build"
decision. `JVM_DESKTOP_MIGRATION_PLAN.md` is the plan those reports track.

### `RELEASE_CHECKLIST.md` — shipping a build

The manual install pass per OS, the signing/notarization secrets, and the automated gates
that must be green before tagging. CI already installs, checks and uninstalls every
package; this is the human half.

### `test_reports/` — Iteration QA history

One JSON report per development iteration (`iteration_1.json` … `iteration_10.json`),
written by the automated testing agent that ran end-to-end browser checks during
development. Each report captures:

- a **summary** of what was tested and the outcome,
- a **success rate** (e.g. `1.0` = 100%),
- **verified flows** / **detailed results** — the concrete user flows exercised
  (course switching, live Reagent components, Regex Golf leaderboard, per-course
  progress, console-error checks, …),
- **issues found** (backend/frontend, critical vs minor),
- **action items / critical code review comments**, and
- links to any screenshots captured at the time.

The reports are **historical artifacts** — chronological snapshots of the QA
process, not a current test suite. The current checks are ESLint (`yarn lint`), the Vite
build guards (`yarn check:offline`), the browser smoke test
(`frontend/scripts/smoke.mjs`, run by `.github/workflows/frontend-ci.yml` on Ubuntu, macOS
and Windows), the packaged offline smoke test
(`desktop/scripts/offline_smoke.mjs`, run on every installer in
desktop-ci.yml), the JVM security/worker suite, and the state-store tests
(`desktop/test/parens/state_test.clj` plus the `/api/state` cases in `api_test.clj`).
The older `frontend/scripts/audit-*.mjs` scripts (which drove Scittle in a browser) were
removed in Phase 2; they are replaced by the JVM content audit (`yarn audit:content`).

### `test_result.md` (removed)

The agent-to-agent testing-protocol template that previously sat at the repo root
was removed — it documented an obsolete dev-time workflow, superseded by the content audit
and CI.

> Note: `docs/test_credentials.md` is listed in `.gitignore` — this app has no
> auth or backend, so no credentials are expected; the ignore rule is just
> precautionary.
