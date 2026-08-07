# docs — Development Notes & QA History

This folder holds project documentation from the development process. **Nothing
here is used by the app itself** — the frontend never reads these files. They are
kept in the repo for transparency and future maintainers.

## Contents

### `PRD.md` — Product Requirements & development log

The original product requirements document for the multi-course learning app
("Parens"), kept up to date as a living development log. It records:

- The **original problem statement** (a beginner Web Development with
  ClojureScript course building on the existing Clojure course).
- The **architecture** (React 19 / CRA+CRACO, SCI/Scittle in-browser
  evaluation, the reusable `buildCourse` course engine, per-course SCI
  namespaces).
- The **user personas** and core requirements.
- A **what's-been-implemented** history, including the notable decisions:
  the React 17 → 18 upgrade for live Reagent rendering, merging the standalone
  Regex course into the three-course app, the dual MIT + CC BY 4.0 licensing,
  and the decision to keep CRA instead of migrating to Vite.

It's the best starting point for understanding *why* the codebase looks the way
it does.

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
process, not a current test suite. The *ongoing* automated checks live in
`frontend/scripts/audit-*.mjs`, which run on CI (see
`.github/workflows/cheat-audit.yml`) and verify every lesson snippet, exercise,
cheat-sheet example and live Reagent block still works.

### `test_result.md` (removed)

The agent-to-agent testing-protocol template that previously sat at the repo root
was removed — it documented an obsolete dev-time workflow, superseded by the
`audit-*.mjs` scripts and CI.

> Note: `docs/test_credentials.md` is listed in `.gitignore` — this app has no
> auth or backend, so no credentials are expected; the ignore rule is just
> precautionary.
