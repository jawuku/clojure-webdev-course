# Parens frontend

The React 19 UI, built with **Vite 7**. It is served by the local JVM app at
`desktop/resources/public`; there is no static deployment any more, because evaluation
requires the loopback server.

## Scripts

```bash
yarn install

yarn dev            # Vite dev server on :3000 (UI only — evaluations need the JVM app)
yarn lint           # ESLint (JS + React hooks), zero warnings allowed
yarn build          # production bundle in dist/
yarn build:desktop  # build, then copy dist/ into ../desktop/resources/public
yarn check:offline  # fail if dist/ references any external script, style, or font
yarn check:semantics # fail on retired JS/ClojureScript forms in Clojure + Web Dev
yarn audit:content  # run every snippet, Hiccup preview, exercise and cheat-sheet example
yarn smoke          # browser end-to-end test against desktop/target/parens-desktop.jar
```

`yarn dev` has no runtime token, so Run/Check answer show the "runtime not reachable"
banner. Use the desktop app (`lein uberjar` in `desktop/`, then run the jar) for
end-to-end work.

## State

`src/lib/store.js` is the only module that touches storage. In the desktop app the
source of truth is `state.edn` in the platform app-data directory, reached through
`GET/PUT /api/state` (see `desktop/README.md`). `hydrateStore()` runs in `index.jsx`
before React renders and copies every bucket into a `localStorage` mirror, which is
what `public/theme-init.js` reads for flash-free first paint. On the first launch after
upgrading from the browser-only build, existing `localStorage` buckets are uploaded
once. Without a server (`yarn dev`, or the JVM gone) the mirror is the fallback store.

`readBucket`/`writeBucket`/`removeBucket` are synchronous (the mirror updates first,
the file write is queued in the background), so components never wait on the network.

`yarn smoke` drives Chromium through every lesson in all three courses and checks
themes, search, the REPL, exercise checking, reload persistence, bundled fonts, a Hiccup
preview in its sandboxed iframe, the capstone Ring app (add + toggle), and the topbar's
**Restart runtime** control (definitions vanish, the page keeps working), and that no
console errors or external requests occur. Pass `--chrome PATH` or set `CHROME_PATH` to
use a system browser; otherwise Playwright's expected browser must be installed.

After changing the UI, run `yarn build:desktop` and include the resulting
`desktop/resources/public` changes with your commit. CI rebuilds the bundle and fails if
the committed copy is stale.

## Linting

`yarn lint` runs ESLint over `src/` and `scripts/` with `@eslint/js` recommended rules,
`eslint-plugin-react-hooks`, and `react/jsx-uses-vars` (the core unused-vars rule cannot
see JSX usage by itself). Warnings fail the build (`--max-warnings 0`). The CI build job
runs it before `yarn build:desktop`.

CI also runs `yarn smoke` on Ubuntu, macOS and Windows. All three share one uberjar
artifact; only the browser install differs per OS.

## Course content

Lesson data lives in `src/data/` and the three courses are assembled in `src/course/`.
Content blocks are rendered by `LessonView.jsx`:

| Block | Meaning |
| --- | --- |
| `p`, `h`, `note`, `list`, `cta` | Prose, headings, callouts, lists and cross-course CTAs |
| `code` | Editable, runnable Clojure (`POST /api/eval`) |
| `hiccup` | Editable Hiccup form; the worker renders it with the real `hiccup.core/html` (`POST /api/hiccup`) and the UI shows it in a sandboxed iframe |
| `read` | Read-only syntax-highlighted sample |
| `live-app` | The Course 2 capstone: a real Ring app in an iframe, driven by HTMX (`LiveApp.jsx`, `/preview/todos`) |
| `golf-board` | Regex Golf leaderboard (Regex course) |

Exercises are auto-checked in a fresh `exerciseN` namespace in the worker. The Web Dev
course is JVM-only: `yarn check:semantics --strict` rejects ClojureScript/Reagent/Scittle
forms, and CI runs that check over the Clojure and Web Dev courses.

## Runtime transport

`src/lib/runtime.js` is the only module that talks to the server:

- `evalClojure(code)` → `POST /api/eval` with `{ code, ns }`
- `renderHiccup(code)` → `POST /api/hiccup`; the worker renders with `hiccup.core/html`
- `runExerciseTests(code, tests)` → `POST /api/exercise`
- `startPreview()` → `POST /api/preview/session`, then the capstone iframe loads
  `/preview/todos` (cookie-gated, not token-gated)
- `waitForRuntime()` → polls `GET /api/runtime` until the worker answers

The launch token comes from the URL fragment (`#token=…`), is kept in `sessionStorage`
so a reload still works, and is sent as `X-Parens-Token`. It is never written to a share
URL or a log.

## Content audit

`yarn audit:content` runs the entire course through the real worker: every runnable lesson
block, every Hiccup preview (through `hiccup.core/html`), every exercise solution against
its hidden tests, and every cheat-sheet example. It starts the jar itself (`lein uberjar`
in `../desktop` first) and prints eval latency against a 150 ms p95 budget.

```bash
yarn audit:content                    # ratchet check
yarn audit:content --json /tmp/report.json
yarn audit:content --update-baseline  # after reviewing the report
yarn audit:content --update-values    # after reviewing changed values
```

`content-audit-baseline.json` records known content debt and is empty since Phase 5: all
three courses are clean. A new failure fails, and an entry that starts passing also fails
until it is removed, so the baseline only shrinks.

`content-audit-values.json` records the expected value (`pr-str` of the last form) and printed
output of every passing snippet and cheat-sheet example, keyed by course and item. A changed
value, a passing item with no recorded entry, or an entry whose content disappeared all fail
the check. The one genuinely nondeterministic example (a `rand-int` demo) sets
`nondeterministic: true` on its block and is counted in the summary instead of asserted.

## Content semantics

`yarn check:semantics` is the static companion to the runtime audit. It walks every string in
all three courses — all block types including `read`, prose, exercise prompts, starters,
solutions, hints and tests, and cheat-sheet items — and fails on `js/`, `#js`,
`clj->js`/`js->clj`, `.-length`, `cljs`, `catch :default`, the retired
ClojureScript/Reagent/Scittle forms, and the JavaScript RegExp API (`lastIndex`, `.exec`,
`.-groups`). The JVM audit cannot see any of those places, so this is the gate that keeps
the old browser-runtime semantics from creeping back in.

```bash
yarn check:semantics                  # ratchet check against the baseline
yarn check:semantics --json /tmp/semantics.json
yarn check:semantics --update-baseline  # after reviewing the occurrences
yarn check:semantics --strict         # CI gate: no occurrences at all
yarn check:semantics --course webdev  # scan one course
```

`content-semantics-baseline.json` lists the occurrences still present, keyed by
course, lesson and field (list indexes are collapsed, so moving a block does not churn the
file). New occurrences fail, and entries that no longer occur fail until removed, so the list
only shrinks. `--strict` ignores the baseline and fails while anything remains.
