# Phase 3 — Clojure course → JVM semantics: results

> **Historical snapshot.** The remaining Web Dev and Regex debt mentioned below has since
> shrunk: Phase 4 replaced Course 2, leaving only the 19 Regex entries for Phase 5. See
> [`PHASE4_RESULTS.md`](PHASE4_RESULTS.md).

**Status: PASS.** The Clojure course no longer refers to JavaScript or ClojureScript. Its
numbers, interop, errors and "What's Next" lessons now teach the JVM runtime they actually
run on, the cheat sheet's interop group is Java, and the static semantics guard is empty.
31 content failures remain in the other two courses, scheduled for Phases 4–5.

## What changed

| Area | Before | After |
| --- | --- | --- |
| Numbers | "numbers in this runtime are JavaScript numbers", `(/ 7 2)` described as 3.5 | exact ratios (`(/ 7 2)` → `7/2`), `double` for decimals, `Long/MAX_VALUE` overflow, `N`/`M`, `(= 1 1.0)` vs `(== 1 1.0)`, `0.1 + 0.2` |
| Division lesson | `/` described as JavaScript division | exact ratio result, decimal result when either operand is a decimal, `quot`/`rem` for whole numbers |
| Interop | "Talking to JavaScript", `js/Math.*`, `.-length`, `catch :default`, JS properties | "Talking to Java": `.method` calls, `Math/sqrt|round` plus bare `Math/PI`, constructors, `doto` on `java.util.ArrayList`, `java.time.LocalDate` |
| Errors | `(js/Error. …)`, `(catch :default e …)`, `(.-message e)` | `ex-info`, `(catch Exception e …)`/`Throwable`, `ex-message`, `ex-data` |
| Cheat sheet | "JavaScript Interop" (`.method`, `.-property`, `js/…`) | "Java Interop" (`.method`, `Math/…`, `java.time`) and a JVM `try`/`catch`/`finally` example |
| What's Next | ClojureScript/Reagent/`shadow-cljs` preview, `js/alert`, ClojureScript CTA | JVM web apps: Hiccup, Ring handlers, HTMX, CTA renamed "Start: Web Apps with Clojure" |

Two corrections came out of checking the runtime rather than trusting the plan's mapping:

- **`js/Math.max` → core `max`, not `Math/max`.** Java's `Math.max` takes exactly two
  arguments and rejects mixed numeric types (`(Math/max 3 9 2)` does not compile;
  `(Math/max 3 9.0)` throws). The three-argument exercises now use Clojure's variadic `max`,
  and `Math/*` is only used for `sqrt`/`round`/constants. `Math/sqrt` returns a double, so
  its examples expect `4.0`/`5.0`.
- **`js/Error` → `ex-info`/`Exception`**, with `ex-message` replacing `.-message`, so the
  lesson teaches idiomatic Clojure errors rather than a JS class.

## Verification

- `yarn check:semantics --strict`: **0 occurrences** of `js/`, `#js`, `clj->js`/`js->clj`,
  `.-length`, `cljs` or `catch :default`; `content-semantics-baseline.json` is now empty.
- `yarn audit:content`: **0 new, 0 fixed**, **0 Clojure failures** (37 lessons, 77 exercises).
  31 known failures remain: 12 in the Web Dev course (Phase 4) and 19 in Regex (Phase 5).
- Expected values: **358 asserted, 0 unrecorded, 0 stale, 1 nondeterministic**; the Clojure
  values were refreshed in the same change, as the audit requires.
- Eval latency: p50 **5.0 ms**, p95 **15.7 ms** over 526 calls (budget 150 ms).
- Browser pass (Chromium, 1440 px and 1024 px): the seven rewritten lessons render with no
  horizontal overflow in prose, notes, snippets or the cheat sheet, and all 31 runnable
  snippets in them evaluate through the UI with no error results (e.g. `[(/ 1 2) (/ 10 3)]`
  → `[1/2 10/3]`, `Math/PI` → `3.141592653589793`, `[9223372036854775808N 0.1M]`).
- `yarn build:desktop` + `yarn check:offline`: clean; the committed bundle was refreshed.

## Reproduce

```bash
cd desktop && lein test && lein uberjar
cd ../frontend
yarn check:semantics --strict   # no JavaScript semantics in the Clojure course
yarn audit:content              # 0 new / 0 fixed, no Clojure failures
yarn build:desktop && yarn check:offline
```

## Limitations / next

- The audit's snippet expectations are keyed by lesson and block position. Adding or removing
  a code block shifts later keys, so the values file must be refreshed
  (`--update-values`) whenever the course's block structure changes — review that diff, it is
  where an unintended output change would hide.
- Web Dev still runs on Reagent previews and JavaScript interop (Phase 4 replaces it); Regex
  still uses JavaScript regex semantics (Phase 5). The shared runtime, audit, value snapshot
  and semantics guard are ready for both.
- Signed/notarized desktop releases still need certificates; the local environment cannot run
  the browser smoke test, so that stays covered by CI.
