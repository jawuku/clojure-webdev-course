# Parens Desktop — JVM + Vite Migration Plan

Status: Phase 0 implemented and passing (see [`PHASE0_RESULTS.md`](PHASE0_RESULTS.md));
Phases 1–7 are still a proposal.

## Decisions (recorded)

- **D1 — Shell: plain JVM + local web UI.** A `jpackage` launcher starts a Ring/http-kit
  server on loopback and opens the UI in the user's browser (Chromium app-window mode when
  available). No JCEF, no Electron, no Tauri. This is a desktop app in the sense of
  "installed, offline, one double-click", not a native window.
- **D2 — Evaluation: killable child-JVM eval worker.** Real Clojure, not SCI.
- **D3 — Course 2: "Web Development with Clojure (JVM)"** using Ring + Reitit + Hiccup +
  HTMX. ClojureScript/Reagent content is archived, not carried forward.
- **D4 — Targets: Linux, macOS, Windows.** Installers are built per-OS in CI; `jpackage`
  cannot cross-build.
- **D5 — Content source of truth: keep JS lesson modules for now**, export JSON at build
  time for the JVM audit runner. EDN migration is a later cleanup.

The architecture stays portable to a real native webview later (Tauri/WebView2/WKWebView
would wrap the same local server), so this choice does not close that door.

## 1. Where the app is today

| Area | Current state |
| --- | --- |
| UI | React 19, CRA + CRACO, CodeMirror 6 (`@nextjournal/clojure-mode`), Tailwind/shadcn |
| Runtime | Scittle/SCI 0.7.27 from jsDelivr, plus React 18 UMD + Scittle Reagent from unpkg |
| Backend | None. 100% client-side; progress/theme in `localStorage` |
| Courses | 3 courses, 74 lessons, ~143 exercises, ~250 code/read/reagent blocks |
| Tests | Puppeteer audit scripts that drive the real page and wait for Scittle |
| Deploy | Static `frontend/build/` — also published to gh-pages and static hosts |

Course breakdown:

- **Clojure** — 37 lessons, 77 exercises. Teaches ClojureScript semantics: `js/Math`,
  `js/Error`, `catch :default`, JS numbers.
- **Web Dev (CLJS/Reagent)** — 19 lessons, 32 exercises. Live Reagent components rendered
  through React 18 `createRoot`.
- **Regex** — 18 lessons, 34 exercises. Taught through Clojure's regex API but executed on
  JavaScript `RegExp`: `js/RegExp`, `lastIndex`, `.exec`, `-groups`.

The course engine (`src/course/registry.js`, `buildCourse`) is already course-agnostic.
The non-portable parts are concentrated in `src/lib/sci.js`, `ReagentSnippet.jsx`,
`CourseContext.jsx` (CDN script injection), and browser-only storage in `AppContext.jsx` /
`golf.js`.

## 2. Target architecture

```
┌───────────────────────────── Parens JVM process ─────────────────────────────┐
│  http-kit + Ring on 127.0.0.1:<random port>                                  │
│    GET  /            → Vite dist/ (classpath resources)                      │
│    POST /api/eval    → eval worker                                           │
│    POST /api/exercise→ eval worker (fresh ns + tests)                        │
│    GET/PUT /api/state→ ~/.config/parens/state.edn                            │
│         │                                                                    │
│         │ stdin/stdout EDN                                                   │
│         ▼                                                                    │
│  child JVM eval worker  (clojure.core/eval, real Java)                       │
│         ▲                                                                    │
│         │ hard kill + restart on timeout / System/exit                      │
└──────────────────────────────────────────────────────────────────────────────┘
          ▲
          │  browser (app window, token-authenticated requests)
          │
   jpackage launcher ── opens http://127.0.0.1:<port>/#token=…
```

Key properties:

- **Real JVM Clojure.** Longs, ratios, BigInt/BigDecimal, `java.time`, real
  `java.util.regex`, Java interop.
