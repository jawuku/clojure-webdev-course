#!/usr/bin/env node
/**
 * Lesson-snippet audit
 * --------------------
 * Evaluates every `{ t: "code" }` block across all lessons in the three
 * courses (Clojure, Web Dev, Regex) against the live app, in the per-course
 * SCI namespaces — the same path a learner's Run button takes (evalClojure
 * enters the course namespace first).
 *
 *   - Snippets that consist only of comments are skipped (nothing to run).
 *   - Snippets that deliberately demonstrate a broken/erroring form (marked
 *     "BROKEN on purpose" / "intentionally" / etc.) are reported as info, not
 *     failures.
 *   - Anything else that fails to evaluate is a problem.
 *
 * Usage: node scripts/audit-snippets.mjs [--help]
 * Shared env vars: see scripts/lib/audit-helpers.mjs.
 */
import {
  ENV,
  log,
  launchBrowser,
  waitForScittle,
  extractModules,
  ev,
  attachErrorListeners,
  runMain,
} from "./lib/audit-helpers.mjs";

const USAGE = `Usage: node scripts/audit-snippets.mjs [--help]

Lesson-snippet audit. Shared env vars (see scripts/lib/audit-helpers.mjs):
AUDIT_BASE_URL, AUDIT_AUTO_START, AUDIT_SERVER_TIMEOUT_MS, CHROME_PATH,
AUDIT_REPORT, AUDIT_FAIL_ON_CONSOLE.`;

// Per-course namespaces mirror the app (see src/course/registry.js: clojure ->
// "user", webdev -> "web", regex -> "regex"). Keep the ns in sync with the ns
// field declared on each course — a drift would surface as snippet errors.
const COURSES = [
  { course: "clojure", ns: "user", files: ["lessonsPart1", "lessonsPart2", "lessonsPart3", "lessonsPart4", "lessonsPart5"] },
  { course: "webdev", ns: "web", files: ["webPart1", "webPart2", "webPart3", "webPart4"] },
  { course: "regex", ns: "regex", files: ["regexPart1", "regexPart2", "regexPart3"] },
];

// Snippets that deliberately show a broken/erroring form are not failures.
const INTENTIONAL = /BROKEN|intentionally|on purpose|won't run|throws an error/i;

const onlyComments = (code) =>
  code
    .trim()
    .split("\n")
    .every((l) => {
      const t = l.trim();
      return t === "" || t.startsWith(";");
    });

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
    const problems = [];
    const info = [];
    const details = [];
    let evaluated = 0;

    const applyNs = async (ns) => {
      const r = await ev(
        page,
        `(in-ns '${ns}) (clojure.core/refer-clojure) ` +
          `(clojure.core/require '[clojure.string :as str]) ` +
          `(clojure.core/require '[clojure.set :as set])`
      );
      return r.ok;
    };

    for (const c of COURSES) {
      const nsOk = await applyNs(c.ns);
      if (!nsOk) {
        // Skip the whole course: evaluating in a broken namespace would only
        // produce a cascade of misleading per-snippet errors.
        problems.push({ course: c.course, kind: "NS_SETUP", ns: c.ns, err: "in-ns / alias setup failed" });
        log(`  [skip] ${c.course}: namespace setup failed`);
        continue;
      }
      for (const f of c.files) {
        const lessons = modules.get(f)[f] || [];
        for (const lesson of lessons) {
          for (const b of lesson.content || []) {
            if (b.t !== "code" || typeof b.code !== "string") continue;
            const code = b.code;
            if (onlyComments(code)) continue; // nothing runnable
            evaluated++;
            const intentional = INTENTIONAL.test(code);
            const r = await ev(page, code);
            if (!r.ok) {
              const entry = {
                course: c.course,
                lesson: lesson.id,
                title: lesson.title,
                err: r.err,
                code: code.slice(0, 160),
              };
              if (intentional) info.push({ ...entry, kind: "INTENTIONAL_ERROR" });
              else problems.push({ ...entry, kind: "ERROR" });
            }
            details.push({
              course: c.course,
              lesson: lesson.id,
              code: code.slice(0, 200),
              value: r.ok ? r.v.slice(0, 120) : undefined,
              ok: r.ok,
            });
          }
        }
      }
    }

    log(`evaluated ${evaluated} code snippets across ${COURSES.length} courses`);
    return { problems, info, consoleErrors, pageErrors, extra: { evaluated, details } };
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
