#!/usr/bin/env node
/*
 * Content audit: run the entire course through the real JVM runtime.
 *
 * Loads the course modules with Vite (so `@` aliases and ESM imports work),
 * starts the desktop jar (or uses --url), then for every course:
 *   - evaluates every runnable lesson block ({ t: "code" })
 *   - runs every exercise solution against its hidden tests
 *   - evaluates every cheat-sheet example
 * `{ t: "read" }` and `{ t: "reagent" }` blocks are intentionally not runnable.
 *
 * Failures are checked against a baseline of known content debt (ClojureScript
 * snippets waiting for Phases 3–5). New failures fail CI; entries that start
 * passing also fail until removed, so the baseline only shrinks.
 *
 * Usage:
 *   node scripts/audit-content.mjs
 *   node scripts/audit-content.mjs --update-baseline
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

function parseArgs(argv) {
  const args = {
    jar: path.resolve(frontendDir, "..", "desktop", "target", "parens-desktop.jar"),
    url: null,
    json: path.resolve(frontendDir, "..", "desktop", "benchmarks", "content-audit.json"),
    baseline: defaultBaseline,
    updateBaseline: false,
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
    } else if (key === "--update-baseline") {
      args.updateBaseline = true;
    } else if (key === "--timeout-ms") {
      args.timeoutMs = Number(value);
      i += 1;
    } else if (key === "--max-p95") {
      args.maxP95 = Number(value);
      i += 1;
    } else if (key === "--help" || key === "-h") {
      console.log(
        "audit-content.mjs [--jar PATH] [--url URL] [--json PATH] [--baseline PATH]\n" +
          "                  [--update-baseline] [--timeout-ms N] [--max-p95 MS]"
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
      exercises: 0,
      cheatItems: 0,
      skippedReadables: 0,
    };

    for (const course of courses) {
      await client.api("/api/set-ns", { ns: course.ns });
      const before = failures.size;

      for (const lesson of course.LESSONS) {
        const blocks = lesson.content || [];
        for (const [index, block] of blocks.entries()) {
          if (block.t !== "code" || !block.code) {
            if (block.t === "read" || block.t === "reagent") counts.skippedReadables += 1;
            continue;
          }
          counts.snippets += 1;
          const key = failureKey(course.id, "snippet", `${lesson.id}/${index}`);
          try {
            const result = await client.eval(block.code, course.ns);
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

    console.log(
      `\n${counts.snippets} code blocks · ${counts.exercises} exercise solutions · ` +
        `${counts.cheatItems} cheat-sheet examples (${counts.skippedReadables} read-only blocks skipped)`
    );
    console.log(
      `eval latency: p50 ${p50.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms ` +
        `(budget ${args.maxP95} ms over ${client.latencies.length} calls)`
    );
    console.log(`failures: ${failures.size} (${newFailures.length} new, ${fixed.length} fixed)`);

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

    if (!args.updateBaseline && newFailures.length > 0) {
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

    const report = {
      origin,
      timeout_ms: args.timeoutMs,
      counts,
      failures: [...failures.values()].sort((a, b) => a.key.localeCompare(b.key)),
      new_failures: newFailures.sort(),
      fixed,
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

    if (args.updateBaseline) return 0;
    let ok = true;
    if (newFailures.length > 0) ok = false;
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