- **No network at runtime.** No Scittle/Reagent/React UMD/Google Fonts. Vite bundles the UI;
  fonts are vendored; htmx is vendored for Course 2.
- **Crash-safe evaluation.** Student code cannot hang the app or the UI.
- **One course engine, three JVM-native courses.**

## 3. Decisions and rationale

### D1. Why plain JVM + local web UI

Zenthyr was evaluated and rejected for v1:

- `start-app!` always runs `npm run dev` and points JCEF at `localhost:<port>`; there is no
  production build path.
- `ensure-dependencies!` runs `npm install` on every cold start — unacceptable packaged.
- JCEF natives are downloaded into `./jcef-bundle` on first run.
- Window lifecycle is macOS-only; the library is alpha and not on Clojars (404).
- It is EPL-2.0, so a fork adds license and maintenance overhead.

`jpackage` + a loopback server removes all of that. Trade-offs we accept:

- It opens a browser tab/app window, not a native window. On Linux/Windows, try
  `chrome --app=http://…` / `msedge --app=…`; on macOS, `open -na "Google Chrome" --args
  --app=…`; fall back to the default browser.
- The launcher must own the server lifecycle: start, choose a port, wait for readiness, open
  the browser, and shut down when the server is stopped (tray/menu or a `--stop` command).
- Browser-based UI means the eval API is reachable by other local processes. See D3.

### D2. Why a child JVM worker

- One `(while true)` in-process freezes the app. On modern JDKs `Thread.stop` throws
  `UnsupportedOperationException` and `interrupt` does not break a tight loop, so process
  kill is the only reliable timeout.
- `SecurityManager` is permanently disabled in JDK 24+; do not design around it.
- SCI-on-JVM would be simpler but is still an interpreter and would not deliver real JVM
  semantics.

Protocol: newline-delimited EDN on stdin/stdout, one in-flight request at a time.
`{id, op, ns, code, tests}` → `{id, ok, value, output, error}`. `value` is `pr-str` of the
last form; `output` captures `*out*`/`*err*`. Exercise op mirrors today's
`runExerciseTests`: fresh `exerciseN` ns, `refer-clojure`, `str`/`set` aliases, bind
`answer`, run each test, return `{passed, results:[{test, ok, detail}], runError}`.

Worker cwd is a temp directory; app data lives elsewhere. Full sandboxing is out of scope:
learner code is local trusted code. Document that honestly.

### D3. HTTP API security (important)

A loopback eval endpoint is remote code execution for any page that can reach it. Required:

- Bind `127.0.0.1` only; never `0.0.0.0`.
- Generate a random token per launch; pass it to the browser in the URL **fragment**
  (`#token=…`, not sent to servers/logs); the frontend reads it and sends
  `X-Parens-Token` on every `/api/*` request. Reject requests without it.
- Validate `Host` (`127.0.0.1`/`localhost` only) to block DNS rebinding, reject
  cross-origin `Origin`, and send no CORS headers.
- Serve the UI with a strict CSP; no `unsafe-eval` needed.
- State endpoints write only under the app data dir.
- Keep the server off the network and add a request-body size limit.

### D4. Course 2 shape

**"Web Development with Clojure (JVM)" — Ring + Reitit + Hiccup + HTMX.**

- Chapter 1 (web foundations, HTML/CSS/JS) carries over.
- Chapter 3 (Hiccup) carries over almost verbatim. Preview by calling
  `hiccup.core/html` in the worker and rendering the returned HTML in a **sandboxed
  iframe** (`srcdoc`, no scripts) — simpler and more truthful than a React Hiccup renderer.
- Chapter 2 becomes "Clojure on the server": Ring request/response maps, handlers,
  middleware, serving HTML.
- Chapter 4 becomes interactive UI: forms, HTMX attributes, server-held state, a to-do
  capstone running as a real Ring app on an app-local port in an iframe.
- Chapter 5: Reitit routing, JSON/EDN APIs, `deps.edn`/uberjar, deployment.
- Archive the CLJS/Reagent lessons under `docs/archive/` (or a disabled course id) rather
  than deleting them.

