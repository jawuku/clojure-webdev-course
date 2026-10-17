import { debug } from "./log";

/*
 * The evaluation runtime.
 *
 * Everything a learner runs goes through the local JVM app over HTTP: the
 * server holds the per-launch token and forwards the code to a separate,
 * killable worker JVM. There is no in-browser evaluator any more.
 *
 * This module is the only place that knows the transport. Components use the
 * same shapes the old SCI helpers returned, so swapping the transport did not
 * change the UI:
 *   evalClojure(code)            -> { ok, value, output, error }
 *   runExerciseTests(code, tests)-> { passed, results:[{test, ok, detail}], runError }
 */

const API_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const TOKEN_STORAGE_KEY = "parens_runtime_token";

// The launcher puts the token in the URL fragment so it never reaches the
// server in a request line. We keep it in sessionStorage as well: App.js
// rewrites the URL to a shareable ?lesson=… link (which must NOT contain the
// token), and a reload has to keep working afterwards.
function readToken() {
  if (typeof window === "undefined") return null;
  try {
    // A token in the URL is authoritative: a relaunch (even on the same port)
    // must replace a token left behind by the previous session.
    const raw = window.location.hash.replace(/^#/, "");
    const fromHash = raw ? new URLSearchParams(raw).get("token") : null;
    if (fromHash) {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, fromHash);
      return fromHash;
    }
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch (error) {
    debug("runtime: could not read the launch token", error);
    return null;
  }
}

let token = readToken();

function authError() {
  return token
    ? {
        ok: false,
        value: null,
        output: "",
        error:
          "The local runtime rejected this session's token. Relaunch Parens to start a fresh session.",
      }
    : {
        ok: false,
        value: null,
        output: "",
        error:
          "No runtime token found. Open Parens from its launcher (the URL it prints ends in #token=…), or start the server with desktop/scripts/run.sh.",
      };
}

async function api(path, { method = "POST", body } = {}) {
  if (!token) throw new Error(authError().error);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      method,
      headers: {
        "content-type": "application/json",
        "x-parens-token": token,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        (data && data.error) || `The runtime request failed (HTTP ${response.status}).`
      );
    }
    return data || {};
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The runtime did not answer in time. It may still be starting up.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function describe(error) {
  return (error && (error.message || String(error))) || "Unknown runtime error";
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

let ready = false;
let readyPromise = null;

/** Synchronous snapshot: has the runtime answered since this page loaded? */
export function runtimeReady() {
  return ready;
}

/**
 * Resolve true once the local server and its evaluation worker answer.
 * Returns false (never rejects) if the runtime is unreachable in time.
 */
export function waitForRuntime(timeoutMs = 20_000) {
  if (ready) return Promise.resolve(true);
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    if (!token) return false;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const info = await api("/api/runtime", { method: "GET" });
        if (info && info.ok) {
          ready = true;
          debug("runtime ready:", { clojure: info.clojure, java: info.java });
          return true;
        }
      } catch (error) {
        // A rejected token never becomes valid; stop polling.
        if (/token/i.test(describe(error))) return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  })();

  return readyPromise;
}

// ---------------------------------------------------------------------------
// Per-course namespaces
// ---------------------------------------------------------------------------

// Every course evaluates in its own namespace so definitions made in one
// course do not leak into another. The server receives `ns` on each eval
// request; it never infers the course from the UI.
let currentNs = "user";

const VALID_NS_SYMBOL = /^[A-Za-z_][A-Za-z0-9_.!?+*\/<>=#-]*$/;

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
  currentNs = sanitizeNs(ns);
  // Best effort: tell the server which namespace is active so a caller that
  // omits `ns` lands in the right place. Evals still send `ns` explicitly, so a
  // failed call cannot misroute learner code.
  if (ready) {
    api("/api/set-ns", { body: { ns: currentNs } }).catch((error) =>
      debug("setCourseNs: could not set the runtime namespace", error)
    );
  }
  return currentNs;
}

export function getCourseNs() {
  return currentNs;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Evaluate Clojure in the active course namespace. Never throws. */
export async function evalClojure(code) {
  try {
    const data = await api("/api/eval", { body: { code, ns: currentNs } });
    return {
      ok: data.ok === true,
      value: data.value ?? null,
      output: data.output || "",
      error: data.ok === true ? null : data.error || "Evaluation failed.",
      ms: data.ms,
    };
  } catch (error) {
    return { ok: false, value: null, output: "", error: describe(error) };
  }
}

function onlyComments(code) {
  return code
    .split("\n")
    .every((line) => {
      const t = line.trim();
      return t === "" || t.startsWith(";");
    });
}

/**
 * Run the learner's code, then each boolean test expression, in a fresh
 * namespace inside the worker (one namespace per attempt, so a function
 * defined for an earlier exercise cannot satisfy a later test).
 */
export async function runExerciseTests(userCode, tests) {
  if (!userCode || !userCode.trim() || onlyComments(userCode)) {
    return {
      passed: false,
      results: [],
      runError: "Write some code first, then check your answer.",
    };
  }
  try {
    const data = await api("/api/exercise", {
      body: { code: userCode, tests: Array.isArray(tests) ? tests : [] },
    });
    return {
      passed: data.passed === true,
      results: Array.isArray(data.results) ? data.results : [],
      runError: data.runError || null,
    };
  } catch (error) {
    return { passed: false, results: [], runError: describe(error) };
  }
}
