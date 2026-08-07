#!/usr/bin/env node
/**
 * Reagent snippet audit
 * ---------------------
 * Covers the `{ t: "reagent" }` live-component blocks in the Web Dev course —
 * the only lesson blocks rendered through renderReagent (mounted into a real
 * DOM node) rather than evalClojure. This audit drives the real UI exactly as
 * a learner would:
 *
 *   1. Switches to the Web Dev course and waits for the Reagent runtime
 *      (React 18 + ReactDOM + the scittle reagent plugin, loaded via the
 *      course's runtimeScripts).
 *   2. Opens every lesson that contains a reagent block.
 *   3. Asserts each block auto-renders (ReagentSnippet runs on mount), with
 *      no error and the expected text visible in the live preview.
 *   4. Clicks the block's real Run button and asserts the re-run stays clean.
 *   5. Exercises the interactive blocks (counter, live form, shopping list,
 *      to-do app) by clicking buttons / typing, asserting the UI actually
 *      updates — proving Reagent reactivity, not just a clean eval.
 *
 * Usage: node scripts/audit-reagent.mjs [--help]
 * Shared env vars: see scripts/lib/audit-helpers.mjs.
 */
import {
  ENV,
  sleep,
  log,
  launchBrowser,
  waitForScittle,
  extractModules,
  attachErrorListeners,
  runMain,
} from "./lib/audit-helpers.mjs";

const USAGE = `Usage: node scripts/audit-reagent.mjs [--help]

Reagent-block audit. Shared env vars (see scripts/lib/audit-helpers.mjs):
AUDIT_BASE_URL, AUDIT_AUTO_START, AUDIT_SERVER_TIMEOUT_MS, CHROME_PATH,
AUDIT_REPORT, AUDIT_FAIL_ON_CONSOLE.`;

// Every lesson holding a reagent block, with the text each block's live
// preview must contain, in lesson-content order (matching DOM order). The
// optional `interact` entry turns the block into a reactivity check too.
const LESSON_SPECS = [
  {
    lesson: "hiccup-intro",
    blocks: [
      { expect: ["Hello, Hiccup!", "This is real HTML, described as a Clojure vector."] },
      { expect: ["Styled with data", "The style attribute is a map of CSS properties."] },
    ],
  },
  {
    lesson: "hiccup-from-data",
    blocks: [
      { expect: ["apple", "plum", "cherry"] },
      { expect: ["Ada", "Alan", "Logician", "Clojure's creator"] },
      { expect: ["Dashboard", "Welcome back!"] },
    ],
  },
  {
    lesson: "first-component",
    blocks: [
      { expect: ["Hi from a component!", "A component is just a function that returns Hiccup."] },
      { expect: ["ClojureScript Rocks", "</>"] },
    ],
  },
  {
    lesson: "props-composition",
    blocks: [
      { expect: ["Clojure", "Web", "Fun"] },
      { expect: ["Ada Lovelace", "First programmer"] },
    ],
  },
  {
    lesson: "state-atom",
    blocks: [
      {
        expect: ["Count: 0"],
        interact: { kind: "counter" },
      },
    ],
  },
  {
    lesson: "events-forms",
    blocks: [
      {
        expect: ["Start typing above"],
        interact: { kind: "form", type: "Ada", expect: "Hello, Ada!" },
      },
    ],
  },
  {
    lesson: "lists-keys",
    blocks: [
      {
        expect: ["Shopping list", "Milk", "Bread"],
        interact: { kind: "shopping", type: "Eggs", button: "Add", expect: "Eggs" },
      },
    ],
  },
  {
    lesson: "todo-capstone",
    blocks: [
      {
        expect: ["My Todos", "Learn Hiccup", "Build a component", "1 of 2 done"],
        interact: { kind: "todo" },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// In-page helpers (all scoped to a snippet by its DOM index, which matches the
// order the reagent blocks appear in the lesson content).
// ---------------------------------------------------------------------------

async function previewText(page, i) {
  return page.evaluate((idx) => {
    const s = document.querySelectorAll('[data-testid="reagent-snippet"]')[idx];
    const p = s && s.querySelector('[data-testid="reagent-preview"]');
    return p ? p.textContent : "";
  }, i);
}

async function snippetError(page, i) {
  return page.evaluate((idx) => {
    const s = document.querySelectorAll('[data-testid="reagent-snippet"]')[idx];
    const e = s && s.querySelector('[data-testid="reagent-error"]');
    return e ? e.textContent.trim() : "";
  }, i);
}

// Poll until the block has rendered content (or surfaced an error).
async function waitForRender(page, i, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const err = await snippetError(page, i);
    if (err) return "error";
    if ((await previewText(page, i)).trim()) return "ok";
    await sleep(400);
  }
  return "timeout";
}

async function waitForPreviewText(page, i, text, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await previewText(page, i)).includes(text)) return true;
    await sleep(300);
  }
  return false;
}

