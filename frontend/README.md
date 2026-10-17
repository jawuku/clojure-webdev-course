# Parens frontend

The React 19 UI, built with **Vite 7**. It is served by the local JVM app at
`desktop/resources/public`; there is no static deployment any more, because evaluation
requires the loopback server.

## Scripts

```bash
yarn install

yarn dev            # Vite dev server on :3000 (UI only — evaluations need the JVM app)
yarn build          # production bundle in dist/
yarn build:desktop  # build, then copy dist/ into ../desktop/resources/public
yarn check:offline  # fail if dist/ references any external script, style, or font
yarn smoke          # browser end-to-end test against desktop/target/parens-desktop.jar
```

`yarn dev` has no runtime token, so Run/Check answer show the "runtime not reachable"
banner. Use the desktop app (`lein uberjar` in `desktop/`, then run the jar) for
end-to-end work.

`yarn smoke` drives Chromium through every lesson in all three courses and checks
themes, search, the REPL, exercise checking, reload persistence, bundled fonts, and that
no console errors or external requests occur. Pass `--chrome PATH` or set `CHROME_PATH` to
use a system browser; otherwise Playwright's expected browser must be installed.

After changing the UI, run `yarn build:desktop` and include the resulting
`desktop/resources/public` changes with your commit. CI rebuilds the bundle and fails if
the committed copy is stale.

## Runtime transport

`src/lib/runtime.js` is the only module that talks to the server:

- `evalClojure(code)` → `POST /api/eval` with `{ code, ns }`
- `runExerciseTests(code, tests)` → `POST /api/exercise`
- `waitForRuntime()` → polls `GET /api/runtime` until the worker answers

The launch token comes from the URL fragment (`#token=…`), is kept in `sessionStorage`
so a reload still works, and is sent as `X-Parens-Token`. It is never written to a share
URL or a log.

## Content audit

`yarn audit:content` runs the entire course through the real worker: every runnable lesson
block, every exercise solution against its hidden tests, and every cheat-sheet example. It
starts the jar itself (`lein uberjar` in `../desktop` first) and prints eval latency against
a 150 ms p95 budget.

```bash
yarn audit:content                    # ratchet check
yarn audit:content --json /tmp/report.json
yarn audit:content --update-baseline  # after reviewing the report
yarn audit:content --update-values    # after reviewing changed values
```

`content-audit-baseline.json` records known content debt (JavaScript/ClojureScript
semantics waiting for Phases 3–5). A new failure fails, and an entry that starts passing
also fails until it is removed, so the baseline only shrinks.

`content-audit-values.json` records the expected value (`pr-str` of the last form) and printed
output of every passing snippet and cheat-sheet example, keyed by course and item. A changed
value, a passing item with no recorded entry, or an entry whose content disappeared all fail
the check. The one genuinely nondeterministic example (a `rand-int` demo) sets
`nondeterministic: true` on its block and is counted in the summary instead of asserted.