Alternative considered: a "JVM Clojure in practice" course (interop, concurrency, deps,
data). Loses the web identity; can be a fourth course later.

### D5. Content source of truth

Keep the JS lesson modules. Add `scripts/export-courses.mjs` → `resources/courses.json`,
consumed by the JVM audit runner. Converting ~250 blocks to EDN is not worth doing during
the semantic rewrite.

## 4. Phase plan

### Phase 0 — Vertical slice (2 days; gate)

Prove the whole shape with the current build, before restructuring:

1. Minimal `lein` project: http-kit server on a free loopback port serves `frontend/build/`
   from the classpath and exposes `POST /api/eval`.
2. Eval worker round-trip: `(+ 1 2)` → `3`; `println` captured; exception → clean message.
3. Timeout: `(while true)` returns an error in <2 s, worker restarts, next eval works;
   `(System/exit 0)` kills only the worker.
4. Token + Host + Origin checks; verify a request without the token is rejected.
5. `jpackage` app-image on Linux; confirm the launcher opens the UI and shuts the server
   down. Repeat on macOS/Windows in CI or a VM.
6. Measure: cold start, warm eval p95 (target <150 ms), memory (two JVMs).

Result: all six items completed on Linux. macOS and Windows app images now build and
pass the checker in CI; native installers remain a Phase 6 task, not a Phase 0 blocker.

**Gate:** if jpackage or the two-process model fails on a target OS, fix it here before any
content work. This is now a low-risk spike, not a shell bake-off.

**Status (2026-10-17): PASS.** Implemented in `desktop/`; full results and raw JSON in
[`docs/PHASE0_RESULTS.md`](PHASE0_RESULTS.md). 28/28 checks pass on both the uberjar and
the Linux app-image. Measured: 1.39 s to the UI (1.69 s packaged), 2.70 s to the first
eval (3.32 s packaged), warm eval p95 ~15 ms (14 ms packaged), 2.02 s timeout wall,
~1.2–1.5 s worker recovery, no orphan processes, ~238 MB RSS for both JVMs (shared host,
load average ~3.7; startup figures are upper bounds). Findings that affect later phases:
start the HTTP server before the worker; launch the AOT worker class directly; `jpackage`
strips native commands (no `bin/java`), and NixOS needs zlib bundled; the
token/Host/Origin checks now run in CI as the security boundary (`desktop/test`,
`.github/workflows/desktop-ci.yml`). The build is pinned to JDK 25 LTS. The same
app-image build also passes 28/28 on Ubuntu 24.04 and 26.04 (the former with an
installable `.deb`), Fedora 43 (with an installable `.rpm`), and on macOS (arm64) and
Windows (x64) in CI. Those last two are app images, not `.dmg`/`.msi` installers.

### Phase 1 — Vite migration (~4 days)

- Keep the Maven-style layout but make Vite the UI build: `vite.config.js`
  (`@vitejs/plugin-react`, alias `@` → `/src`, `strictPort: true`, `outDir: "dist"`),
  `index.html` at the Vite root, `dist/` copied into `resources/public` by the build.
- Delete `craco.config.js`, `plugins/health-check/`, `@emergentbase/visual-edits`,
  `react-scripts`, `gh-pages`; remove `%PUBLIC_URL%` and CRA env usage.
- Vendor fonts into `public/fonts` + `@font-face`; remove Google Fonts.
- Remove Scittle/React/Reagent/emergent script tags.
- Add `src/lib/runtime.js` with the final API shape, backed by the HTTP client from Phase 0;
  delete `sci.js` imports from components.
- Replace `ReagentSnippet` with `HiccupSnippet` (iframe preview) or hide it until Phase 4.

**Acceptance:** `vite build` + the JVM server renders all 74 lessons (runtime still stubbed
where needed), themes/search/REPL shell work, zero console errors, zero external requests.

### Phase 2 — Runtime API + content audit (~5 days)