async function clickPreviewButton(page, i, label) {
  const snippets = await page.$$('[data-testid="reagent-snippet"]');
  if (!snippets[i]) return false;
  const preview = await snippets[i].$('[data-testid="reagent-preview"]');
  if (!preview) return false;
  const buttons = await preview.$$("button");
  for (const b of buttons) {
    const t = await b.evaluate((el) => (el.textContent || "").trim());
    if (t === label) {
      await b.click();
      return true;
    }
  }
  return false;
}

async function clickPreviewCheckbox(page, i, nth) {
  const snippets = await page.$$('[data-testid="reagent-snippet"]');
  if (!snippets[i]) return false;
  const preview = await snippets[i].$('[data-testid="reagent-preview"]');
  if (!preview) return false;
  const boxes = await preview.$$('input[type="checkbox"]');
  if (!boxes[nth]) return false;
  await boxes[nth].click();
  return true;
}

async function typeIntoPreviewInput(page, i, text) {
  const snippets = await page.$$('[data-testid="reagent-snippet"]');
  if (!snippets[i]) return false;
  const preview = await snippets[i].$('[data-testid="reagent-preview"]');
  if (!preview) return false;
  const input = await preview.$("input");
  if (!input) return false;
  // Focus the input and CONFIRM focus landed before typing: right after a Run
  // click React may be mid-render, and a click that fails to focus sends the
  // keystrokes nowhere (the flaky failure mode this audit guards against).
  let focused = false;
  for (let attempt = 0; attempt < 3 && !focused; attempt++) {
    await input.click();
    await sleep(200);
    focused = await input.evaluate((el) => document.activeElement === el);
  }
  if (!focused) return false;
  await input.type(text);
  return true;
}

// Select all + Backspace to empty a controlled input before a retry.
async function clearPreviewInput(page, i) {
  const snippets = await page.$$('[data-testid="reagent-snippet"]');
  if (!snippets[i]) return false;
  const preview = await snippets[i].$('[data-testid="reagent-preview"]');
  if (!preview) return false;
  const input = await preview.$("input");
  if (!input) return false;
  await input.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  return true;
}

async function clickRun(page, i) {
  const snippets = await page.$$('[data-testid="reagent-snippet"]');
  if (!snippets[i]) return false;
  const run = await snippets[i].$('[data-testid="reagent-run"]');
  if (!run) return false;
  await run.click();
  return true;
}

// ---------------------------------------------------------------------------
// Reactivity checks for the interactive blocks.
// ---------------------------------------------------------------------------

