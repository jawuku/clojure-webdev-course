# Parens — Learn Clojure & ClojureScript in the Browser

An interactive, **multi-course** learning platform that teaches **Clojure**, then
**Web Development with ClojureScript**, plus a standalone **Regular Expressions** course,
to complete beginners. Every lesson is written in plain English, code examples are
syntax-highlighted, and **all code runs entirely in your browser** — there is no backend
and no server required to evaluate code.

- **Course 1 — Parens · Learn Clojure:** 37 lessons from first principles (values,
  functions, collections, higher-order functions, recursion, macros/protocols).
- **Course 2 — Hiccup · Web Dev with ClojureScript:** 19 lessons that build on Course 1 —
  the design of the WWW, HTML/CSS/JS, ClojureScript & JS interop, **Hiccup**, and
  **live, in-browser Reagent components** (state, events, forms) culminating in a to-do app.
- **Course 3 — Regex · Master Regular Expressions:** 18 lessons taught through Clojure's
  regex tools (`re-find`, `re-seq`, `re-matches`, `str/replace`), covering everything from
  literals to lookarounds, named groups and a live **Regex Golf leaderboard**.

Switch between courses any time with the **course switcher** in the sidebar. Progress,
theme and last position are saved **per course** in `localStorage`.

Clojure(Script) is executed locally with the **[Small Clojure Interpreter (SCI)](https://github.com/babashka/sci)**,
loaded via the **[Scittle](https://github.com/babashka/scittle)** runtime from a CDN.
The Web Dev course additionally loads **React 18 + the Scittle Reagent plugin** to render
live components in the page.

---

## ✨ Features

- **Three courses in one UI** (74 lessons total) with a sidebar course switcher.
- **Runnable, editable code** in every lesson — press **Run** (or `Ctrl/Cmd + Enter`).
- **Live Reagent components** in the Web Dev course — edit ClojureScript and see the
  rendered UI update instantly (rendered with React 18's `createRoot`).
- **Auto-checked exercises** that accept *any* correct solution, each evaluated in an
  isolated namespace.
- **Interactive REPL playground** with history and a keyboard-shortcut cheatsheet.
- **Reference Cheat Sheet** per course with click-to-run examples.
- **Full-text search** across lesson titles, prose and code (`Ctrl/Cmd + K`).
- **Two themes** — Kanagawa (dark) and Gruvbox (light) — plus adjustable text size.
- **Progress tracking + resume**, saved per course in `localStorage`.
- **Course-complete celebration** with one-click continue to the next course.
- **Shareable deep-links** (`?lesson=<id>`, `?view=repl`, `?view=cheatsheet`).
- A reusable **"course engine"** so the same UI can host additional courses.

---

## 🧰 Tech Stack

- **React 19** (Create React App + [CRACO](https://craco.js.org/))
- **CodeMirror 6** + [`@nextjournal/clojure-mode`](https://github.com/nextjournal/clojure-mode)
  for the editor (highlighting, structural editing, autocomplete)
- **SCI / Scittle** (loaded from CDN in `frontend/public/index.html`) for in-browser evaluation
- **Scittle Reagent plugin + React 18 (UMD)** for live ClojureScript UI in the Web Dev course
- **Tailwind CSS** + shadcn/ui components
- **Yarn** for package management

> The app is **100% client-side** — there is no backend, auth, or database.
> You only need to run the frontend.

---

## ✅ Prerequisites

- **Node.js 18+** (LTS recommended)
- **Yarn** (Classic v1). Install with `npm install -g yarn` if you don't have it.
- An internet connection **at runtime** (the SCI/Scittle + React/Reagent runtimes are
  fetched from a CDN).

---

## 🚀 Getting Started (run locally)

```bash
# 1. Clone your repository
git clone <your-repo-url>
cd <your-repo>/frontend

# 2. Install dependencies (use yarn, not npm)
yarn install

# 3. Start the dev server
yarn start
```

The app opens at **http://localhost:3000**.

> Use **Yarn**, not npm — the lockfile and resolutions are Yarn-based.

---

## 📦 Production Build

```bash
cd frontend
yarn build
```

This produces a static site in **`frontend/build/`**. Because the app is entirely
client-side, you can host that folder on **any static web host**.

Quick local preview of the build:

```bash
npx serve -s build
```

---

## 🌐 Deploying

The output is a static single-page app that uses **query-string** routing
(`?lesson=…`), so it works on plain static hosts **without** any SPA redirect rules.
`frontend/package.json` sets `"homepage": "."` (a relative base path that works on
GitHub Pages, Netlify, Vercel, custom domains and the Emergent preview).

### Netlify
- Base directory: `frontend`
- Build command: `yarn build`
- Publish directory: `frontend/build`

### Vercel
- Root directory: `frontend`
- Framework preset: **Create React App**
- Build command: `yarn build` · Output directory: `build`

### GitHub Pages
A `deploy` script (using `gh-pages`) is included:

```bash
cd frontend
yarn install
yarn deploy        # runs predeploy (yarn build) then publishes build/ to the gh-pages branch
```

Then set **Settings → Pages → Source** to the **`gh-pages`** branch.

### Any other static host (S3, Cloudflare Pages, nginx, …)
Just serve the contents of `frontend/build/`.

---

## 🗂️ Project Structure

```
frontend/src/
├── App.js                     # Shell: layout, routing, view switching, course switching
├── App.css                    # Themes (Kanagawa / Gruvbox) + all styling
├── course/
│   ├── registry.js            # buildCourse(): the reusable "course engine"
│   ├── clojureCourse.js       # Course 1 (Clojure), assembled from data/lessonsPart1..5
│   ├── webCourse.js           # Course 2 (Web Dev), Reagent runtimeScripts + data/webPart1..4
│   └── index.js               # COURSES list + default course id
├── context/
│   ├── CourseContext.jsx      # Injects the active course; loads course runtimeScripts
│   └── AppContext.jsx         # Theme, font size, progress (per-course localStorage)
├── components/
│   ├── CodeEditor.jsx         # CodeMirror 6 + clojure-mode + autocomplete + themes
│   ├── RunnableSnippet.jsx    # Editable/runnable ClojureScript example (text result)
│   ├── ReagentSnippet.jsx     # Live Reagent component (renders into the page)
│   ├── StaticSnippet.jsx      # Read-only (non-runnable) preview code
│   ├── Exercise.jsx           # Exercise runner (Check / Run / Hint / Solution)
│   ├── Repl.jsx               # REPL playground + shortcuts cheatsheet
│   ├── CheatSheet.jsx         # Reference cheat sheet (click-to-run)
│   ├── SearchDialog.jsx       # Ctrl/Cmd+K full-text search
│   ├── CourseComplete.jsx     # Course-complete celebration overlay
│   ├── Sidebar.jsx / Topbar.jsx
│   └── LessonView.jsx         # Renders lesson content blocks (incl. live 'reagent' blocks)
├── data/
│   ├── lessonsPart1..5.js     # Clojure course content + exercises
│   ├── webPart1..4.js         # ClojureScript Web Dev course content + exercises
│   ├── cheatsheet.js          # Clojure cheat sheet
│   └── webCheatsheet.js       # Web Dev cheat sheet
└── lib/
    ├── sci.js                 # SCI/Scittle evaluation, exercise checking, live Reagent render
    └── log.js                 # Dev-only logging helper (no-ops in production)
```

---

## 🧩 How code execution works

- `frontend/public/index.html` loads **Scittle** (which bundles SCI) from jsDelivr.
- `frontend/src/lib/sci.js` evaluates code via `window.scittle.core.eval_string`,
  capturing the returned value and printed output, and surfacing errors.
- **Exercises** run the learner's code in a **fresh namespace**, then evaluate hidden
  boolean tests, so many different valid solutions are accepted.
- **Live Reagent** (Web Dev course): `webCourse.js` injects React 18 + the Scittle Reagent
  plugin as `runtimeScripts`. `renderReagent()` mounts each snippet with React 18's
  `ReactDOM.createRoot` via `reagent.core/as-element`, reusing one root per preview.

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
  lessons: myLessons,
  // Optional extra Scittle plugins (e.g. Reagent) to load into the runtime:
  // runtimeScripts: ["https://unpkg.com/react@18/umd/react.production.min.js", ...],
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
(Parens · Learn Clojure, Hiccup · Web Dev with ClojureScript, and Regex ·
Master Regular Expressions):

- **Source code** — licensed under the [MIT License](./LICENSE).
- **Course content** (all lesson prose, explanations, exercises, examples and
  cheat-sheet entries) — licensed under **Creative Commons Attribution 4.0
  International (CC BY 4.0)**. See [LICENSE-CONTENT.md](./LICENSE-CONTENT.md).

Copyright (c) 2026 Jason Awuku.

---

## 🙏 Acknowledgements

Built with [**Emergent AI**](https://emergent.sh) — an agentic full-stack
development platform that helped scaffold, extend and refine this multi-course
learning app.
