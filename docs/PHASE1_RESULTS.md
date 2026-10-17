# Phase 1 — Vite migration: results

**Status: PASS.** The Vite bundle is the UI the JVM app serves. It makes no external
requests, renders all 74 lessons across the three courses, and evaluates code through the
Phase 0 HTTP runtime instead of Scittle/SCI.

## What changed

| Area | Before | After |
| --- | --- | --- |
| Build | CRA 5 + CRACO 7 | Vite 7 + `@vitejs/plugin-react` |
| Entry | `public/index.html` + `%PUBLIC_URL%` | `index.html` at the Vite root |
| Evaluation | SCI/Scittle from jsDelivr | `src/lib/runtime.js` → `POST /api/eval` / `/api/exercise` |
| Reagent | React 18 + Scittle Reagent via `runtimeScripts` | read-only snippets until the JVM UI runtime (Phase 4) |
| Fonts | Google Fonts | three self-hosted latin variable woff2 files |
| Third-party scripts | Scittle, React/ReactDOM UMD, Reagent, `emergent-main.js` | none |
| CSP | `style-src 'self'` | `style-src 'self' 'unsafe-inline'` (CodeMirror injects a style element) |
| Static files | `slurp` (text only) | byte-accurate responses, so woff2/png survive |
| Deploy | `build/` on gh-pages | `dist/` copied into `desktop/resources/public` |

`desktop/resources/public` is the committed build output (hashed filenames, ~1.2 MB
including fonts). CI rebuilds it and fails if the committed copy is stale, and the
browser smoke test runs against the uberjar.

A real bug surfaced while testing: `@nextjournal/clojure-mode` 0.3.3 calls a
squint-compiled vector as a function when an opening bracket is typed over a non-empty
selection (`TypeError: from_to is not a function`). The editor already used CodeMirror's
`closeBrackets`, so the package's duplicate handler was dropped; the language, paredit
keymap and CodeMirror's `bracketMatching`/`indentOnInput` remain.

## Verification

Run on Linux, JDK 25, Node 24, Chromium 155 headless.

### Browser smoke (`frontend/yarn smoke`)

19/19 checks, 92.2 s. Highlights:

- **74/74 lessons** render: Clojure 37, Web Dev 19, Regex 18.
- Bundled **IBM Plex Sans / JetBrains Mono / Fraunces** load (`document.fonts`).
- Theme toggle works and survives reload; runtime is still reachable after reload
  (token kept in `sessionStorage`, stripped from the address bar).
- Search returns lessons and opens the selected one.
- REPL evaluates `(+ 1 2)` on the JVM (`user=> 3`).
- Exercise 0 is checked and marked solved, and the badge survives reload.
- **Zero** console errors, page errors, failed requests, or external requests.

### Server regression (`desktop/phase0_check.mjs`)

28/28 checks against the jar serving the real UI. Eval latency p50 8.4 ms / p95 13.7 ms
over 200 requests; timeout kill and `System/exit` recovery still pass. `lein test`:
16 tests / 71 assertions.

### Build guards

- `vite build` succeeds; JS 978.1 kB (313.1 kB gzip), CSS 46.9 kB (9.9 kB gzip);
  `dist/` is 1.2 MB including fonts.
- `yarn check:offline` finds no external `src`/`href`/`url(...)`, Google Fonts, jsDelivr,
  unpkg, Scittle, or emergent.sh references in `dist/`.
- `desktop/test/parens/api_test.clj` asserts the served HTML has no external
  `src`/`href`, and that a woff2 request returns the exact `wOF2` bytes.

## Limitations / carried forward

- **Lesson prose and semantics.** Several lessons still describe browser/JS behavior and
  use `js/` interop. They render, but some snippets error until Phase 3 rewrites them;
  the Web Dev course is the largest block. This is expected: Phase 1 froze the transport,
  not the content.
- **Reagent previews** are read-only placeholders. Phase 4 restores live components via
  the JVM UI runtime.
- **Exercise checks now require the server.** Pure-UI `yarn dev` cannot evaluate; the
  banner explains it.
- **Content audit gap.** The old Puppeteer/Scittle audit workflow was removed because it
  cannot drive the JVM runtime. Phase 2 replaces it with a Clojure-side audit of every
  snippet, solution, and test. Until then, the browser smoke covers representative flows
  only, not every code block.
- The bundle is a single ~977 kB chunk. Acceptable for a local app; code-splitting is a
  later optimization.

## Reproduce

```bash
cd frontend
yarn install --frozen-lockfile
yarn build:desktop
yarn check:offline
cd ../desktop
lein test
lein uberjar
node scripts/phase0_check.mjs --json /tmp/phase0.json
cd ../frontend
yarn smoke --json /tmp/ui-smoke.json      # add --chrome PATH if no bundled browser
```
