#!/usr/bin/env node
/*
 * Content semantics guard for the JVM migration.
 *
 * The runtime audit executes code, so it never sees JavaScript/ClojureScript
 * forms that sit in `read` blocks, prose, hints or exercise tests. Phase 3
 * removed `js/`, `#js`, `clj->js`/`js->clj`, `.-length`, `cljs` and
 * `(catch :default …)` from the Clojure course; Phase 4 removed
 * ClojureScript/Reagent/Scittle from the Web Dev course. This guard walks every
 * string in the course data (all block types, exercises and cheat-sheet items)
 * so they cannot creep back in unnoticed.
 *
 * Today's occurrences are recorded in content-semantics-baseline.json: a new
 * occurrence fails, and an entry that no longer occurs also fails until it is
 * removed, so the list only shrinks as content is migrated. `--strict` ignores
 * the baseline and fails on any occurrence — the Phase 3 acceptance check.
 *
 * Usage:
 *   node scripts/check-content-semantics.mjs
 *   node scripts/check-content-semantics.mjs --strict
 *   node scripts/check-content-semantics.mjs --course regex
 *   node scripts/check-content-semantics.mjs --update-baseline
 *   node scripts/check-content-semantics.mjs --json /tmp/semantics.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const frontendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const defaultBaseline = path.join(frontendDir, "content-semantics-baseline.json");

// Each pattern matches the form as code, not as part of a longer word:
// `shadow-cljs` still counts as `cljs`, while `.-lengthy` does not match
// `.-length` and `js->clj` does not contain `clj->js`.
const TOKENS = [
  { name: "js/", pattern: /\bjs\//g },
  { name: "#js", pattern: /#js\b/g },
  { name: "clj->js", pattern: /\bclj->js\b/g },
  { name: "js->clj", pattern: /\bjs->clj\b/g },
  { name: ".-length", pattern: /\.-length\b/g },
  { name: "cljs", pattern: /\bcljs\b/g },
  { name: "catch :default", pattern: /catch\s+:default\b/g },
  // The browser-runtime course (ClojureScript/Reagent/Scittle) is gone; these
  // tokens keep its API and libraries out of the JVM course.
  { name: "ClojureScript", pattern: /\bclojurescript\b/gi },
  { name: "shadow-cljs", pattern: /\bshadow-cljs\b/gi },
  { name: "Reagent", pattern: /\breagent\b/gi },
  { name: "Scittle", pattern: /\bscittle\b/gi },
  { name: "r/atom", pattern: /\br\/atom\b/g },
];
const tokenList = TOKENS.map((token) => token.name).join(", ");

function parseArgs(argv) {
  const args = {
    courses: [],
    baseline: defaultBaseline,
    updateBaseline: false,
    strict: false,
    json: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--course") {
      args.courses.push(value);
      i += 1;
    } else if (key === "--baseline") {
      args.baseline = path.resolve(value);
      i += 1;
    } else if (key === "--update-baseline") {
      args.updateBaseline = true;
    } else if (key === "--strict") {
      args.strict = true;
    } else if (key === "--json") {
      args.json = path.resolve(value);
      i += 1;
    } else if (key === "--help" || key === "-h") {
      console.log(
        "check-content-semantics.mjs [--course ID ...] [--baseline PATH] [--strict]\n" +
          "                           [--update-baseline] [--json PATH]"
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${key}`);
    }
  }
  if (args.courses.length === 0) args.courses = ["clojure", "webdev"];
  if (args.strict && args.updateBaseline) {
    throw new Error("--strict and --update-baseline are mutually exclusive.");
  }
  return args;
}

function loadBaseline(file) {
  if (!fs.existsSync(file)) return new Set();
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const keys = Array.isArray(raw) ? raw : raw.known_occurrences;
  if (!Array.isArray(keys)) throw new Error(`${file} must contain a known_occurrences array`);
  return new Set(keys);
}

const baselineNote =
  `Known JavaScript/ClojureScript semantics (${tokenList}) in the Clojure and Web Dev ` +
  "courses, removed by Phases 3–4. Entries are course|lesson|field|token; list indexes are collapsed " +
  "(content[].code), so moving a block does not require a refresh. New entries fail and " +
  "entries that no longer occur fail until removed, so this list only shrinks. Refresh with " +
  "`yarn check:semantics --update-baseline` after reviewing the output; " +
  "`yarn check:semantics --strict` proves the course is clean.";

function writeBaseline(file, keys) {
  fs.writeFileSync(
    file,
    `${JSON.stringify({ note: baselineNote, known_occurrences: keys.sort() }, null, 2)}\n`
  );
}

// Collect every string in the course data with a path that hides list indexes:
// content[3].code becomes content[].code, exercises[1].tests[0] becomes
// exercises[].tests[]. The guard reports locations, not offsets, so blocks can
// move within a lesson without churning the baseline.
function collectStrings(value, location, out) {
  if (typeof value === "string") {
    out.push({ location, text: value });
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, `${location}[]`, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectStrings(child, location ? `${location}.${key}` : key, out);
    }
  }
}

function findOccurrences(course, containerId, containerTitle, source, location = "") {
  const strings = [];
  collectStrings(source, location, strings);
  const found = [];
  for (const { location, text } of strings) {
    for (const token of TOKENS) {
      token.pattern.lastIndex = 0;
      const matches = [...text.matchAll(token.pattern)];
      for (const match of matches) {
        found.push({
          key: `${course.id}|${containerId}|${location}|${token.name}`,
          course: course.id,
          lesson: containerId,
          title: containerTitle,
          field: location,
          token: token.name,
          start: match.index,
          sample: text.slice(Math.max(0, match.index - 60), match.index + 90).replace(/\s+/g, " ").trim(),
        });
      }
    }
  }
  return found;
}

async function loadCourses(ids) {
  const vite = await createServer({
    root: frontendDir,
    configFile: path.join(frontendDir, "vite.config.mjs"),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });
  try {
    const module = await vite.ssrLoadModule("/src/course/index.js");
    const missing = ids.filter((id) => !module.COURSES.some((course) => course.id === id));
    if (missing.length > 0) {
      throw new Error(`Unknown course id(s): ${missing.join(", ")}`);
    }
    return {
      courses: module.COURSES.filter((course) => ids.includes(course.id)),
      close: () => vite.close(),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function main() {
  return (async () => {
    const args = parseArgs(process.argv.slice(2));
    const { courses, close } = await loadCourses(args.courses);

    try {
      const occurrences = [];
      for (const course of courses) {
        for (const lesson of course.LESSONS) {
          occurrences.push(...findOccurrences(course, lesson.id, lesson.title, lesson));
        }
        if (course.cheatsheet) {
          occurrences.push(
            ...findOccurrences(
              course,
              "cheatsheet",
              `${course.name} cheat sheet`,
              course.cheatsheet,
              "groups"
            )
          );
        }
        if (course.replWelcome) {
          occurrences.push(
            ...findOccurrences(course, "repl", "REPL welcome", course.replWelcome, "replWelcome")
          );
        }
      }

      // One entry per course|lesson|field|token; the count is informational.
      const locations = new Map();
      for (const occurrence of occurrences) {
        const entry = locations.get(occurrence.key) ?? { ...occurrence, count: 0, samples: [] };
        entry.count += 1;
        if (entry.samples.length < 3) entry.samples.push(occurrence.sample);
        locations.set(occurrence.key, entry);
      }

      const baseline = loadBaseline(args.baseline);
      const current = new Set(locations.keys());
      const fresh = [...current].filter((key) => !baseline.has(key));
      const fixed = [...baseline].filter((key) => !current.has(key));
      const stale = args.strict ? [] : fixed;

      console.log(
        `Courses: ${courses.map((course) => `${course.name} (${course.id})`).join(", ")}`
      );
      console.log(
        `${occurrences.length} occurrence(s) of ${tokenList} in ${current.size} location(s)`
      );

      if (args.updateBaseline) {
        writeBaseline(args.baseline, [...current]);
        console.log(`Wrote ${args.baseline} (${current.size} entries)`);
        return 0;
      }

      if (args.strict) {
        if (occurrences.length > 0) {
          console.log(`\nJavaScript/ClojureScript semantics remain (--strict):`);
          for (const entry of locations.values()) {
            console.log(`  ${entry.key} ×${entry.count}`);
            console.log(`    ${entry.title} · ${entry.field} · ${entry.samples[0]}`);
          }
          console.log(`\nThe Clojure and Web Dev courses must not reference ${tokenList}.`);
          return 1;
        }
        console.log("\nCourses are clean: no JavaScript/ClojureScript semantics.");
        return 0;
      }

      console.log(`baseline: ${baseline.size} entries (${fresh.length} new, ${fixed.length} fixed)`);
      if (fresh.length > 0) {
        console.log("\nNew JavaScript/ClojureScript semantics (not in the baseline):");
        for (const key of fresh.slice(0, 25)) {
          const entry = locations.get(key);
          console.log(`  ${key} ×${entry.count}`);
          console.log(`    ${entry.title} · ${entry.field} · ${entry.samples[0]}`);
        }
        if (fresh.length > 25) console.log(`  … and ${fresh.length - 25} more`);
      }
      if (stale.length > 0) {
        console.log("\nNo longer present — remove these from the baseline:");
        for (const key of stale.slice(0, 25)) console.log(`  ${key}`);
        if (stale.length > 25) console.log(`  … and ${stale.length - 25} more`);
      }

      if (args.json) {
        fs.mkdirSync(path.dirname(args.json), { recursive: true });
        fs.writeFileSync(
          args.json,
          `${JSON.stringify(
            {
              courses: courses.map((course) => course.id),
              counts: { occurrences: occurrences.length, locations: current.size },
              locations: [...locations.values()].sort((a, b) => a.key.localeCompare(b.key)),
              new: fresh.sort(),
              fixed,
            },
            null,
            2
          )}\n`
        );
        console.log(`\nWrote ${args.json}`);
      }

      if (fresh.length > 0) {
        console.log("\nRemove the form or add it to the baseline after review.");
        return 1;
      }
      if (stale.length > 0) {
        console.log("\nThe baseline still lists forms that are gone; refresh it.");
        return 1;
      }
      return 0;
    } finally {
      await close();
    }
  })();
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