async function runInteractivity(page, spec, blockIndex, problems) {
  const interact = spec.blocks[blockIndex].interact;
  const tag = { lesson: spec.lesson, block: blockIndex };
  const want = interact.expect;
  switch (interact.kind) {
    case "counter":
      if (!(await clickPreviewButton(page, blockIndex, "+")))
        problems.push({ ...tag, kind: "INTERACT_CLICK", target: "+" });
      else if (!(await waitForPreviewText(page, blockIndex, "Count: 1")))
        problems.push({ ...tag, kind: "INTERACT_EXPECT", want: "Count: 1" });
      else if (!(await clickPreviewButton(page, blockIndex, "-")))
        problems.push({ ...tag, kind: "INTERACT_CLICK", target: "-" });
      else if (!(await waitForPreviewText(page, blockIndex, "Count: 0")))
        problems.push({ ...tag, kind: "INTERACT_EXPECT", want: "Count: 0" });
      break;
    case "form": {
      let ok = false;
      let typed = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        if (attempt > 0) await clearPreviewInput(page, blockIndex);
        typed = await typeIntoPreviewInput(page, blockIndex, interact.type);
        if (!typed) break;
        ok = await waitForPreviewText(page, blockIndex, want, 4000);
      }
      if (!typed) problems.push({ ...tag, kind: "INTERACT_TYPE" });
      else if (!ok) problems.push({ ...tag, kind: "INTERACT_EXPECT", want });
      break;
    }
    case "shopping": {
      let ok = false;
      let typed = false;
      let clicked = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        if (attempt > 0) await clearPreviewInput(page, blockIndex);
        typed = await typeIntoPreviewInput(page, blockIndex, interact.type);
        if (!typed) break;
        clicked = await clickPreviewButton(page, blockIndex, interact.button);
        if (!clicked) break;
        ok = await waitForPreviewText(page, blockIndex, want, 4000);
      }
      if (!typed) problems.push({ ...tag, kind: "INTERACT_TYPE" });
      else if (!clicked) problems.push({ ...tag, kind: "INTERACT_CLICK", target: interact.button });
      else if (!ok) problems.push({ ...tag, kind: "INTERACT_EXPECT", want });
      break;
    }
    case "todo":
      if (!(await clickPreviewCheckbox(page, blockIndex, 1)))
        problems.push({ ...tag, kind: "INTERACT_CLICK", target: "checkbox #2" });
      else if (!(await waitForPreviewText(page, blockIndex, "2 of 2 done")))
        problems.push({ ...tag, kind: "INTERACT_EXPECT", want: "2 of 2 done" });
      else if (!(await clickPreviewButton(page, blockIndex, "delete")))
        problems.push({ ...tag, kind: "INTERACT_CLICK", target: "delete" });
      else if (!(await waitForPreviewText(page, blockIndex, "1 of 1 done")))
        problems.push({ ...tag, kind: "INTERACT_EXPECT", want: "1 of 1 done" });
      break;
    default:
      problems.push({ ...tag, kind: "UNKNOWN_INTERACT", interact: interact.kind });
  }
}

// ---------------------------------------------------------------------------
// One block: auto-render, expected text, real Run re-run, interactivity.
// ---------------------------------------------------------------------------

async function auditBlock(page, spec, i) {
  const problems = [];
  const tag = { lesson: spec.lesson, block: i };

  const rendered = await waitForRender(page, i);
  if (rendered === "timeout") {
    problems.push({ ...tag, kind: "NO_RENDER" });
    return problems;
  }
  const err = await snippetError(page, i);
  if (err) {
    problems.push({ ...tag, kind: "RENDER_ERROR", err: err.slice(0, 160) });
    return problems;
  }
  for (const want of spec.blocks[i].expect) {
    if (!(await waitForPreviewText(page, i, want)))
      problems.push({ ...tag, kind: "EXPECTED_TEXT", want });
  }

  // The real Run button must re-run cleanly (renderReagent on demand).
  if (!(await clickRun(page, i))) {
    problems.push({ ...tag, kind: "NO_RUN_BUTTON" });
  } else {
    await sleep(500);
    const err2 = await snippetError(page, i);
    if (err2) {
      problems.push({ ...tag, kind: "RERUN_ERROR", err: err2.slice(0, 160) });
    } else {
      for (const want of spec.blocks[i].expect) {
        if (!(await waitForPreviewText(page, i, want)))
          problems.push({ ...tag, kind: "EXPECTED_TEXT_AFTER_RERUN", want });
      }
    }
  }

  if (spec.blocks[i].interact) await runInteractivity(page, spec, i, problems);
  return problems;
}

