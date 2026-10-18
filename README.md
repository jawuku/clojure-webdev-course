# Parens — Learn Clojure on a Local JVM

An interactive, **multi-course** learning platform that teaches **Clojure**, then
**Web Development with Clojure** (Ring, Hiccup and HTMX on the JVM), plus a standalone
**Regular Expressions** course, to complete beginners. Every lesson is written in plain English, code examples are
syntax-highlighted, and **code runs in a real JVM inside the app** — not in a browser
sandbox, and with no network connection once the app has launched.

- **Course 1 — Parens · Learn Clojure:** 37 lessons from first principles (values,
  functions, collections, higher-order functions, recursion, macros/protocols).
- **Course 2 — Hiccup · Web Dev with Clojure:** 19 lessons that build on Course 1 —
  the design of the WWW, HTML/CSS/JS, **Ring** requests and responses, middleware,
  **Hiccup** previews rendered by `hiccup.core/html`, **HTMX** attributes, routing and
  JSON, culminating in a live to-do app running as a real local Ring server.
- **Course 3 — Regex · Master Regular Expressions:** 18 lessons taught through Clojure's
  regex tools (`re-find`, `re-seq`, `re-matches`, `str/replace`) on Java's engine
  (`java.util.regex`), covering everything from literals to lookarounds, named groups and a
  live **Regex Golf leaderboard**.

Switch between courses any time with the **course switcher** in the sidebar. Progress,
theme and last position are saved **per course** in the app-data `state.edn` (with a
`localStorage` mirror for first paint and a browser fallback).

Parens is a desktop app: a small Clojure server binds to **127.0.0.1**, serves the Vite
UI, and forwards learner code to a separate, killable **worker JVM**. Every API call
carries a per-launch token, and the server refuses foreign Host/Origin requests. The app
ships its own fonts and assets; there is no CDN and no analytics.

> **Migration status:** Phases 0 (JVM slice), 1 (Vite UI), 2 (runtime API + content
> audit), 3 (Clojure course on JVM semantics), 4 (JVM web course), 5 (Regex on
> `java.util.regex`), 6 (persistence, offline, packaging and launcher polish) and 7
> (CI, docs, release) are complete. Progress lives in the app-data `state.edn`; the app
> runs one instance per install (a second launch opens the running window), survives a
> runaway snippet, opens in a Chromium app window when available, and ships offline
> installers for all three OSes. The audit has no known failures left and the semantics
> baseline is empty. See
> [docs/JVM_DESKTOP_MIGRATION_PLAN.md](docs/JVM_DESKTOP_MIGRATION_PLAN.md).

---

## ✨ Features

- **Three courses in one UI** (74 lessons total) with a sidebar course switcher.
- **Runnable, editable code** in every lesson — press **Run** (or `Ctrl/Cmd + Enter`).
- **Live Hiccup previews** rendered by the real `hiccup.core/html` on the JVM and shown in
  a sandboxed iframe.
- **An interactive capstone** — a real Ring to-do app, served locally and driven by HTMX, in
  an embedded iframe.
- **Auto-checked exercises** that accept *any* correct solution, each evaluated in an
  isolated namespace in the worker JVM.
- **Interactive REPL playground** with history and a keyboard-shortcut cheatsheet.
- **Reference Cheat Sheet** per course with click-to-run examples.
- **Full-text search** across lesson titles, prose and code (`Ctrl/Cmd + K`).
- **Two themes** — Kanagawa (dark) and Gruvbox (light) — plus adjustable text size.
- **One instance per install** — a second launch opens the running app; Chromium/Edge/
  Brave open it as an app window (default browser otherwise).
- **Progress tracking + resume**, saved per course in the app-data `state.edn`.
- **Course-complete celebration** with one-click continue to the next course.
- **Shareable deep-links** (`?lesson=<id>`, `?view=repl`, `?view=cheatsheet`); the
  runtime token is never included in a share URL.
- **Fully offline**: self-hosted fonts and a `default-src 'self'` CSP.
- A reusable **"course engine"** so the same UI can host additional courses.

---

## 🧰 Tech Stack

