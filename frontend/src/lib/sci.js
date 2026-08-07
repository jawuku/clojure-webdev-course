import { debug } from "./log";

// Client-side Clojure evaluation using SCI (via the Scittle runtime).
// Loaded from CDN in public/index.html as window.scittle.

export function sciReady() {
  return typeof window !== "undefined" && window.scittle && window.scittle.core;
}

let bootstrapped = false;
function bootstrap() {
  if (bootstrapped || !sciReady()) return;
  try {
    // Establish common aliases globally so user code (and lesson snippets)
    // can use str/... and set/... even when require + usage appear together.
    window.scittle.core.eval_string(
      "(require '[clojure.string :as str]) (require '[clojure.set :as set])"
    );
    bootstrapped = true;
  } catch (e) {
    debug("SCI bootstrap skipped (non-fatal):", e);
  }
}

export function waitForSci(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (sciReady()) return resolve(true);
    const start = Date.now();
    const t = setInterval(() => {
      if (sciReady()) {
        clearInterval(t);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        resolve(false);
      }
    }, 100);
  });
}

// ---------------------------------------------------------------------------
// Per-course namespaces. Lesson snippets, the REPL and the cheat sheet all
// evaluate through evalClojure; giving each course its own namespace stops
// definitions made in one course from leaking into another (e.g. a Regex
// learner shouldn't see vars left behind by the Clojure course). Each course
// declares its namespace in its course file (the `ns` field of buildCourse in
// course/registry.js); the Clojure course keeps the traditional `user` ns.
// ---------------------------------------------------------------------------
let currentNs = "user";