// ---------------------------------------------------------------------------
// Main audit.
// ---------------------------------------------------------------------------

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

    // 1. Switch to the Web Dev course — its runtimeScripts pull in React,
    //    ReactDOM and the scittle reagent plugin.
    await page.waitForSelector('[data-testid="course-switcher-btn"]', { visible: true, timeout: 10000 });
    await page.click('[data-testid="course-switcher-btn"]');
    await page.waitForSelector('[data-testid="course-option-webdev"]', { visible: true, timeout: 10000 });
    await page.click('[data-testid="course-option-webdev"]');
    await waitForReagent(page);
    log("[course] Web Dev active, Reagent runtime ready.");

    // 2. Inventory: flat lesson indices (for the sidebar nav) + which lessons
    //    actually hold reagent blocks (to catch spec/data drift). Scan every
    //    web part, not just the two that currently contain reagent blocks, so
    //    a reagent block added elsewhere is flagged rather than silently
    //    escaping the audit.
    const modules = await extractModules(["webPart1", "webPart2", "webPart3", "webPart4"]);
    const navIndex = {};
    let flat = 0;
    for (const f of ["webPart1", "webPart2", "webPart3", "webPart4"])
      for (const lesson of modules.get(f)[f] || []) navIndex[lesson.id] = flat++;
    const dataBlocks = {};
    for (const f of ["webPart1", "webPart2", "webPart3", "webPart4"])
      for (const lesson of modules.get(f)[f] || []) {
        const n = (lesson.content || []).filter((b) => b.t === "reagent").length;
        if (n) dataBlocks[lesson.id] = n;
      }

    // 3. Invariants: the spec must cover every reagent block, and match it.
    const problems = [];
    const specIds = new Set(LESSON_SPECS.map((s) => s.lesson));
    const uncovered = Object.keys(dataBlocks).filter((id) => !specIds.has(id));
    if (uncovered.length)
      problems.push({ course: "webdev", kind: "UNCOVERED_REAGENT_LESSON", lessons: uncovered });
    const missing = LESSON_SPECS.map((s) => s.lesson).filter((id) => !dataBlocks[id]);
    if (missing.length)
      problems.push({ course: "webdev", kind: "SPEC_MISSING_LESSON", lessons: missing });
    const total = Object.values(dataBlocks).reduce((a, b) => a + b, 0);
    log(`reagent blocks found in data: ${total} across ${Object.keys(dataBlocks).length} lessons`);

    // 4. Audit each lesson through the real UI.
    const perLesson = [];
    for (const spec of LESSON_SPECS) {
      const idx = navIndex[spec.lesson];
      if (idx === undefined) {
        problems.push({ course: "webdev", kind: "LESSON_NOT_FOUND", lesson: spec.lesson });
        continue;
      }
      const inData = dataBlocks[spec.lesson] || 0;
      if (inData !== spec.blocks.length)
        problems.push({
          course: "webdev",
          lesson: spec.lesson,
          kind: "SPEC_COUNT_MISMATCH",
          inData,
          inSpec: spec.blocks.length,
        });
      log(`\n=== ${spec.lesson} (lesson ${idx + 1}) — ${spec.blocks.length} reagent block(s) ===`);
      await page.click(`[data-testid="nav-lesson-${idx}"]`);
      await page.waitForSelector('[data-testid="lesson-view"]', { visible: true, timeout: 10000 });
      await page.waitForFunction(
        (n) => document.querySelectorAll('[data-testid="reagent-snippet"]').length === n,
        { timeout: 15000 },
        spec.blocks.length
      );
      const before = problems.length;
      for (let i = 0; i < spec.blocks.length; i++) {
        const n0 = problems.length;
        problems.push(...(await auditBlock(page, spec, i)));
        log(`  block #${i}: ${problems.length === n0 ? "ok" : "PROBLEMS"}`);
      }
      perLesson.push({ lesson: spec.lesson, navIndex: idx, blocks: spec.blocks.length, problems: problems.length - before });
    }

    return { problems, info: [], consoleErrors, pageErrors, extra: { totalBlocks: total, lessons: perLesson } };
  } finally {
    try {
      await browser.close();
    } catch {
      /* already closed */
    }
  }
}

// Poll until React 18, ReactDOM and the scittle reagent plugin are all present.
// 60s like waitForScittle: on cold CI the course fetches two React 18 UMD
// bundles + the scittle reagent plugin from CDNs, which can be slow.
async function waitForReagent(page, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => {
      try {
        if (!window.React || !window.ReactDOM || typeof window.ReactDOM.createRoot !== "function")
          return false;
        window.scittle.core.eval_string("(require '[reagent.core]) true");
        return true;
      } catch {
        return false;
      }
    });
    if (ready) return;
    await sleep(500);
  }
  throw new Error(`Reagent runtime did not become ready within ${timeoutMs}ms.`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  log(USAGE);
  process.exit(0);
}

runMain(runAudit);
