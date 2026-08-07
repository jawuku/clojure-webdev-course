# Parens — Multi-Course Clojure(Script) Learning App

## Original Problem Statement
Build a beginner course "Web Development with ClojureScript" that builds upon the user's
existing Clojure course project (jawuku/learn-clojure). Inherit the existing UI for a
consistent look & feel, add it as a SECOND course in the SAME app, keep it visually
identical, and provide LIVE in-browser code execution including a Reagent runtime
(`webCourse.js` with reagent runtimeScripts). Chapter 1 should cover the design of the WWW
and a brief technology overview for novices. Learners should complete the Clojure course first.

## Architecture
- Frontend-only React 19 app (CRACO), 100% client-side. No backend, no auth, no DB.
- In-browser evaluation via Scittle/SCI (loaded from CDN in public/index.html).
- Reusable "course engine" `src/course/registry.js` (`buildCourse`) drives a course-agnostic UI.
- Two courses registered in `src/course/index.js`: clojureCourse (existing) + webCourse (new).
- Course switching in `App.js` (CourseProvider keyed by courseId; active id persisted in
  localStorage `parens_active_course_v1`). Switcher UI lives in `Sidebar.jsx`.
- Web course loads React 17 UMD + `scittle.reagent.js` via `runtimeScripts` (CourseContext
  injects them once). Live components rendered by `renderReagent()` in `src/lib/sci.js`
  into a per-snippet DOM node via `reagent.dom/render`.

## User Personas
- Complete beginners who finished the Clojure course and want to build web UIs.

## Core Requirements (static)
- Inherit existing UI, themes (Kanagawa/Gruvbox), REPL, search, cheat sheet, progress.
- Second course, visually identical, with a course switcher.
- Live, editable, runnable ClojureScript + live-rendered Reagent components.
- Ch.1 = WWW design + tech overview for novices; Clojure course as prerequisite.

## What's Been Implemented (2026-06)
- NEW course "Web Dev with ClojureScript" (id `webdev`, brand "</> Hiccup"), 19 lessons in 5 groups:
  1. The Web & Its Foundations (welcome/prereq, WWW design, how the web works, HTML, CSS, JS+cljs)
  2. ClojureScript Fundamentals (same language, JS interop, browser APIs)
  3. Hiccup — HTML as Data (intro + building UI from data)
  4. Reagent — Building UIs (first component, props/composition, reactive state, events/forms, dynamic lists, To-Do capstone)
  5. Building Real Apps (Beyond: re-frame/HTTP/routing/shadow-cljs; What's Next)
- New block type `reagent` (live component) + `ReagentSnippet.jsx`; `renderReagent/reagentReady/waitForReagent` in sci.js.
- Course switcher in Sidebar; App.js remounts per-course (independent progress/storage).
- Web-course cheat sheet (Hiccup / Reagent / state / interop / data-shaping), all examples runnable.
- CSS for switcher + live preview appended to App.css.
- Existing Clojure course brought into /app and running; regression verified.
- Verified by testing agent (iteration_1.json): 100% frontend, 0 console errors — live Hiccup render,
  reactive counter, live forms, To-Do add/toggle, exercises, and Clojure regression all PASS.

## Prioritized Backlog / Next Tasks
- P1: Reconcile ordering with the user's official syllabus PDF (currently used my proposed outline;
  Drive link was sign-in restricted — awaiting "Anyone with the link" or pasted text).
- P2: Add more exercises to Reagent lessons; a "clear completed / filter" extension to the capstone.
- P3: Offline/CDN fallback for React/Scittle scripts; small React ErrorBoundary note for live editors.
- DONE (2026-06): Course-complete celebration overlay (once per course, persisted flag) +
  one-click "Continue" to the next course; end-of-Clojure-course CTA button linking to the web
  course (LessonView 'cta' block). Verified by testing agent iteration_2/3 at 100%.
- DONE (2026-06): Code-quality pass — memoized AppContext value (useMemo), replaced empty catch
  blocks with console.debug logging. Verified iteration_4 (100%, no regressions).
