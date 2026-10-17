# Phase 2 — Runtime API + content audit: results

**Status: PASS.** The runtime API is complete, the content audit runs every snippet, exercise
solution and cheat-sheet example in the real worker, and both runtime bugs it exposed are
fixed. 44 known content-migration failures are recorded in a shrinking baseline; everything
else passes at p95 16.5 ms.

## Runtime API

| Endpoint | Change |
| --- | --- |
| `POST /api/set-ns` | **New.** `{ns}` selects the default evaluation namespace. Validated with the same symbol rule as eval. |
| `POST /api/eval` | `ns` is now optional and defaults to the active namespace from `set-ns`. |
| `GET /api/runtime` | Now includes `active-ns` alongside `pid`, `clojure`, `java`, `timeout-ms`, `server-pid`. |
| `POST /api/exercise` | Unchanged: fresh `exerciseN` namespace, hidden tests, per-test detail. |
| `POST /api/reset` | Unchanged: kills and restarts the worker, returns fresh runtime info. |

The UI still sends `ns` on every eval (so a dropped `set-ns` request cannot misroute code)
and now also calls `set-ns` best-effort when the runtime is ready. The server keeps the
active namespace outside the worker, so restarts do not lose it.

## Two real bugs the audit found

1. **Multi-form code was compiled as one `(do …)`.** A snippet or exercise like
   `(defprotocol Shape …) (defrecord Square … Shape …)` failed with "Unexpected error
   macroexpanding defrecord", because `Square` was compiled before the protocol class
   existed at runtime. The worker now reads and evaluates top-level forms one at a time,
   exactly like a REPL; exercise `answer` is bound to the last form's value. This fixed the
   protocol/record/reify exercises without weakening them.
2. **Compiler errors lost their cause.** `CompilerException` only says "Syntax error
   compiling at (0:0)". Errors now include the cause chain, e.g.
   `caused by: java.lang.RuntimeException: No such namespace: js`, which is what made the
   audit report actionable (and improves learner-facing errors).

## Content audit

`frontend/scripts/audit-content.mjs` (`yarn audit:content`):

- Loads the course modules through Vite (`ssrLoadModule`), so it audits the real data.
- Starts the jar (or uses `--url`), sets each course namespace, then runs:
  - **222** `{t: "code"}` lesson blocks
  - **143** exercise solutions against their hidden tests
  - **153** cheat-sheet examples
  - 28 `read`/`reagent` blocks are intentionally not runnable and skipped
- Records per-item failures as JSON, checks the p95 eval budget (150 ms; measured **16.5 ms**),
  and exits non-zero on regressions.
- `frontend/content-audit-baseline.json` lists the 44 known failures (21 snippets of 222,
  11 exercise solutions of 143, 12 cheat-sheet examples of 153): 13 Clojure, 12 Web Dev,
  19 Regex. Every one is JavaScript/ClojureScript semantics scheduled for Phases 3–5:
  `js/…`, `.-length`, `clj->js`/`js->clj`, `catch :default`, JS `RegExp` flags,
  `$<name>` replacement and `.exec` on named groups.
- **Ratchet:** a failure not in the baseline fails CI, and a baseline entry that starts
  passing also fails until removed. The list can only shrink. Refresh after reviewing a
  report with `yarn audit:content --update-baseline`.

The old Puppeteer/Scittle audits (`audit-cheatsheet`, `audit-snippets`, `audit-exercises`,
`audit-reagent`) and their helper were removed: they cannot run without SCI and the new
audit supersedes them. Exercise values are still asserted by the hidden tests. Snippet and
cheat-sheet **output values** are not asserted yet; that belongs with the Phase 3 content
work.

## Verification

- `lein test`: **21 tests, 87 assertions, 0 failures** — includes defprotocol/defrecord,
  reify, cause-chain reporting, `set-ns` validation, timeout recovery, `System/exit`, and
  token/Host/Origin rejection.
- `phase0_check.mjs`: **31/31** against the jar, including set-ns → eval-without-ns →
  `active-ns` in runtime info, plus the original security, timeout and packaging checks.
- `yarn audit:content`: **0 new, 0 fixed** against the baseline; 474/518 calls pass;
  p50 4.9 ms / p95 16.5 ms / max 982 ms.
- `yarn smoke`: **19/19** browser checks still pass with `set-ns` wired in.
- `yarn build:desktop` + `yarn check:offline`: clean; the committed bundle was refreshed.

## Reproduce

```bash
cd desktop && lein test && lein uberjar
cd ../frontend
yarn audit:content                    # ratchet check against the baseline
yarn audit:content --json /tmp/audit.json
yarn audit:content --update-baseline  # only after reviewing the report
```

## Limitations / next

- The 44 baseline entries are real content debt. Phase 3 fixes the Clojure course, Phase 4
  the Web Dev course, Phase 5 Regex; each fix should remove its baseline entry in the same
  change (the audit fails otherwise).
- The audit proves code runs, not that every printed value matches the lesson prose. The
  Phase 3 audit work should add expected-value assertions, starting with the cheat sheet.
- Eval p95 is far inside budget, but the slowest call was 982 ms (worker start), which the
  UI hides behind the “Starting the local Clojure runtime…” state.