- **React 19** built with **Vite 7**
- **CodeMirror 6** + [`@nextjournal/clojure-mode`](https://github.com/nextjournal/clojure-mode)
  for the editor (highlighting, structural editing, autocomplete)
- **Tailwind CSS** + shadcn/ui components
- **Clojure 1.12 on JDK 25**, `http-kit`, `cheshire`, `hiccup`, packaged with `jpackage`
- **HTMX 2** vendored for the live course-2 demo (no CDN at runtime)
- **Yarn** for package management

> The app has no remote backend, auth, or database. The loopback server is part of the
> desktop process, and evaluation happens in a child JVM on the same machine.
>
> **There is no hosted web build, by design.** The UI is served by the JVM that owns the
> evaluator, and `/api/*` only accepts loopback requests with a per-launch token. Putting
> that on the public internet would mean executing anonymous learner code on a server;
> `yarn dev` and `yarn preview` are local development tools, not a deployment target. See
> [docs/PHASE7_RESULTS.md](docs/PHASE7_RESULTS.md#hosted-web-build--not-supported).

---

## ✅ Prerequisites

- **Node.js 20+** and **Yarn** (Classic v1) for the UI
- **JDK 25** and **Leiningen 2.12+** for the desktop app
- No internet connection is needed at runtime

---

## 🚀 Getting Started

```bash
# 1. Build the UI into the desktop app's resources
cd frontend
yarn install
yarn build:desktop

# 2. Build and launch the desktop app
cd ../desktop
lein uberjar
java -jar target/parens-desktop.jar
```

Parens prints its loopback URL (including a one-time token) and opens a browser window.

For UI-only work, `yarn dev` starts Vite at **http://localhost:3000**. Evaluation is
unavailable there (no local server/token), so use the desktop app for end-to-end checks.
After changing the UI, run `yarn build:desktop` again so the JVM app serves the new
bundle; `desktop/resources/public` is the built artifact and is committed so packaging
jobs and `lein uberjar` work from a plain checkout.

### Checks

```bash
cd frontend
yarn lint                  # ESLint (React + hooks), zero warnings allowed
yarn build                 # production bundle
yarn check:offline         # fails if the bundle references any external origin
yarn check:semantics       # fails on JS/ClojureScript forms in all three courses
yarn audit:content         # every snippet, Hiccup preview, exercise and cheat-sheet example
yarn smoke                 # drives the real app in Chromium (needs a jar)

cd ../desktop
lein test                  # API security, worker recovery, state store + launcher
node scripts/phase0_check.mjs --json /tmp/phase0.json
node scripts/offline_smoke.mjs --json /tmp/offline-smoke.json
```

`yarn smoke` accepts `--jar`, `--json`, and `--chrome PATH` (or `CHROME_PATH`); without a
path it uses the browser Playwright expects. It checks all 74 lessons across the three
courses, bundled fonts, theme/search/REPL/exercise behavior, runs a Hiccup preview in its
sandboxed iframe, drives the capstone Ring app through an add and a toggle, and asserts
zero console errors, page errors, failed requests, or external requests. CI runs it on
Ubuntu, macOS and Windows against one shared uberjar.

`node scripts/offline_smoke.mjs` starts a packaged app (`--command /path/to/launcher`)
or the uberjar, crawls every asset the shipped HTML/CSS references, and fails if one is
missing, empty, or points at another origin. It then evaluates Clojure through the
packaged worker and checks that quitting leaves no orphan JVM. This is the offline gate
CI runs against the `.deb`, `.rpm`, app images, `.dmg`, `.msi`, and `.exe`. The Linux
packages are published with a `SHA256SUMS` file, plus a GPG signature over it when
`desktop-release.yml` has a signing key; [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)
covers the human install pass, signing secrets, and release notes.

The topbar's restart control restarts the evaluation worker (`POST /api/reset`): REPL
definitions are dropped, the page keeps running, and lesson progress is kept.

`yarn check:semantics` scans every string in all three courses, including `read` blocks,
prose and exercise tests that the runtime audit never executes, and fails on `js/`, `#js`,
`clj->js`/`js->clj`, `.-length`, `cljs`, `catch :default`, the retired
ClojureScript/Reagent/Scittle forms, and the JavaScript RegExp API (`lastIndex`, `.exec`,
`.-groups`). `frontend/content-semantics-baseline.json` is empty since Phase 5; CI runs the
check with `--strict`.

`yarn audit:content` runs 240 lesson code blocks, 11 Hiccup previews, 149 exercise
solutions and 152 cheat-sheet examples in the worker, and asserts 402 values. There are no
known failures left: `frontend/content-audit-baseline.json` is empty, and new failures (or
baseline entries that start passing) fail the check.
`frontend/content-audit-values.json` pins the value and printed output of every passing
snippet and cheat-sheet example, so content that runs but prints something different also
fails; refresh it with `--update-values` after reviewing the diff.

---

## 🗂️ Project Structure

```
frontend/
├── index.html                 # Vite entry (no CDN, no inline scripts)
├── vite.config.mjs            # @vitejs/plugin-react, alias @ -> src
├── eslint.config.mjs          # flat config: JS + React + hooks (yarn lint)
├── public/                    # fonts.css, theme-init.js, favicons, woff2 files,
│                              # vendor/htmx.min.js (Course 2 capstone)
├── scripts/
│   ├── install-ui.mjs         # copy dist/ -> desktop/resources/public
│   ├── check-offline.mjs      # fail the build on any external URL
│   ├── check-content-semantics.mjs  # reject JS/ClojureScript forms in lessons
│   ├── audit-content.mjs      # run every snippet/exercise on the JVM
│   └── smoke.mjs              # browser end-to-end test against the JVM app
└── src/
    ├── App.jsx                # Shell: layout, routing, view/course switching
    ├── App.css                # Themes (Kanagawa / Gruvbox) + all styling
    ├── course/                # buildCourse() engine + the three course definitions
    ├── context/               # active course + theme/font/progress state
    ├── components/            # editor, snippets, REPL, exercises, search, ...
    ├── data/                  # lesson, exercise and cheat-sheet content
    └── lib/
        ├── runtime.js         # HTTP transport to /api/eval, /api/hiccup and the live preview
        ├── store.js           # state.edn API + localStorage mirror/fallback
        └── log.js             # dev-only logging helper

desktop/
├── src/parens/main.clj        # launcher: single instance, app window, server + worker
├── src/parens/api.clj         # token/Host/Origin-protected loopback API + static files
├── src/parens/runtime.clj     # owns the killable worker JVM
├── src/parens/worker.clj      # evaluates code, exercises and Hiccup previews
├── src/parens/preview.clj     # the live Ring to-do app used by the course-2 capstone
├── src/parens/state.clj       # atomic app-data state.edn store
├── resources/public/          # the built UI (generated by `yarn build:desktop`)
├── scripts/                   # packaging, signing, phase checkers
└── test/                      # API security, worker recovery + state store tests
```

---

## 🧩 How code execution works

- The launcher prints `http://127.0.0.1:<port>/#token=<secret>`; the UI reads the token
  from the fragment, stores it in `sessionStorage`, and rewrites the address bar to a
  shareable `?lesson=…` URL.
- Every request to `/api/eval`, `/api/hiccup` or `/api/exercise` sends `X-Parens-Token`.
  The server also validates Host, Origin, and `Sec-Fetch-Site` to block DNS rebinding and
  cross-site calls.
- Hiccup previews are rendered in the worker by the real `hiccup.core/html` and shown in a
  sandboxed iframe. The capstone's live Ring app (`/preview/todos`) is served by the same
  loopback server, uses a `SameSite=Strict` session cookie instead of the token, and is
  driven by vendored HTMX.
- Each course evaluates in its own namespace (`user`, `web`, `regex`), so definitions
  never leak between courses. `POST /api/set-ns` sets the default, and evals also send the
  namespace explicitly. Exercises run in a fresh, unique namespace per attempt.
- A runaway expression is killed after the timeout; the next request starts a fresh
  worker JVM.
- Progress, theme, font size, the active course and golf scores live in `state.edn` in
  the platform app-data directory (`~/.config/parens` on Linux, `~/Library/Application
  Support/Parens` on macOS, `%APPDATA%\Parens` on Windows). The server writes it
  atomically (temp file + rename); the browser keeps a `localStorage` mirror for first
  paint and falls back to it if there is no server. `--state-dir DIR` overrides the
  location for tests and the packaged checkers.
- One launcher instance owns a state directory (an OS file lock). A second launch opens
  the running URL and exits, and the UI opens in a Chromium/Edge/Brave `--app` window
  with an isolated profile when one is installed, otherwise in the default browser.

---

## ♻️ Reusing the UI for another course

The UI is course-agnostic. To add another course with the **same interface, themes, REPL,
search and cheat sheet**, supply new data via `buildCourse` and register it in
`src/course/index.js`:

```js
// src/course/myCourse.js
import { buildCourse } from "./registry";
import { myLessons } from "../data/myLessons";

export const myCourse = buildCourse({
  id: "my-course",
  name: "My Course",
  tagline: "Learn Something",
  storageKey: "my_course_v1",
  ns: "mycourse",
  lessons: myLessons,
});
```

```js
// src/course/index.js
import { clojureCourse } from "./clojureCourse";
import { webCourse } from "./webCourse";
import { myCourse } from "./myCourse";

export const COURSES = [clojureCourse, webCourse, myCourse];
```

That's it — the sidebar switcher, routing and progress tracking pick it up automatically.

---

## 📝 License

This project uses a **dual license** that applies to **all three courses**
(Parens · Learn Clojure, Hiccup · Web Dev with Clojure, and Regex ·
Master Regular Expressions):

- **Source code** — licensed under the [MIT License](./LICENSE).
- **Course content** (all lesson prose, explanations, exercises, examples and
  cheat-sheet entries) — licensed under **Creative Commons Attribution 4.0
  International (CC BY 4.0)**. See [LICENSE-CONTENT.md](./LICENSE-CONTENT.md).

Copyright (c) 2026 Jason Awuku.

---

## 🙏 Acknowledgements

Originally scaffolded with [**Emergent AI**](https://emergent.sh) and since migrated to a
local JVM runtime and a Vite build.