- DONE (2026-06): Sandbox React upgrade 17 -> 18. Live Reagent now renders via React 18
  ReactDOM.createRoot + reagent.core/as-element (one reused root per preview via a cljs
  `__reagent_roots` atom), replacing the deprecated reagent.dom/render path. Scittle's reagent
  plugin has no reagent.dom.client, hence the native createRoot + as-element approach. Verified
  iteration_5 at 100% with zero React deprecation / double-createRoot warnings.

## Notes
- No credentials / no auth in this app (test_credentials.md not required).

## Update (2026-06): Merged into a THREE-course app
- Merged the standalone Regex course into the main app as a third course via the existing
  course engine + switcher. COURSES = [clojureCourse, webCourse, regexCourse].
- Regex course: 18 lessons (regexPart1-3), incl. global-flag deep-dive, lookarounds, named
  groups, Regex Golf + a live Golf Leaderboard (lib/golf.js, data/regexGolf.js,
  components/GolfLeaderboard.jsx; LessonView 'golf-board' block; Exercise records golf scores).
- Verified by testing agent iteration_10 at 100% (10/10): 3-course switcher, per-course
  progress, regex snippets + golf leaderboard record/reset, webdev live Reagent, clojure
  snippet + CTA — zero console errors.
- The standalone /app/regex-course project remains as a separate deliverable (MIT + CC BY 4.0).

## Update (2026-06): Root licensing for the merged 3-course app
- Added /app/LICENSE (MIT, source code) and /app/LICENSE-CONTENT.md (CC BY 4.0, lesson
  content) at the root, explicitly covering all 3 courses. Copyright 2026 Jason Awuku.
- Updated /app/README.md License section to a dual-license (MIT + CC BY 4.0) covering all
  courses, and added an Acknowledgements section crediting Emergent AI.
- Text/docs only; no code or functional change. Pure client-side SPA (no backend).

## Update (2026-06): Course-chain link + cleanup
- Added a `cta` block to the Web Dev course's final lesson (webPart4.js, id "webdev-next")
  linking to the Regex course (courseId "regex") — completing the chain
  Clojure -> Web Dev -> Regex. Verified via Playwright: CTA renders and clicking it switches
  the active course to Regex (localStorage parens_active_course_v1 => "regex").
- Deleted the now-redundant standalone /app/regex-course/ folder (merged into /app/frontend).

## Update (2026-06): Regex (final course) completion flow + CSS bug fix
- Made CourseComplete.jsx smart about the final course: if every course is complete it shows
  a "grand finale" (PartyPopper badge, "You did it — the whole journey!" + "Back to the start"
  which switches to Course 1); if the last course is done but others aren't, it points to the
  first unfinished course ("Finish off <course>"). Non-final courses keep the recommended
  next-course flow.
- Added a closing `cta` block to the Regex wrap-up lesson (regexPart2.js "whats-next")
  looping back to Course 1.
- FIXED a pre-existing CSS bug: `.reagent-preview input[type="checkbox"]` (App.css) was
  missing its closing brace, swallowing all `.lesson-cta`, `.celebrate-*` and `.golf-*` rules
  (a stray `}` near EOF was the misplaced closer). This had silently broken the celebration
  overlay styling AND the lesson CTA boxes. Verified via Playwright + computed styles.

## Update (2026-06): Vite migration — DECIDED AGAINST
- User considered migrating CRA/CRACO -> Vite. After checking platform compatibility
  (support_agent), confirmed it would likely break Emergent Visual Edits
  (@emergentbase/visual-edits is webpack/craco-specific), drop the webpack health-check
  integration, and jeopardize the managed Deploy flow (build/ -> dist/, supervisor pinned to
  yarn start on 0.0.0.0:3000). User chose to KEEP CRA — the app works fine; "deprecated" CRA
  doesn't affect functionality. No code changes made. (Roadmap item closed: won't-do.)
