#!/usr/bin/env node
/*
 * Content audit: run the entire course through the real JVM runtime.
 *
 * Loads the course modules with Vite (so `@` aliases and ESM imports work),
 * starts the desktop jar (or uses --url), then for every course:
 *   - evaluates every runnable lesson block ({ t: "code" })
 *   - renders every Hiccup block ({ t: "hiccup" }) with hiccup.core/html and
 *     records the HTML as its expected value
 *   - runs every exercise solution against its hidden tests
 *   - evaluates every cheat-sheet example
 * `{ t: "read" }` and `{ t: "live-app" }` blocks are not snippet-run: the live
 * Ring app is covered by the browser smoke test.
 *
 * Failures are checked against a baseline of known content debt (ClojureScript
 * snippets waiting for Phases 3–5). New failures fail CI; entries that start
 * passing also fail until removed, so the baseline only shrinks.
 *
 * Every passing snippet and cheat-sheet example is also compared with the value
 * and printed output recorded in content-audit-values.json, so a change that
 * makes the code run but print something different still fails. Blocks that are
 * genuinely nondeterministic (a random example) set `nondeterministic: true` in
 * the course data and are reported instead of asserted.
 *
 * Usage:
 *   node scripts/audit-content.mjs
 *   node scripts/audit-content.mjs --update-baseline
 *   node scripts/audit-content.mjs --update-values
 *   node scripts/audit-content.mjs --url http://127.0.0.1:PORT/#token=...
 *   node scripts/audit-content.mjs --jar ../desktop/target/parens-desktop.jar
 *                                --json ../desktop/benchmarks/content-audit.json
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const frontendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const defaultBaseline = path.join(frontendDir, "content-audit-baseline.json");
const defaultValues = path.join(frontendDir, "content-audit-values.json");

function parseArgs(argv) {
  const args = {
    jar: path.resolve(frontendDir, "..", "desktop", "target", "parens-desktop.jar"),
    url: null,
    json: path.resolve(frontendDir, "..", "desktop", "benchmarks", "content-audit.json"),
    baseline: defaultBaseline,
    values: defaultValues,
    updateBaseline: false,
    updateValues: false,
    timeoutMs: 2000,
    maxP95: 150,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--jar") {
      args.jar = path.resolve(value);
      i += 1;
    } else if (key === "--url") {
      args.url = value;
      i += 1;
    } else if (key === "--json") {
      args.json = path.resolve(value);
      i += 1;
    } else if (key === "--baseline") {
      args.baseline = path.resolve(value);
      i += 1;
    } else if (key === "--values") {
      args.values = path.resolve(value);
      i += 1;
    } else if (key === "--update-baseline") {
      args.updateBaseline = true;
    } else if (key === "--update-values") {
      args.updateValues = true;
    } else if (key === "--timeout-ms") {
      args.timeoutMs = Number(value);
      i += 1;
    } else if (key === "--max-p95") {
      args.maxP95 = Number(value);
      i += 1;
    } else if (key === "--help" || key === "-h") {
      console.log(
        "audit-content.mjs [--jar PATH] [--url URL] [--json PATH] [--baseline PATH]\n" +
          "                  [--values PATH] [--update-baseline] [--update-values]\n" +
          "                  [--timeout-ms N] [--max-p95 MS]"
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${key}`);
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchApp(jar, timeoutMs) {
  return new Promise((resolve, reject) => {
    const token = crypto.randomBytes(32).toString("base64url");
    const child = spawn(
      "java",
      [
        "-jar",
        jar,
        "--no-open",
        "--port",
        "0",
        "--token",
        token,
        "--timeout-ms",
        String(timeoutMs),
      ],
      { cwd: path.dirname(jar), stdio: ["ignore", "pipe", "pipe"] }
    );
    let buffer = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`app did not start in 30s\n${stderr.slice(-2000)}`));
    }, 30_000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const match = /^PARENS_URL=(.+)$/m.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolve({
          url: match[1].trim(),
          stop: async () => {
            child.kill("SIGTERM");
            await sleep(300);
          },
        });
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`app exited before it was ready (code ${code})\n${stderr.slice(-2000)}`));
    });
  });
}

function parseLaunchUrl(url) {
  const parsed = new URL(url);
  const token = new URLSearchParams(parsed.hash.replace(/^#/, "")).get("token");
  if (!token) throw new Error("--url must include the #token=… fragment printed by the app");
  return { origin: parsed.origin, token };
}

function makeClient(origin, token) {
  const latencies = [];
  async function api(pathname, body) {
    const response = await fetch(`${origin}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-parens-token": token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `${pathname} returned HTTP ${response.status}`);
    }
    if (typeof data.ms === "number") latencies.push(data.ms);
    return data;
  }
  return {
    api,
    latencies,
    eval: (code, ns) => api("/api/eval", { code, ns }),
    hiccup: (code, ns) => api("/api/hiccup", { code, ns }),
    exercise: (code, tests) => api("/api/exercise", { code, tests }),
  };
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function truncate(text, limit = 240) {
  const oneLine = String(text ?? "").replace(/\s+/g, " ").trim();
  return oneLine.length > limit ? `${oneLine.slice(0, limit - 1)}…` : oneLine;
}

function failureKey(courseId, kind, name) {
  return `${courseId}|${kind}|${name}`;
}

function loadBaseline(file) {
  if (!fs.existsSync(file)) return new Set();
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const keys = Array.isArray(raw) ? raw : raw.known_failures;
  if (!Array.isArray(keys)) throw new Error(`${file} must contain a known_failures array`);
  return new Set(keys);
}

const valuesNote =
  "Expected value (pr-str of the last form) and printed output for every passing " +
  "snippet and cheat-sheet example, keyed course|kind|name. Run " +
  "`yarn audit:content --update-values` to refresh it, and review the diff: a " +
  "changed value means the lesson now shows learners something different. " +
  "Volatile object identity hashes and generated function class names are normalized.";

function loadValues(file) {
  if (!fs.existsSync(file)) return new Map();
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const values = raw.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error(`${file} must contain a values object`);
  }
  return new Map(Object.entries(values));
}

function writeValues(file, values) {
  const lines = [...values.keys()]
    .sort()
    .map((key) => `    ${JSON.stringify(key)}: ${JSON.stringify(values.get(key))}`);
  const body = lines.length > 0 ? `${lines.join(",\n")}\n` : "";
  fs.writeFileSync(
    file,
    `{\n  "note": ${JSON.stringify(valuesNote)},\n  "values": {\n${body}  }\n}\n`
  );
}

// `#object[web$eval1812$fn__1813 0x5f3c… "web$eval1812$fn__1813@4a2b…"]`
// carries an identity hash on every run, and the eval/gensym counters shift
// whenever course content earlier in the run changes. Normalize both before an
// observed value is compared or recorded; the shape of the value still counts.
function normalizeVolatile(text) {
  return String(text ?? "")
    .replace(/0x[0-9a-fA-F]+/g, "0x…")
    .replace(/@[0-9a-fA-F]{6,}/g, "@…")
    .replace(/eval\d+/g, "eval…")
    .replace(/__\d+/g, "__…");
}

function observedValue(result) {
  const value = normalizeVolatile(result.value ?? "nil");
  const output = normalizeVolatile(result.output ?? "");
  return output ? { value, output } : { value };
}

function sameValue(expected, actual) {
  return expected.value === actual.value && (expected.output ?? "") === (actual.output ?? "");
}

function describeValueDifference(expected, actual) {
  if (expected.value !== actual.value) {
    return `value changed: expected ${truncate(expected.value)}, got ${truncate(actual.value)}`;
  }
  return (
    `printed output changed: expected ${truncate(expected.output, 120)}, ` +
    `got ${truncate(actual.output, 120)}`
  );
}

async function loadCourses() {
  const vite = await createServer({
    root: frontendDir,
    configFile: path.join(frontendDir, "vite.config.mjs"),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });
  try {
    const module = await vite.ssrLoadModule("/src/course/index.js");
    return { courses: module.COURSES, close: () => vite.close() };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { courses, close } = await loadCourses();
  let app = null;

  try {
    let origin;
    let client;
    if (args.url) {
      const parsed = parseLaunchUrl(args.url);
      origin = parsed.origin;
      client = makeClient(parsed.origin, parsed.token);
      console.log(`App: ${origin} (existing)`);
    } else {
      if (!fs.existsSync(args.jar)) {
        throw new Error(`Jar not found at ${args.jar}. Run \`lein uberjar\` in desktop/ first.`);
      }
      app = await launchApp(args.jar, args.timeoutMs);
      const parsed = parseLaunchUrl(app.url);
      origin = parsed.origin;
      client = makeClient(parsed.origin, parsed.token);
      console.log(`App: ${origin} (timeout ${args.timeoutMs} ms)`);
    }

    const failures = new Map();
    const counts = {
      snippets: 0,
      hiccupSnippets: 0,
      exercises: 0,
      cheatItems: 0,
      skippedReadables: 0,
    };
    const expectations = loadValues(args.values);
    const unasserted = new Map();
    const recorded = new Map();
    const seenKeys = new Set();
    let nondeterministic = 0;

    // Compare one passing item with content-audit-values.json. A missing entry
    // is reported separately: it is new content nobody has reviewed yet, not
    // known debt, so it must not be absorbed into the failure baseline.
    function assertValue({ key, kind, course, lesson, title, group, name, index, code, result, block }) {
      if (block.nondeterministic) {
        nondeterministic += 1;
        return;
      }
      seenKeys.add(key);
      const actual = observedValue(result);
      const expected = expectations.get(key);
      if (!expected) {
        unasserted.set(key, {
          key,
          course: course.id,
          kind,
          lesson,
          title,
          group,
          name,
          index,
          code: truncate(code, 500),
          value: actual.value,
          ...(actual.output ? { output: actual.output } : {}),
        });
      } else if (!sameValue(expected, actual)) {
        failures.set(key, {
          key,
          course: course.id,
          kind,
          lesson,
          title,
          group,
          name,
          index,
          code: truncate(code, 500),
          error: describeValueDifference(expected, actual),
        });
      }
      recorded.set(key, actual);
    }

    for (const course of courses) {
      await client.api("/api/set-ns", { ns: course.ns });
      const before = failures.size;

      for (const lesson of course.LESSONS) {
        const blocks = lesson.content || [];
        for (const [index, block] of blocks.entries()) {
          if ((block.t !== "code" && block.t !== "hiccup") || !block.code) {
            if (block.t === "read" || block.t === "live-app") counts.skippedReadables += 1;
            continue;
          }
          const isHiccup = block.t === "hiccup";
          if (isHiccup) counts.hiccupSnippets += 1;
          else counts.snippets += 1;
          const key = failureKey(course.id, "snippet", `${lesson.id}/${index}`);
          try {
            const response = isHiccup
              ? await client.hiccup(block.code, course.ns)
              : await client.eval(block.code, course.ns);
            // A Hiccup block's value is the HTML hiccup.core/html produced.
            const result = isHiccup
              ? { ok: response.ok === true, value: response.html ?? "", output: response.output ?? "", error: response.error }
              : response;
            if (!result.ok) {
              failures.set(key, {
                key,
                course: course.id,
                lesson: lesson.id,
                title: lesson.title,
                kind: "snippet",
                index,
                code: truncate(block.code, 500),
                error: truncate(result.error),
              });
            } else {
              assertValue({
                key,
                kind: "snippet",
                course,
                lesson: lesson.id,
                title: lesson.title,
                index,
                code: block.code,
                result,
                block,
              });
            }
          } catch (error) {
            failures.set(key, {
              key,
              course: course.id,
              lesson: lesson.id,
              title: lesson.title,
              kind: "snippet",
              index,
              code: truncate(block.code, 500),
              error: `transport: ${truncate(error.message)}`,
            });
          }
        }

        for (const [index, exercise] of (lesson.exercises || []).entries()) {
          counts.exercises += 1;
          const key = failureKey(course.id, "exercise", `${lesson.id}/${index}`);
          try {
            const result = await client.exercise(exercise.solution, exercise.tests || []);
            if (!result.passed) {
              const failing = (result.results || [])
                .filter((r) => !r.ok)
                .map((r) => `${r.test} -> ${r.detail}`)
                .join("; ");
              failures.set(key, {
                key,
                course: course.id,
                lesson: lesson.id,
                title: lesson.title,
                kind: "exercise",
                index,
                code: truncate(exercise.solution, 500),
                error: truncate(result.runError || failing || "exercise did not pass"),
              });
            }
          } catch (error) {
            failures.set(key, {
              key,
              course: course.id,
              lesson: lesson.id,
              title: lesson.title,
              kind: "exercise",
              index,
              code: truncate(exercise.solution, 500),
              error: `transport: ${truncate(error.message)}`,
            });
          }
        }
      }

      for (const group of course.cheatsheet || []) {
        for (const item of group.items || []) {
          counts.cheatItems += 1;
          const key = failureKey(course.id, "cheatsheet", `${group.group}/${item.name}`);
          try {
            const result = await client.eval(item.example, course.ns);
            if (!result.ok) {
              failures.set(key, {
                key,
                course: course.id,
                kind: "cheatsheet",
                group: group.group,
                name: item.name,
                code: truncate(item.example, 500),
                error: truncate(result.error),
              });
            } else {
              assertValue({
                key,
                kind: "cheatsheet",
                course,
                group: group.group,
                name: item.name,
                code: item.example,
                result,
                block: {},
              });
            }
          } catch (error) {
            failures.set(key, {
              key,
              course: course.id,
              kind: "cheatsheet",
              group: group.group,
              name: item.name,
              code: truncate(item.example, 500),
              error: `transport: ${truncate(error.message)}`,
            });
          }
        }
      }

      console.log(
        `${course.name.padEnd(8)} ${course.LESSONS.length} lessons · ` +
          `${failures.size - before} failure(s) in this course`
      );
    }

    const p50 = percentile(client.latencies, 0.5);
    const p95 = percentile(client.latencies, 0.95);
    const baseline = loadBaseline(args.baseline);
    const current = new Set(failures.keys());
    const newFailures = [...current].filter((key) => !baseline.has(key));
    const fixed = [...baseline].filter((key) => !current.has(key));
    const staleValues = [...expectations.keys()].filter((key) => !seenKeys.has(key));
    const assertedValues = seenKeys.size - unasserted.size;
    const refreshing = args.updateBaseline || args.updateValues;

    console.log(
      `\n${counts.snippets} code blocks · ${counts.hiccupSnippets} Hiccup previews · ` +
        `${counts.exercises} exercise solutions · ${counts.cheatItems} cheat-sheet examples ` +
        `(${counts.skippedReadables} read-only/live-app blocks skipped)`
    );
    console.log(
      `eval latency: p50 ${p50.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms ` +
        `(budget ${args.maxP95} ms over ${client.latencies.length} calls)`
    );
    console.log(`failures: ${failures.size} (${newFailures.length} new, ${fixed.length} fixed)`);
    console.log(
      `expected values: ${assertedValues} asserted · ${unasserted.size} unrecorded · ` +
        `${staleValues.length} stale · ${nondeterministic} nondeterministic`
    );

    if (args.updateBaseline) {
      fs.writeFileSync(
        args.baseline,
        `${JSON.stringify(
          {
            note: "Known content debt for the JVM migration. The audit fails on new entries and on entries that start passing, so this list only shrinks. Refresh with --update-baseline after reviewing the report.",
            known_failures: [...current].sort(),
          },
          null,
          2
        )}\n`
      );
      console.log(`Wrote ${args.baseline} (${current.size} entries)`);
    }

    if (args.updateValues) {
      writeValues(args.values, recorded);
      console.log(`Wrote ${args.values} (${recorded.size} expected values)`);
    }

    if (!refreshing && newFailures.length > 0) {
      console.log("\nNew failures (not in the baseline):");
      for (const key of newFailures.slice(0, 25)) {
        const failure = failures.get(key);
        console.log(`  ${key}\n    ${failure?.error ?? "(no detail)"}`);
      }
      if (newFailures.length > 25) console.log(`  … and ${newFailures.length - 25} more`);
    }
    if (fixed.length > 0) {
      console.log("\nNow passing — remove these from the baseline:");
      for (const key of fixed.slice(0, 25)) console.log(`  ${key}`);
    }
    if (!refreshing && unasserted.size > 0) {
      console.log("\nNo expected value recorded (run `yarn audit:content --update-values`):");
      for (const entry of [...unasserted.values()].slice(0, 25)) {
        console.log(`  ${entry.key} => ${truncate(entry.value, 120)}`);
      }
      if (unasserted.size > 25) console.log(`  … and ${unasserted.size - 25} more`);
    }
    if (!refreshing && staleValues.length > 0) {
      console.log("\nExpected values for content that no longer runs; refresh them:");
      for (const key of staleValues.slice(0, 25)) console.log(`  ${key}`);
      if (staleValues.length > 25) console.log(`  … and ${staleValues.length - 25} more`);
    }

    const report = {
      origin,
      timeout_ms: args.timeoutMs,
      counts,
      failures: [...failures.values()].sort((a, b) => a.key.localeCompare(b.key)),
      new_failures: newFailures.sort(),
      fixed,
      values: {
        asserted: assertedValues,
        nondeterministic,
        unrecorded: [...unasserted.values()].sort((a, b) => a.key.localeCompare(b.key)),
        stale: staleValues.sort(),
      },
      latency: {
        calls: client.latencies.length,
        p50_ms: Number(p50.toFixed(2)),
        p95_ms: Number(p95.toFixed(2)),
        max_ms: client.latencies.length ? Number(Math.max(...client.latencies).toFixed(2)) : 0,
      },
    };
    fs.mkdirSync(path.dirname(args.json), { recursive: true });
    fs.writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${args.json}`);

    if (refreshing) {
      if (!args.updateValues && unasserted.size > 0) {
        console.log(
          `\n${unasserted.size} item(s) still have no expected value; also run --update-values.`
        );
      }
      if (!args.updateValues && staleValues.length > 0) {
        console.log(`\n${staleValues.length} stale expected value(s); also run --update-values.`);
      }
      return 0;
    }
    let ok = true;
    if (newFailures.length > 0) ok = false;
    if (unasserted.size > 0) {
      console.log("\nSome passing items have no expected value recorded.");
      ok = false;
    }
    if (staleValues.length > 0) {
      console.log("\nSome expected values match no current content; refresh the values file.");
      ok = false;
    }
    if (fixed.length > 0) {
      console.log("\nThe baseline contains entries that now pass; refresh it.");
      ok = false;
    }
    if (p95 > args.maxP95) {
      console.log(`\neval p95 ${p95.toFixed(1)} ms exceeds the ${args.maxP95} ms budget.`);
      ok = false;
    }
    return ok ? 0 : 1;
  } finally {
    await close();
    if (app) await app.stop();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