// Switch the active evaluation namespace to the given course's. Callers pass
// the namespace declared on the course object (course.ns — see registry.js),
// so adding a new course is a one-line change in that course's file.
// Idempotent and safe to call before the SCI runtime is ready: the actual
// `in-ns` is applied now when possible, and re-asserted once the runtime
// finishes loading (see Shell in App.js) and on every evalClojure /
// renderReagent call. Each course namespace also gets the str/set aliases,
// since several lessons and the Regex REPL use them without an inline require.
// A valid single-segment Clojure symbol.
const VALID_NS_SYMBOL = /^[A-Za-z_][A-Za-z0-9_.!?+*\/<>=#-]*$/;

// Guard an ns value so it is always a valid symbol. Never fall back to a
// SHARED namespace like "user" — that would leak vars between courses, the
// very thing this isolation exists to prevent. Instead derive a unique one
// from the input, and log when a misdeclared value had to be rewritten.
function sanitizeNs(ns) {
  if (typeof ns === "string" && VALID_NS_SYMBOL.test(ns)) return ns;
  const slug = String(ns ?? "")
    .replace(/[^A-Za-z0-9_.!?+*\/<>=#-]/g, "")
    .replace(/^[^A-Za-z_]*/, "")
    .slice(0, 40);
  const clean = slug ? `course-${slug}` : "course-unknown";
  debug(`setCourseNs: invalid namespace ${JSON.stringify(ns)} — using '${clean}'`);
  return clean;
}

export function setCourseNs(ns) {
  const clean = sanitizeNs(ns);
  currentNs = clean;
  if (sciReady()) {
    try {
      window.scittle.core.eval_string(
        `(in-ns '${clean}) (clojure.core/refer-clojure) (clojure.core/require '[clojure.string :as str]) (clojure.core/require '[clojure.set :as set])`
      );
    } catch (e) {
      debug("setCourseNs:", e);
    }
  }
  return clean;
}

// The active course's namespace (used by the REPL for its prompt).
export function getCourseNs() {
  return currentNs;
}

// Evaluate a chunk of Clojure code in whatever namespace is CURRENT (no
// switching). This is the internal core used by runExerciseTests, which needs
// to evaluate inside its temporary exercise namespace.
// Returns { ok, value, output, error }.
// - value: pretty-printed representation of the last form's value
// - output: anything printed via println/print/prn (captured from console)
function evaluateInCurrentNs(code) {
  if (!sciReady()) {
    return {
      ok: false,
      value: null,
      output: "",
      error: "The Clojure runtime is still loading. Give it a second and try again.",
    };
  }

  const logs = [];
  const orig = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  bootstrap();
  const capture = (...args) =>
    logs.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  console.log = capture;
  console.info = capture;

  const trimmed = (code || "").trim();
  // Wrap so we get a printable representation of the value while println still
  // flows to console (which we capture above).
  const wrapped = trimmed.length
    ? `(pr-str (do\n${code}\n))`
    : `(pr-str nil)`;

  try {
    const valueStr = window.scittle.core.eval_string(wrapped);
    return {
      ok: true,
      value: typeof valueStr === "string" ? valueStr : String(valueStr),
      output: logs.join("\n"),
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      value: null,
      output: logs.join("\n"),
      error: cleanError(e),
    };
  } finally {
    console.log = orig.log;
    console.info = orig.info;
    console.warn = orig.warn;
    console.error = orig.error;
  }
}

// Evaluate a chunk of Clojure code in the ACTIVE COURSE's namespace. Lesson
// snippets, the REPL and the cheat sheet all go through here, so everything a
// learner runs in a course stays in that course's namespace.
export function evalClojure(code) {
  if (sciReady()) {
    try {
      window.scittle.core.eval_string(`(in-ns '${currentNs})`);
    } catch (e) {
      debug("evalClojure: could not enter course namespace:", e);
    }
  }
  return evaluateInCurrentNs(code);
}

function cleanError(e) {
  let msg = (e && (e.message || e.toString())) || "Unknown error";
  msg = msg.replace(/\s*\[at line.*$/s, "").trim();
  return msg;
}

function onlyComments(code) {
  return code
    .split("\n")
    .every((line) => {
      const t = line.trim();
      return t === "" || t.startsWith(";");
    });
}

// Run the user's code in an ISOLATED, fresh namespace, then evaluate each
// boolean test expression in that same namespace. A unique namespace per call
// prevents state leaking between exercises (or between repeated attempts), so a
// function defined for a previous exercise can never accidentally satisfy tests.
// Lessons/REPL/cheat sheet keep running in the active course namespace (see
// setCourseNs). Returns { passed, results:[{test, ok, detail}], runError }.
let exerciseNsCounter = 0;

export function runExerciseTests(userCode, tests) {
  if (!userCode || !userCode.trim() || onlyComments(userCode)) {
    return { passed: false, results: [], runError: "Write some code first, then check your answer." };
  }
  if (!sciReady()) {
    return { passed: false, results: [], runError: "The Clojure runtime is still loading. Try again in a moment." };
  }

  const ns = `exercise${++exerciseNsCounter}`;
  try {
    // Enter a clean namespace with clojure.core referred and clojure.string aliased.
    window.scittle.core.eval_string(
      `(in-ns '${ns}) (clojure.core/refer-clojure) (clojure.core/require '[clojure.string :as str]) (clojure.core/require '[clojure.set :as set])`
    );

    // Bind the last value to `answer` so value-style exercises can be checked,
    // while any def/defn inside still defines it in this namespace for the tests.
    const run = evaluateInCurrentNs(`(def answer (do\n${userCode}\n))`);
    if (!run.ok) {
      return { passed: false, results: [], runError: run.error };
    }
    const results = tests.map((test) => {
      const r = evaluateInCurrentNs(test);
      if (!r.ok) {
        return { test, ok: false, detail: r.error };
      }
      const ok = r.value === "true";
      return { test, ok, detail: ok ? "passed" : `got ${r.value}` };
    });
    return {
      passed: results.length > 0 && results.every((r) => r.ok),
      results,
      runError: null,
    };
  } catch (e) {
    return { passed: false, results: [], runError: cleanError(e) };
  } finally {
    // Always return to the active course namespace.
    try {
      window.scittle.core.eval_string(`(in-ns '${currentNs})`);
    } catch (e) {
      debug("Could not restore course namespace:", e);
    }
  }
}


// ---------------------------------------------------------------------------
// Reagent (ClojureScript UI) support — used by the Web Development course.
// The course loads React 18, ReactDOM 18 and the Scittle Reagent plugin via the
// course's `runtimeScripts`. We render live components using React 18's modern
// createRoot API together with reagent.core/as-element (which preserves Reagent
// reactivity), avoiding the deprecated ReactDOM.render / reagent.dom/render path.
// ---------------------------------------------------------------------------

let _reagentOk = false;

// True once React 18 (with createRoot), ReactDOM and the Scittle reagent plugin
// (reagent.core) are all available.
export function reagentReady() {
  if (_reagentOk) return true;
  if (!sciReady()) return false;
  if (typeof window === "undefined" || !window.React || !window.ReactDOM) return false;
  if (typeof window.ReactDOM.createRoot !== "function") return false;
  try {
    // Will throw until the scittle.reagent plugin has registered reagent.core.
    window.scittle.core.eval_string("(require '[reagent.core]) true");
    _reagentOk = true;
    return true;
  } catch (e) {
    return false;
  }
}

export function waitForReagent(timeoutMs = 15000) {
  return new Promise((resolve) => {
    if (reagentReady()) return resolve(true);
    const start = Date.now();
    const t = setInterval(() => {
      if (reagentReady()) {
        clearInterval(t);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        resolve(false);
      }
    }, 150);
  });
}

// Evaluate ClojureScript that returns a Reagent component (in Hiccup form) as
// its last expression, and mount it live into the element with id `mountId`.
// Uses React 18 createRoot; one root is created per mount id and reused across
// re-runs (so editing + Run updates in place without the "createRoot called
// twice" warning). Returns { ok, output, error }.
export function renderReagent(code, mountId) {
  if (!sciReady()) {
    return { ok: false, output: "", error: "The runtime is still loading. Give it a second and try again." };
  }
  if (!reagentReady()) {
    return { ok: false, output: "", error: "The Reagent runtime is still loading. Give it a moment and press Run again." };
  }

  const logs = [];
  const orig = { log: console.log, info: console.info };
  const capture = (...args) =>
    logs.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  console.log = capture;
  console.info = capture;

  try {
    const el = document.getElementById(mountId);
    if (!el) return { ok: false, output: logs.join("\n"), error: "Live preview area not found." };
    // Evaluate in the active course's namespace (isolated per course).
    window.scittle.core.eval_string(`(in-ns '${currentNs})`);
    // A cljs-side registry of React 18 roots, keyed by mount id, so each preview
    // reuses its root across runs. as-element converts Hiccup -> a React element
    // while keeping reactive atoms live.
    const wrapped = `(require '[reagent.core :as r])
(defonce __reagent_roots (atom {}))
(let [id "${mountId}"
      el (.getElementById js/document id)
      root (or (get @__reagent_roots id)
               (let [rt (js/ReactDOM.createRoot el)]
                 (swap! __reagent_roots assoc id rt)
                 rt))]
  (.render root (r/as-element (do
${code}
))))`;
    window.scittle.core.eval_string(wrapped);
    return { ok: true, output: logs.join("\n"), error: null };
  } catch (e) {
    return { ok: false, output: logs.join("\n"), error: cleanError(e) };
  } finally {
    console.log = orig.log;
    console.info = orig.info;
  }
}