- Finish `parens.runtime` and `parens.api`: eval, exercise, set-ns, runtime-info,
  reset-runtime.
- `runtime.js` transport + update `RunnableSnippet`, `Exercise`, `Repl`, `CheatSheet`, `App`.
- Build the Clojure content audit: export lessons to JSON, run every `code` block, every
  exercise solution, and every exercise test in the worker, per course namespace. Replace
  the Puppeteer/Scittle audit scripts with this as the primary regression harness.
- Add a browser-mode Playwright smoke test against the real server.

**Acceptance:** every exercise solution passes; every snippet runs; timeout recovery and
token rejection are covered by tests; eval p95 < 150 ms.

### Phase 3 — Clojure course → JVM semantics (~5 days)

- `js/Math.max|sqrt|round` → `Math/max|sqrt|round`; `js/Error` → `ex-info`/`Exception`;
  `js/parseInt` → `parse-long`/`Integer/parseInt`; `(.-length s)` → `(count s)`.
- `(catch :default e …)` → `(catch Exception e …)` / `Throwable`.
- Rewrite the numbers lesson: `(/ 1 2)` → `1/2`, `(/ 10 3)` → `10/3`, `(= 1 1.0)` false,
  `(== 1 1.0)` true, Long overflow, `N`/`M` suffixes, `0.1 + 0.2`, `class`/`type`.
- Rewrite "Talking to JavaScript" as "Talking to Java": constructors, statics, `.method`,
  `.-field`, `doto`, `java.time`, Java collections.
- Update the cheat sheet's JS Interop group and the "What's Next" CTA.
- Fix every expected output/test that encoded JS semantics (the audit finds them).

**Acceptance:** no `js/`, `#js`, `cljs`, or `catch :default` in the course; 37 lessons run
clean; 77 exercises pass.

### Phase 4 — Course 2 replacement (~8 days)

Build the Ring/Hiccup/HTMX course described in D4.

**Acceptance:** 19 lessons; Hiccup previews render through `hiccup.core/html` in a sandboxed
iframe; the capstone is interactive end-to-end on a local Ring app; no Reagent, React UMD,
or Scittle anywhere.

### Phase 5 — Regex → `java.util.regex` (~4 days)

- Flags lesson: real `(?i)`, `(?m)`, `(?s)`, `(?U)`, `(?x)`, `Pattern/compile` flags.
- Delete `js/RegExp`, `lastIndex`, `.test` global-state material; teach `re-find`/`re-seq`/
  `re-matches` and (optionally) `re-matcher` + `.find`.
- `js/parseInt` → `parse-long`; named groups → positional `re-find` destructuring or
  `(.. (re-matcher p s) (group "year"))`.
- Verify `$1`/`$<name>` replacements, Unicode classes, lookbehind, backreferences,
  `str/split` limits.
- Update `regexCheatsheet.js`, golf hints, and the regex wrap-up.

**Acceptance:** no JS-regex API remains; 18 lessons and 34 exercises pass; golf scoring
still measures the pattern source length.

### Phase 6 — Persistence, offline, packaging (~5 days)

- Replace `localStorage` with a platform app-data `state.edn` (atomic write): theme, font,
  progress, last location, active course, golf scores. Browser fallback behind one store
  API. Optionally import old `localStorage` keys.
- Fully offline: no JCEF (already), no CDN, no first-run downloads. Add an offline smoke
  test and a "Reset runtime" action.
- `jpackage` per OS in a GitHub Actions matrix (Linux `.deb`/`.rpm`/app-image, macOS
  `.dmg`, Windows `.msi`/`.exe`); JDK 25 LTS (already pinned in Phase 0); app icon,
  version, license files. Ubuntu `.deb` and Fedora `.rpm` packaging paths already exist
  (`desktop/scripts/build_deb.sh`, `build_rpm.sh`); the `.deb`, `.rpm`, and app-image
  jobs run in CI, including macOS and Windows app images. `.dmg`/`.msi`/`.exe`
  installers, code signing, and macOS notarization remain — signing needs certificates,
  so call it out as a release cost.
