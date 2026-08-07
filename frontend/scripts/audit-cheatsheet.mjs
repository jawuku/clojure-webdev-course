#!/usr/bin/env node
/**
 * Cheat-sheet namespace audit
 * ---------------------------
 * Verifies every runnable example across the three cheat sheets (Clojure,
 * Web Dev, Regex) against the live app, in the per-course SCI namespaces:
 *
 *   1. Each course's active namespace matches the ns declared on its course
 *      (course/registry.js — a mismatch here is a regression in isolation).
 *   2. Every example evaluates twice (redefinition / rerun tolerance) and
 *      once more in full sequence (order dependence) — zero errors.
 *   3. ~40 curated examples still produce their expected output.
 *   4. No vars leak across courses (cheat-sheet defs stay in their course ns).
 *   5. The real UI Run buttons all execute without errors, including when the
 *      app boots straight into a non-Clojure course.
 *
 * Usage: node scripts/audit-cheatsheet.mjs [--help]
 * Shared env vars: see scripts/lib/audit-helpers.mjs.
 */
import {
  ENV,
  sleep,
  log,
  launchBrowser,
  waitForScittle,
  ev,
  attachErrorListeners,
  runMain,
} from "./lib/audit-helpers.mjs";

const USAGE = `Usage: node scripts/audit-cheatsheet.mjs [--help]

Cheat-sheet namespace audit. Shared env vars (see scripts/lib/audit-helpers.mjs):
AUDIT_BASE_URL, AUDIT_AUTO_START, AUDIT_SERVER_TIMEOUT_MS, CHROME_PATH,
AUDIT_REPORT, AUDIT_FAIL_ON_CONSOLE.`;

// One entry per course cheat sheet. `ns` MUST match the `ns` field declared on
// the course in src/course/*.js (built by course/registry.js). If they drift,
// the audit reports a WRONG_NS problem — that is the check, not the doc.
const COURSE_CONFIG = {
  clojure: { file: "cheatsheet", exportKey: "CHEATSHEET", ns: "user" },
  webdev: { file: "webCheatsheet", exportKey: "WEB_CHEATSHEET", ns: "web" },
  regex: { file: "regexCheatsheet", exportKey: "REGEX_CHEATSHEET", ns: "regex" },
};

// Symbols defined by cheat-sheet examples that must stay inside their course
// namespace (defn sq, defn from, defmacro unless, defrecord P, defprotocol N).
const LEAK_SYMBOLS = ["sq", "from", "unless", "P", "N"];

// Curated regression values. Matched as substrings of the printed result.
const EXPECT = {
  clojure: {
    "+  -  *  /": "6", "def / defn": "36", case: ":two", "loop / recur": "6",
    destructuring: '"Ada"', "if-let / when-let": '"Hi Ada"',
    defmacro: "(if false nil :ran)", macroexpand: "(if true (do :ok))",
    "defprotocol / defrecord": "7", reify: "5", "try / catch / finally": ":caught",
    atom: "42", "swap!": "1", "reset!": "99", require: '"HI"', "clojure.set": "#{2 3}",
    "map-indexed": '([0 "red"] [1 "green"])', "lazy-seq": "(100 101 102 103)",
    "some / every?": "[true false]",
  },
  webdev: {
    "children from data": "[:ul [:li 1] [:li 2] [:li 3]]", "^{:key ...}": "[:li :a]",
    "props as a map": '[:p "Ada"]', "swap! + conj": "[1 2 3]",
    "js->clj": "{:a 1}", "clj->js": "#js", mapv: "[{:n 2} {:n 3}]", remove: "[1 3]",
    "update / assoc": "{:done true}", "str/includes?": "true",
  },
  regex: {
    "re-find": '"12"', "re-seq": '("1" "22")', "re-matches": '"123"',
    "str/replace": '"a*b*"', "$1 $2": '"34-12"', "flags (i)": '"CAT"', "flags (m s)": '"b"',
    "(?<=...)": '"42"', [String.fromCharCode(92) + "1"]: '["oo" "o"]', "$<name>": '"[2026]"',
    "re-pattern": '"9"', "+? *?": '"<a>"', "replace + fn": '"a[1]"',
    "(?<!...)": '("7" "12")', "(?<name>...)": '["2026" "2026"]',
  },
};

