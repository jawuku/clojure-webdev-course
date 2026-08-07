#!/usr/bin/env node
/**
 * Exercise audit
 * --------------
 * Verifies every lesson exercise in the three courses (Clojure, Web Dev,
 * Regex) against the live app. Each exercise's solution is evaluated in its
 * own isolated SCI namespace — exactly how the app's runExerciseTests behaves —
 * then every test expression in the exercise must evaluate to `true`.
 *
 *   - A solution that fails to evaluate is a RUN_ERROR problem.
 *   - Any test that does not produce `true` is a TEST_FAIL problem.
 *
 * Usage: node scripts/audit-exercises.mjs [--help]
 * Shared env vars: see scripts/lib/audit-helpers.mjs.
 */
import {
  ENV,
  log,
  launchBrowser,
  waitForScittle,
  extractModules,
  attachErrorListeners,
  runMain,
} from "./lib/audit-helpers.mjs";

const USAGE = `Usage: node scripts/audit-exercises.mjs [--help]

Exercise audit. Shared env vars (see scripts/lib/audit-helpers.mjs):
AUDIT_BASE_URL, AUDIT_AUTO_START, AUDIT_SERVER_TIMEOUT_MS, CHROME_PATH,
AUDIT_REPORT, AUDIT_FAIL_ON_CONSOLE.`;

const COURSES = [
  { course: "clojure", ns: "user", files: ["lessonsPart1", "lessonsPart2", "lessonsPart3", "lessonsPart4", "lessonsPart5"] },
  { course: "webdev", ns: "web", files: ["webPart1", "webPart2", "webPart3", "webPart4"] },
  { course: "regex", ns: "regex", files: ["regexPart1", "regexPart2", "regexPart3"] },
];

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

    const modules = await extractModules(COURSES.flatMap((c) => c.files));
    const exercises = [];
    for (const c of COURSES) {
      for (const f of c.files) {
        for (const lesson of modules.get(f)[f] || []) {
          for (const ex of lesson.exercises || []) {
            exercises.push({
              course: c.course,
              ns: c.ns,
              lesson: lesson.id,
              title: lesson.title,
              prompt: ex.prompt,
              starter: ex.starter || "",
              tests: ex.tests || [],
              solution: ex.solution || "",
              hint: ex.hint || "",
            });
          }
        }
      }
    }

    // Evaluate everything inside one page.evaluate: scittle's eval_string is
    // synchronous, so all exercises can run in a single round trip.
    const results = await page.evaluate((exs) => {
      const scittle = window.scittle.core;
      const out = [];
      exs.forEach((ex, i) => {
        const ns = "audit" + i;
        let setupErr = null;
        let runErr = null;
        const results = [];
        try {
          scittle.eval_string(
            `(in-ns '${ns}) (clojure.core/refer-clojure) ` +
              `(clojure.core/require '[clojure.string :as str]) ` +
              `(clojure.core/require '[clojure.set :as set])`
          );
        } catch (e) {
          setupErr = String((e && e.message) || e).slice(0, 100);
        }
        if (!setupErr) {
          try {
            scittle.eval_string(`(def answer (do\n${ex.solution}\n))`);
          } catch (e) {
            runErr = String((e && e.message) || e).slice(0, 140);
          }
          if (!runErr) {
            for (const t of ex.tests) {
              try {
                results.push({ ok: String(scittle.eval_string(`(pr-str (do\n${t}\n))`)) === "true" });
              } catch (e) {
                results.push({ ok: false, err: String((e && e.message) || e).slice(0, 100) });
              }
            }
          }
        }
        try {
          scittle.eval_string(`(in-ns '${ex.ns})`);
        } catch (e) {
          /* restore is best-effort */
        }
        out.push({ i, setupErr, runErr, results });
      });
      return out;
    }, exercises);

    const problems = [];
    results.forEach((r, i) => {
      const ex = exercises[i];
      if (r.setupErr || r.runErr) {
        problems.push({
          course: ex.course,
          lesson: ex.lesson,
          title: ex.title,
          kind: "RUN_ERROR",
          setupErr: r.setupErr,
          runErr: r.runErr,
        });
      } else {
        const bad = r.results.map((t, j) => ({ j, ok: t.ok, err: t.err })).filter((t) => !t.ok);
        if (bad.length) {
          problems.push({ course: ex.course, lesson: ex.lesson, title: ex.title, kind: "TEST_FAIL", fails: bad });
        }
      }
    });
    const byCourse = {};
    for (const p of problems) byCourse[p.course] = (byCourse[p.course] || 0) + 1;
    log(
      `evaluated ${exercises.length} exercises` +
        (Object.keys(byCourse).length ? ` | problems by course: ${JSON.stringify(byCourse)}` : " | all clean")
    );

    return { problems, info: [], consoleErrors, pageErrors, extra: { total: exercises.length, byCourse } };
  } finally {
    try {
      await browser.close();
    } catch {
      /* already closed */
    }
  }
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  log(USAGE);
  process.exit(0);
}

runMain(runAudit);