- Account for jpackage runtime quirks found in Phase 0: `--strip-native-commands` can
  leave no `bin/java` (the worker needs one; confirmed on Ubuntu 24.04 and Fedora 43
  with Temurin as well), and NixOS needs zlib bundled. Handle these per platform in the
  build script rather than by hand.
- Launcher: single-instance lock, fixed-or-free loopback port, wait-for-ready, browser
  app-window with fallback, clean shutdown, window size irrelevant (browser owns it).
- Keep `?lesson=` / `?view=` deep links.

**Acceptance:** fresh offline install on all three OSes opens the UI, runs code, persists
progress across restarts, survives a runaway snippet, and leaves no orphan JVMs on quit.

### Phase 7 — CI, docs, release (~3 days)

- CI: Clojure tests + full lesson audit, Vite build, ESLint, Playwright smoke test per OS.
  Manual install smoke per OS.
- Update `README.md`, `docs/PRD.md`, this plan's status, licenses (MIT app + CC BY content;
  htmx and any vendored assets keep their own licenses).
- Decide whether a hosted web build remains supported. The HTTP split makes it nearly free,
  but it needs a real server and is not required.

## 5. Order and parallelism

```
Phase 0 ──► Phase 1 ──► Phase 2 ──┬─► Phase 3 (Clojure content) ──┐
                                  ├─► Phase 4 (Course 2) ─────────┼─► Phase 6 ──► Phase 7
                                  └─► Phase 5 (Regex) ────────────┘
        └── content audit harness can start in parallel with Phase 0/1
```

Phases 3–5 are independent once the runtime contract is frozen. Phase 6 can start once
Phase 0's jpackage result is in.

Rough effort: ~36 dev-days solo (≈7 weeks), or ~4 weeks with two people on the content
phases. The 74-lesson audit is the long pole, not the backend.

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Loopback API abused by another local page/process | Medium | High | 127.0.0.1 + per-launch token + Host/Origin checks + CSP; test rejection |
| Runaway/hostile student code | High | Medium | Child process, hard kill, temp cwd; document no true sandbox |
| JS→JVM semantic drift in lessons | High | Medium | Automated full-content audit in Phase 2; lesson-by-lesson migration |
| Course 2 rewrite scope | High | Medium | Freeze the syllabus before writing; archive old content |
| Browser vs native-window UX | Medium | Low | Chromium `--app` mode; keep the local server so a webview wrapper can be added later |
| `jpackage` per-OS/CI complexity | Medium | Medium | Phase 0 Linux proof, CI matrix, JDK 25 LTS; signing deferred |
| `localStorage` → file store bugs | Medium | Medium | One store API, browser fallback, migration test |
| Regex engine differences | Medium | Low | Per-example audit; JVM regex is mostly a superset |
| Orphan JVMs on quit | Medium | Low | Shutdown hook, parent-death detection in worker, CI process check |

## 7. What I would not do

- Keep SCI as a second evaluator "just in case". It defeats the JVM goal and doubles the
  semantics you must test.
- Evaluate untrusted code in-process. One tight loop kills the app and there is no supported
  way to stop it.
- Expose the eval API on anything but loopback, or without a per-launch token.
- Rely on `SecurityManager` or a symbol blacklist for safety.
- Rewrite all 74 lessons before the runtime contract and audit harness exist.
- Migrate to EDN, Vite, and JVM semantics all at once. Sequence them.

## 8. Recommended next step

**Phase 0 is done (PASS). Proceed to Phase 1 (Vite migration) and start the content audit
harness in parallel.** The slice already provides the runtime API, so the frontend work is
built against a real transport rather than a guess. The audit harness is independent and
becomes the safety net for Phases 3–5, so it should not wait for the UI migration.

Carry two items from Phase 0 into CI: an integration test for worker timeout/`System.exit`
recovery, and the token/Host/Origin rejection tests, which are the security boundary for
the loopback eval API.
