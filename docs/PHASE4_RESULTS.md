# Phase 4 — Course 2 replacement: results

**Status: PASS.** Course 2 is now **Web Development with Clojure**, built on the JVM with
Ring, Hiccup and HTMX. Live Hiccup previews are rendered by the real `hiccup.core/html` in
the worker and shown in a sandboxed iframe, and the capstone is a working Ring app served by
the local server and driven by vendored HTMX. No ClojureScript, Reagent, React UMD or
Scittle remains in the course or its runtime.

## What changed

| Area | Before | After |
| --- | --- | --- |
| Course shape | 19 lessons on ClojureScript, Reagent components and JS interop | 19 lessons in five groups: web foundations, Ring (request/response/middleware), Hiccup, HTMX, routing/JSON and a capstone |
| Runtime | Preview blocks were read-only placeholders; lessons taught a browser language the app could not run | `POST /api/hiccup` evaluates the form in the worker and renders it with `hiccup.core/html`; the UI shows the result in a sandboxed iframe |
| Capstone | Read-only Reagent example | `parens.preview`: a real Ring app on `/preview/todos` with add, toggle and delete; the page is server-rendered Hiccup and every interaction is an HTMX request |
| HTMX | Not vendored | htmx 2.0.11 vendored at `public/vendor/htmx.min.js` (zero-clause BSD), served from the app |
| Routing/JSON | JS interop and shadow-cljs hints | Reitit routes as data, path parameters, cheshire JSON, deployment notes |
| Security | Token on `/api/*`; static UI only | Preview uses a per-launch `SameSite=Strict`, `HttpOnly` cookie issued by the token-protected `/api/preview/session`; `/preview/*` still checks Host, Origin and `Sec-Fetch-Site`; frame-src limited to `'self'` |
| UI | `ReagentSnippet.jsx` placeholder | `HiccupSnippet.jsx` (Run + sandboxed preview + HTML source) and `LiveApp.jsx` (capstone iframe with restart); the placeholder component is deleted |
| Content guard | `--course clojure` by default, baseline empty | Scans Clojure **and** Web Dev, adds `ClojureScript`, `shadow-cljs`, `Reagent`, `Scittle` and `r/atom` tokens; CI runs `--strict` |
| Audit | 230 code blocks; 31 known failures (12 Web Dev + 19 Regex) | 237 code blocks + **11 Hiccup previews** (HTML asserted), 149 exercises, 150 cheat-sheet items; **383 values asserted**; only the 19 Regex failures remain |

Two corrections came out of running the real library rather than assuming Reagent
semantics:

- **Hiccup's tag shorthand is order-sensitive** and inline styles are CSS **strings**, not
  maps. `:div#main.card` works, while the reverse (`:div.card#main`) renders an empty tag in
  hiccup 1.0.5. The lessons teach the attributes map as the primary form, the id-first
  shorthand as a convenience, and a style string for `:style`; the audit asserts the HTML.
- **`hiccup.core/html` does not escape strings by default.** The lesson demonstrates
  `hiccup.core/h` for user-supplied text; the audit asserts both outputs.

The capstone's add form originally cleared itself with `hx-on`, which HTMX implements with
`Function`, violating the app's CSP (`script-src 'self'`, no `unsafe-eval`). It now returns
the cleared input as an out-of-band swap, so no inline handler or CSP change is needed.

## Verification

- `cd desktop && lein test`: **29 tests / 119 assertions, 0 failures** — including the Hiccup
  op, preview cookie gate, cross-site rejection, add/toggle/delete round trips, and the
  existing timeout/recovery suite.
- `yarn audit:content`: **0 new, 12 fixed**, **0 Web Dev failures**; Parens 37 lessons clean,
  Hiccup 19 lessons clean, Regex 18 lessons with the 19 expected Phase 5 failures.
  - 237 code blocks · 11 Hiccup previews · 149 exercise solutions · 150 cheat-sheet examples.
  - **383 expected values asserted, 0 unrecorded, 0 stale, 1 nondeterministic.**
  - Eval latency: p50 **5.2 ms**, p95 **16.3 ms** over 547 calls (budget 150 ms).
- `yarn check:semantics --strict`: **0 occurrences** across Clojure and Web Dev; baseline is
  empty.
- `yarn smoke` (Chromium, local jar): **23/23 checks in 88.2 s** — all 74 lessons render,
  a Hiccup preview appears in a sandboxed iframe with `Hello, Hiccup!`, the capstone iframe
  loads the Ring app, adding a todo goes 2 → 3, toggling updates it; zero console errors,
  page errors, failed requests or external requests.
- Browser review at **1440 px and 1024 px**: all 19 lessons and the cheat sheet render with
  **no horizontal overflow**; all **11 Hiccup previews** across the five preview lessons
  render non-empty; the capstone was driven through an add in the iframe and screenshotted.
- `yarn build:desktop` + `yarn check:offline`: clean; the committed bundle is refreshed and
  contains no external origins and no retired runtime code.
- The smoke test's failed-request guard ignores `ERR_ABORTED` only for document requests,
  because navigating between lessons tears down an in-flight iframe load; the capstone
  iframe is separately asserted to load and to complete both interactions.
- `lein uberjar`: builds the jar with the Hiccup dependency and the preview namespace.

## Reproduce

```bash
cd desktop && lein test && lein uberjar
cd ../frontend
yarn check:semantics --strict
yarn audit:content
yarn build:desktop && yarn check:offline
yarn smoke                # needs Playwright's Chromium (CI installs it)
```

## Limitations / next

- A Hiccup preview is a server-rendered snapshot: it renders once per Run and has no client
  interactivity. Behaviour that needs a request (HTMX, forms, state) is taught in the text
  and demonstrated by the capstone, not inside the preview.
- The capstone state is an in-memory atom, so the Restart button and a server restart reset
  it. The lesson says so and points at a database for real apps.
- The preview session cookie is per launch and the app is loopback-only; this is a teaching
  demo, not a multi-user server.
- Regex still uses JavaScript regex semantics (Phase 5). The 19 baselined failures are the
  only content debt left.
- htmx is vendored (2.0.11) with its license; bump it deliberately, since the capstone's
  attributes and out-of-band swap are exercised by the smoke test.