async function runAudit() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const consoleErrors = [];
    const pageErrors = [];
    attachErrorListeners(page, consoleErrors, pageErrors);

    await page.goto(ENV.baseUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await waitForScittle(page);

    const switchCourse = async (id) => {
      // waitForScittle only guarantees the runtime is up, not that React has
      // painted the sidebar — guard the first click too.
      await page.waitForSelector('[data-testid="course-switcher-btn"]', {
        visible: true,
        timeout: 10000,
      });
      await page.click('[data-testid="course-switcher-btn"]');
      await page.waitForSelector(`[data-testid="course-option-${id}"]`, {
        visible: true,
        timeout: 10000,
      });
      await page.click(`[data-testid="course-option-${id}"]`);
      await sleep(1500); // let setCourseNs settle before the first probe
    };

    const sheets = await loadSheets();

    const problems = [];
    const info = [];
    const sheetStats = [];

    for (const sheet of sheets) {
      await switchCourse(sheet.course);
      const nsR = await ev(page, "(str (ns-name *ns*))");
      const ns = nsR.ok ? nsR.v.replace(/"/g, "") : "PROBE-FAILED";
      log(`\n=== ${sheet.course}: active ns = ${ns} (expected ${sheet.ns}) ===`);
      if (ns !== sheet.ns)
        problems.push({ course: sheet.course, kind: "WRONG_NS", ns, want: sheet.ns });

      let fails = 0, rerunDiffs = 0, seqFails = 0;
      for (const it of sheet.items) {
        const r1 = await ev(page, it.example);
        if (!r1.ok) {
          fails++;
          problems.push({ course: sheet.course, name: it.name, kind: "ERROR", err: r1.err });
          continue;
        }
        const r2 = await ev(page, it.example);
        if (!r2.ok) {
          fails++;
          problems.push({ course: sheet.course, name: it.name, kind: "ERROR_ON_RERUN", err: r2.err, first: r1.v });
          continue;
        }
        if (r1.v !== r2.v) {
          rerunDiffs++;
          problems.push({ course: sheet.course, name: it.name, kind: "RERUN_DIFF", run1: r1.v, run2: r2.v });
        }
        if (r1.v.includes("#object["))
          info.push({ course: sheet.course, name: it.name, kind: "OBJECT_VALUE", v: r1.v.slice(0, 100) });
        const exp = EXPECT[sheet.course] && EXPECT[sheet.course][it.name];
        if (exp !== undefined && !r1.v.includes(exp))
          problems.push({ course: sheet.course, name: it.name, kind: "EXPECTED_MISMATCH", want: exp, got: r1.v.slice(0, 90) });
      }
      for (const it of sheet.items) {
        const r = await ev(page, it.example);
        if (!r.ok) {
          seqFails++;
          problems.push({ course: sheet.course, name: it.name, kind: "ERROR_IN_SEQUENCE", err: r.err });
        }
      }
      log(
        `  items: ${sheet.items.length} | errors: ${fails} | rerun diffs: ${rerunDiffs} ` +
          `| in-sequence errors: ${seqFails}`
      );
      sheetStats.push({ course: sheet.course, ns, items: sheet.items.length, fails, rerunDiffs, seqFails });
    }

    // --- Cross-course leak checks (resolve returns nil for a missing var; no console noise) ---
    await switchCourse("webdev");
    log("\n=== Cross-course leakage (webdev view) ===");
    for (const name of LEAK_SYMBOLS) {
      const inWeb = await ev(page, `(resolve '${name})`);
      const inUser = await ev(page, `(resolve 'user/${name})`);
      const webV = inWeb.ok ? String(inWeb.v).slice(0, 60) : inWeb.err;
      const userV = inUser.ok ? (inUser.v === "nil" ? "nil" : "present") : inUser.err;
      const leak = inWeb.ok && inWeb.v !== "nil";
      if (leak) problems.push({ course: "cross", kind: "LEAK", name, inWeb: webV });
      log(`  ${name}: in web ns -> ${webV} | in user ns -> ${userV}${leak ? " *** LEAK ***" : ""}`);
    }
    await switchCourse("regex");
    for (const name of LEAK_SYMBOLS) {
      const r = await ev(page, `(resolve '${name})`);
      const leak = r.ok && r.v !== "nil";
      if (leak) problems.push({ course: "cross", kind: "LEAK", name, ns: "regex" });
      log(`  ${name}: in regex ns -> ${r.ok ? r.v : r.err}${leak ? " *** LEAK ***" : ""}`);
    }

    // --- UI click-through: press every real Run button ---
    log("\n=== UI click-through ===");
    const uiErrors = [];
    for (const sheet of sheets) {
      await switchCourse(sheet.course);
      const open = await page.evaluate(() => !!document.querySelector(".cheatsheet-page"));
      if (!open) {
        await page.click('[data-testid="open-cheatsheet"]');
        await sleep(1200);
      }
      const res = await page.evaluate(() => {
        const items = [...document.querySelectorAll(".cheat-item")];
        for (const el of items) el.querySelector(".cheat-run").click();
        return items.map((el) => ({
          name: el.querySelector(".cheat-name").textContent.trim(),
          error: !!el.querySelector(".out-error"),
        }));
      });
      await sleep(2000);
      const errs = res.filter((r) => r.error);
      for (const r of errs) {
        uiErrors.push(r.name);
        problems.push({ course: sheet.course, kind: "UI_RUN_ERROR", name: r.name });
      }
      log(`  ${sheet.course}: clicked ${res.length} Runs, UI errors: ${errs.length}`);
    }

    // --- Boot straight into webdev: cheat Run available before any other course ---
    const p2 = await browser.newPage();
    await p2.evaluateOnNewDocument(() => {
      localStorage.setItem("parens_active_course_v1", "webdev");
    });
    attachErrorListeners(p2, consoleErrors, pageErrors, "BOOT: ");
    await p2.goto(ENV.baseUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await waitForScittle(p2);
    await p2.click('[data-testid="open-cheatsheet"]').catch(() => {});
    await sleep(1200);
    await p2.evaluate(() => {
      const el = [...document.querySelectorAll(".cheat-item")].find(
        (x) => x.querySelector(".cheat-name").textContent.trim() === "component"
      );
      if (el) el.querySelector(".cheat-run").click();
    });
    await sleep(800);
    const bootResult = await p2.evaluate(() => {
      const el = [...document.querySelectorAll(".cheat-item")].find(
        (x) => x.querySelector(".cheat-name").textContent.trim() === "component"
      );
      const out = el && el.querySelector(".cheat-result");
      return out ? out.textContent.trim().slice(0, 120) : "NO RESULT";
    });
    log("\n=== Boot-into-webdev: cheat Run on component ===");
    log(`  result: ${JSON.stringify(bootResult)}`);
    if (!String(bootResult).includes("=>"))
      problems.push({ course: "boot-webdev", kind: "UI_RUN_ERROR", name: "component", got: bootResult });
    await p2.close();

    return { problems, info, consoleErrors, pageErrors, extra: { sheets: sheetStats, uiErrors, bootResult } };
  } finally {
    try {
      await browser.close();
    } catch {
      /* already closed */
    }
  }
}

async function loadSheets() {
  const { extractModules } = await import("./lib/audit-helpers.mjs");
  const modules = await extractModules(Object.values(COURSE_CONFIG).map((c) => c.file));
  const sheets = [];
  for (const [courseId, cfg] of Object.entries(COURSE_CONFIG)) {
    const list = modules.get(cfg.file)[cfg.exportKey];
    if (!list)
      throw new Error(
        `Export "${cfg.exportKey}" not found in ${cfg.file} — ` +
          `check COURSE_CONFIG or the data file's export name.`
      );
    sheets.push({
      course: courseId,
      ns: cfg.ns,
      items: list.flatMap((g) => g.items.map((it) => ({ name: it.name, example: it.example }))),
    });
  }
  return sheets;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  log(USAGE);
  process.exit(0);
}

runMain(runAudit);
