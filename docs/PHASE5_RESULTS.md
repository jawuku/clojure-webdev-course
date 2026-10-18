# Phase 5 — Regex → `java.util.regex`: results

**Status: PASS.** The Regex course now teaches and runs on Java's regex engine. Every
`#"..."` literal compiles to `java.util.regex.Pattern`, flags are inline `(?i)`/`(?m)`/`(?s)`,
named groups use `${name}` replacements and `re-matcher`/`.group`, and no JavaScript `RegExp`
API remains anywhere in the course. The audit baseline is empty: **0 known failures** across
all three courses.

## What changed

| Area | Before | After |
| --- | --- | --- |
| Engine | Taught through Clojure's API but executed by JavaScript `RegExp` (SCI) | `java.util.regex.Pattern`/`Matcher` in the worker, the same engine `re-find` uses |
| Flags | `(js/RegExp. "cat" "i")` and a note claiming inline flags were a JVM-only quirk | Inline `(?i)`, `(?m)`, `(?s)`, `(?U)` and scoped `(?i:…)`; `Pattern/compile` with flag constants for patterns built from strings |
| "Global flag" lesson | The JS `g` flag, `lastIndex`, `.test`/`.exec` statefulness, `.replace` interop | `str/replace` vs `str/replace-first`, `re-seq`, and driving a `Matcher` with `.find`/`.group`, including its statefulness and offset search |
| Named groups | `$<name>` replacements; `.exec` + `-groups` interop | `${name}` replacements; `re-matcher`, `.find`, `.group "name"` |
| Numbers | `js/parseInt` | `parse-long` |
| Lookbehind note | "works in modern browsers, not old environments" | Java's engine, including variable-length lookbehind since Java 9 |
| Cheat sheet | JS flags/`js/parseInt`/`$<name>` examples | Java examples, plus `re-matcher` and `Pattern/compile` entries |
| Wrap-up | "this course used the JavaScript flavour via ClojureScript" | "this course uses Java's engine (`java.util.regex`)"; CTA names Clojure, web development and Regex |
| Semantics guard | Scanned Clojure + Web Dev | Scans all three courses; adds `lastIndex`, `.exec`, `.-groups`; CI runs `--strict` |
| Audit | 19 known Regex failures | **0 failures**; 402 expected values asserted, 0 unrecorded, 0 stale |

Three findings came from running the real engine rather than assuming JavaScript semantics:

- **Named replacements need braces.** Java reads `${name}`; the JavaScript form `$<name>`
  throws `Illegal group reference` at match time. Positional `$1`/`$2` work unchanged.
- **Inline flags are native.** The old note told learners that `(?i)` was a sandbox
  leniency that would fail in real code. On the JVM it is the idiomatic form; the lesson now
  teaches it, plus `Pattern/compile` constants for dynamic patterns.
- **A `Matcher` is stateful.** The JavaScript `lastIndex` gotcha has a direct JVM analogue:
  `.find` advances the matcher, so reusing one continues from the previous match. The lesson
  shows the surprising second call and recommends a fresh matcher (or `re-find`).

## Verification

- `yarn audit:content`: **0 failures** (0 new, 19 fixed); Parens 37, Hiccup 19, Regex 18
  lessons clean.
  - 240 code blocks · 11 Hiccup previews · 149 exercise solutions · 152 cheat-sheet examples.
  - **402 expected values asserted, 0 unrecorded, 0 stale, 1 nondeterministic.**
  - Eval latency: p50 **15.5 ms**, p95 **49.1 ms** over 552 calls (budget 150 ms).
- `yarn check:semantics --strict`: **0 occurrences** across Clojure, Web Dev and Regex
  (15 tokens, including the new `lastIndex`/`.exec`/`.-groups`).
- `yarn smoke` (Chromium, local jar): **23/23 checks in 109.1 s** — all 74 lessons render,
  Hiccup previews and the capstone still pass, zero console errors, page errors, failed
  requests or external requests.
- `yarn build:desktop` + `yarn check:offline`: clean; the committed bundle is refreshed.
- `lein uberjar`: rebuilt with the new content.
- Regex Golf is unchanged: four holes, the same pars, and scoring still measures the pattern
  source length inside `#"…"`. Existing saved scores remain valid.

## Reproduce

```bash
cd frontend
yarn check:semantics --strict
yarn audit:content
yarn build:desktop && yarn check:offline
yarn smoke                # needs a Chromium; CI installs one
```

## Limitations / next

- The course now teaches the Java dialect. The differences that matter for learners are
  documented in the lessons rather than hidden: `\w`/`\d`/`\b` are ASCII unless `(?U)`,
  `$` can match before a final line terminator, and `str/split` drops trailing empty strings.
- Regex Golf solutions are Java patterns now; a pattern that relied on a JavaScript-only
  construct would need editing, but the four shipped holes were already portable.
- The packaged `.deb`/`.rpm`/app-image/installer rebuilds were not repeated locally; CI
  builds them, and the same content passed the jar-level suite.
- Phase 6 (persistence, offline, packaging polish) and Phase 7 (CI/docs/release) remain.
