/**
 * Shared harness for the frontend content audits (scripts/audit-*.mjs).
 *
 * Owns the pieces every audit needs so the three audit scripts stay small and
 * behave identically: env parsing, dev-server boot (or reuse), Chromium
 * resolution/launch, scittle readiness polling, ESM data-file extraction, the
 * in-page eval helper, error capture, and the CI-friendly summary/exit-code
 * contract (AUDIT_REPORT JSON + AUDIT_SUMMARY_JSON line).
 *
 * Env vars (shared):
 *   AUDIT_BASE_URL          App URL (default http://localhost:3000). Auto-starts
 *                           the dev server if nothing is listening.
 *   AUDIT_AUTO_START        Default "1". Set "0" to require an existing server.
 *   AUDIT_SERVER_TIMEOUT_MS Max ms to wait for a server (default 180000).
 *   CHROME_PATH             Chromium/Chrome executable (default: puppeteer's).
 *   AUDIT_REPORT            Optional path to write a JSON report.
 *   AUDIT_FAIL_ON_CONSOLE   "1" to fail on console errors too (page errors
 *                           always fail).
 */
import { existsSync, mkdtempSync, rmSync, cpSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

export const FRONTEND_DIR = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const DATA_DIR = join(FRONTEND_DIR, "src", "data");

export const ENV = {
  baseUrl: process.env.AUDIT_BASE_URL || "http://localhost:3000",
  autoStart: process.env.AUDIT_AUTO_START !== "0",
  serverTimeoutMs: Number(process.env.AUDIT_SERVER_TIMEOUT_MS || 180000),
  chromePath: process.env.CHROME_PATH || "",
  report: process.env.AUDIT_REPORT || "",
  failOnConsole: process.env.AUDIT_FAIL_ON_CONSOLE === "1",
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (msg = "") => console.log(msg);

export async function isUp(url) {
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(3000) });
    return res.ok || res.status === 302;
  } catch {
    return false;
  }
}

/**
 * Reuse an existing server at ENV.baseUrl, or boot `yarn start` (honouring the
 * base URL's port via the PORT env var that CRA/craco respects) and wait for it.
 * Returns a stop() function only when this process started the server.
 */
export async function ensureServer() {
  if (await isUp(ENV.baseUrl)) {
    log(`[server] using existing server at ${ENV.baseUrl}`);
    return null;
  }
  if (!ENV.autoStart) {
    throw new Error(
      `No server at ${ENV.baseUrl} and AUDIT_AUTO_START=0 — start it first ` +
        `(e.g. \`yarn start\` from frontend/).`
    );
  }
  let port = "3000";
  try {
    port = new URL(ENV.baseUrl).port || "3000";
  } catch {
    /* keep default */
  }
  log(`[server] nothing at ${ENV.baseUrl} — starting \`yarn start\` on port ${port} ...`);
  const cmd = process.platform === "win32" ? "yarn.cmd" : "yarn";
  const server = spawn(cmd, ["start"], {
    cwd: FRONTEND_DIR,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PORT: String(port) },
  });
  const deadline = Date.now() + ENV.serverTimeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Dev server exited early with code ${server.exitCode}.`);
    }
    if (await isUp(ENV.baseUrl)) {
      log("[server] dev server is up.");
      return () => {
        try {
          process.kill(-server.pid, "SIGTERM");
        } catch {
          /* already gone */
        }
      };
    }
    await sleep(2000);
  }
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    /* ignore */
  }
  throw new Error(`Dev server did not come up within ${ENV.serverTimeoutMs}ms.`);
}

/**
 * Resolve a browser executable: CHROME_PATH wins, else puppeteer's bundled
 * browser. puppeteer >= 23 returns a Promise from executablePath(), while
 * puppeteer-core (and older puppeteer) return a plain string — handle both.
 */
async function resolveExecutable(puppeteer) {
  if (ENV.chromePath) return ENV.chromePath;
  try {
    const p = puppeteer.executablePath();
    return p && typeof p.then === "function" ? await p : p;
  } catch {
    return undefined;
  }
}

/** Launch a headless Chromium via `puppeteer` (fallback `puppeteer-core`). */
export async function launchBrowser() {
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch {
    try {
      puppeteer = (await import("puppeteer-core")).default;
    } catch {
      throw new Error(
        "Neither `puppeteer` nor `puppeteer-core` is installed. Run `yarn add -D puppeteer`."
      );
    }
  }
  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  };
  // An explicit CHROME_PATH is used verbatim; otherwise use puppeteer's own
  // browser only if it is actually installed (its executablePath() points into
  // a cache dir that may be empty when the download was skipped).
  const exe = await resolveExecutable(puppeteer);
  if (exe && (ENV.chromePath || existsSync(exe))) launchOptions.executablePath = exe;
  try {
    return await puppeteer.launch(launchOptions);
  } catch (e) {
    throw new Error(
      `Could not launch a browser. Set CHROME_PATH to a Chromium binary ` +
        `(e.g. the Chrome bundled with puppeteer if install was skipped). ` +
        `Underlying error: ${String(e.message || e).slice(0, 300)}`
    );
  }
}

/**
 * The app boots the scittle runtime asynchronously (it also loads reagent
 * scripts for the webdev course), so poll until eval is available instead of
 * sleeping a fixed amount — this keeps audits stable on slow CI.
 */
export async function waitForScittle(page, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(
      () =>
        typeof window.scittle !== "undefined" &&
        typeof window.scittle.core !== "undefined" &&
        typeof window.scittle.core.eval_string === "function"
    );
    if (ready) return;
    await sleep(500);
  }
  throw new Error(`scittle did not become ready within ${timeoutMs}ms.`);
}

/** Attach console/page-error collectors (optionally prefixed, e.g. "BOOT: "). */
export function attachErrorListeners(page, consoleErrors, pageErrors, prefix = "") {
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(prefix + m.text().slice(0, 130));
  });
  page.on("pageerror", (e) => pageErrors.push(prefix + String(e).slice(0, 130)));
}

/**
 * Evaluate Clojure code in the page's scittle runtime, wrapped in
 * (pr-str (do ...)) so the printed result comes back as a string.
 */
export function ev(page, code) {
  return page.evaluate((code) => {
    const nl = String.fromCharCode(10);
    try {
      const r = window.scittle.core.eval_string("(pr-str (do" + nl + code + nl + "))");
      return { ok: true, v: String(r) };
    } catch (e) {
      return { ok: false, err: String((e && e.message) || e).slice(0, 170) };
    }
  }, code);
}

/**
 * Load ESM data files from src/data so Node can import them: copies each into
 * a temp dir that declares "type":"module" (the data files use ESM syntax but
 * the frontend package has no "type" field), imports, then cleans up. Returns
 * a Map of base name (no extension) -> module namespace object.
 */
export async function extractModules(files) {
  const tmp = mkdtempSync(join(tmpdir(), "audit-data-"));
  writeFileSync(join(tmp, "package.json"), JSON.stringify({ type: "module" }));
  const modules = new Map();
  try {
    for (const f of files) {
      // Accept names with or without the .js extension; key by the base name.
      const base = f.endsWith(".js") ? f.slice(0, -3) : f;
      const src = join(DATA_DIR, base + ".js");
      if (!existsSync(src)) throw new Error(`Data file not found: ${src}`);
      cpSync(src, join(tmp, base + ".js"));
      modules.set(base, await import(pathToFileURL(join(tmp, base + ".js")).href));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return modules;
}

/**
 * Standard main wrapper: boot/reuse the server, run the audit, kill the server
 * if we started it, and always surface a clean FATAL on unexpected errors.
 * Pass a function returning the `summarize` payload (or null/undefined).
 */
export async function runMain(runAudit) {
  let serverStop = null;
  let result = null;
  try {
    serverStop = await ensureServer();
    result = await runAudit();
  } catch (e) {
    log("");
    log("FATAL: " + (e && e.message ? e.message : e));
    process.exitCode = 1;
  } finally {
    if (serverStop) {
      try {
        serverStop();
      } catch {
        /* ignore */
      }
    }
  }
  if (result) summarize(result);
}

/**
 * Print the summary, write the optional JSON report, set the exit code and
 * print the AUDIT_SUMMARY_JSON machine line. Uncaught page errors always fail;
 * console errors only with AUDIT_FAIL_ON_CONSOLE=1 (the app logs an
 * intermittent warning from a third-party script).
 */
export function summarize({ problems, info = [], consoleErrors = [], pageErrors = [], extra = {} }) {
  log("");
  log("========== SUMMARY ==========");
  log(`problems: ${problems.length}`);
  for (const p of problems) log("  " + JSON.stringify(p));
  if (info.length) {
    log("info (non-failing observations):");
    for (const i of info) log("  " + JSON.stringify(i));
  }
  log(`app console errors: ${consoleErrors.length}`);
  for (const c of consoleErrors.slice(0, 10)) log("  [console] " + c);
  log(`page errors: ${pageErrors.length}`);
  for (const e of pageErrors.slice(0, 10)) log("  [pageerror] " + e);
  for (const [k, v] of Object.entries(extra)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      log(`${k}: ${v}`);
  }

  const clean =
    problems.length === 0 &&
    pageErrors.length === 0 &&
    (!ENV.failOnConsole || consoleErrors.length === 0);
  if (clean) log("ALL CLEAN");
  else log("ISSUES FOUND");
  process.exitCode = clean ? 0 : 1;

  const report = {
    ok: clean,
    timestamp: new Date().toISOString(),
    baseUrl: ENV.baseUrl,
    problems,
    info,
    appConsoleErrors: consoleErrors,
    pageErrors,
    ...extra,
  };
  if (ENV.report) {
    try {
      writeFileSync(ENV.report, JSON.stringify(report, null, 2));
      log(`report written to ${ENV.report}`);
    } catch (e) {
      log(`[warn] could not write report: ${e.message}`);
    }
  }
  // Machine-readable line for CI parsers.
  log(
    `AUDIT_SUMMARY_JSON=${JSON.stringify({
      ok: clean,
      problems: problems.length,
      pageErrors: pageErrors.length,
      appConsoleErrors: consoleErrors.length,
    })}`
  );
}
