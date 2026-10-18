#!/usr/bin/env node
/*
 * Phase 1 UI smoke test: drive the real JVM app in a real browser.
 *
 * Proves the Vite bundle works against the local server, not just that it
 * compiles:
 *   - every lesson in every course renders (and the totals add up)
 *   - fonts load from the bundle, not a CDN
 *   - zero console errors, page errors, failed requests, or external requests
 *   - theme, search, REPL evaluation, exercise checking, and progress persist
 *   - the token survives a reload (sessionStorage) and never lands in a share URL
 *
 * Usage:
 *   node scripts/smoke.mjs [--jar ../desktop/target/parens-desktop.jar]
 *                          [--json ../desktop/benchmarks/ui-smoke.json]
 *                          [--chrome /path/to/chromium]
 *   CHROME_PATH=/path/to/chromium node scripts/smoke.mjs
 *
 * Without --chrome/CHROME_PATH, Playwright looks for the browser revision it
 * expects under ~/.cache/ms-playwright (CI installs it with `playwright
 * install --with-deps chromium`).
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const frontendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const args = {
    jar: path.resolve(frontendDir, "..", "desktop", "target", "parens-desktop.jar"),
    json: path.resolve(frontendDir, "..", "desktop", "benchmarks", "ui-smoke.json"),
    chrome: process.env.CHROME_PATH || null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--jar") {
      args.jar = path.resolve(value);
      i += 1;
    } else if (key === "--json") {
      args.json = path.resolve(value);
      i += 1;
    } else if (key === "--chrome") {
      args.chrome = value;
      i += 1;
    } else if (key === "--help" || key === "-h") {
      console.log("smoke.mjs [--jar PATH] [--json PATH] [--chrome PATH]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${key}`);
    }
  }
  return args;
}

const results = [];
let failures = 0;

function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail ?? "") });
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readLaunchUrl(child, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("timed out waiting for PARENS_URL"));
      }
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (settled) return;
      buffer += chunk;
      const match = /^PARENS_URL=(.+)$/m.exec(buffer);
      if (match) {
        settled = true;
        clearTimeout(timer);
        resolve(match[1].trim());
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`app exited before it was ready (code ${code})`));
      }
    });
  });
}

async function countLessons(page) {
  await page.waitForSelector('[data-testid="lesson-view"]');
  let seen = 1;
  let total = null;
  for (;;) {
    const kicker = await page.locator(".lesson-kicker").first().textContent();
    const match = /Lesson (\d+) of (\d+)/.exec(kicker || "");
    if (!match) throw new Error(`unreadable lesson counter: ${kicker}`);
    total = Number(match[2]);
    if (Number(match[1]) !== seen) {
      throw new Error(`lesson counter jumped to ${match[1]} while at ${seen}`);
    }
    const next = page.locator('[data-testid="next-lesson"]');
    if (await next.isDisabled()) break;
    await next.click();
    seen += 1;
    await page.waitForFunction(
      (n) => {
        const el = document.querySelector('[data-testid="lesson-view"] .lesson-kicker');
        return el && el.textContent.includes(`Lesson ${n} of`);
      },
      seen,
      { timeout: 20_000 }
    );
  }
  return { seen, total };
}

async function switchCourse(page, id, brandName) {
  await page.click('[data-testid="course-switcher-btn"]');
  await page.click(`[data-testid="course-option-${id}"]`);
  await page.waitForFunction(
    (name) => document.querySelector(".brand-name")?.textContent === name,
    brandName,
    { timeout: 10_000 }
  );
  await page.waitForSelector('[data-testid="lesson-view"]');
}

async function setEditor(page, selector, text) {
  const editor = page.locator(`${selector} .cm-content`);
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(text);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.jar)) {
    throw new Error(`Jar not found at ${args.jar}. Run \`lein uberjar\` in desktop/ first.`);
  }
  const token = crypto.randomBytes(32).toString("base64url");
  // Isolated app-data directory: the smoke run must not touch the developer's
  // real progress, and it starts from empty state every time.
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "parens-smoke-state-"));
  const app = spawn(
    "java",
    ["-jar", args.jar, "--no-open", "--port", "0", "--token", token,
     "--state-dir", stateDir],
    {
      cwd: path.dirname(args.jar),
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  let browser;
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const externalRequests = [];
  const startedAt = performance.now();

  try {
    const url = await readLaunchUrl(app);
    const origin = new URL(url).origin;
    console.log(`App: ${origin}`);

    browser = await chromium.launch({
      ...(args.chrome ? { executablePath: args.chrome } : {}),
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText || "unknown";
      // Navigating away cancels in-flight document loads (including an iframe
      // the previous lesson had just mounted); the browser reports those as
      // ERR_ABORTED. Fetch/XHR aborts are still failures.
      if (failure.includes("ERR_ABORTED") && request.resourceType() === "document") return;
      failedRequests.push(`${request.url()} — ${failure}`);
    });
    page.on("request", (request) => {
      const target = new URL(request.url());
      if (target.hostname !== "127.0.0.1" && target.hostname !== "localhost") {
        externalRequests.push(request.url());
      }
    });

    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="lesson-view"]');

    // The launcher's #token= fragment must not survive in the address bar, or
    // the Share button would leak it.
    const visibleUrl = new URL(page.url());
    check("launch token is stripped from the address bar", !visibleUrl.hash.includes("token"), page.url());
    check("launch token is not in the shareable URL", !page.url().includes(token));

    // Fonts are bundled: the CSS families must resolve to loaded faces.
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() => ({
      plex: document.fonts.check('16px "IBM Plex Sans"'),
      mono: document.fonts.check('16px "JetBrains Mono"'),
      fraunces: document.fonts.check('16px "Fraunces"'),
      loaded: document.fonts.status,
    }));
    check(
      "bundled fonts load",
      fonts.plex && fonts.mono && fonts.fraunces && fonts.loaded === "loaded",
      JSON.stringify(fonts)
    );

    // All lessons, all three courses.
    const clojure = await countLessons(page);
    check("Clojure course renders every lesson", clojure.seen === clojure.total, `${clojure.seen}/${clojure.total}`);

    await switchCourse(page, "webdev", "Hiccup");
    const web = await countLessons(page);
    check("Web Dev course renders every lesson", web.seen === web.total, `${web.seen}/${web.total}`);

    // Hiccup: a snippet renders through the JVM's hiccup.core/html into a
    // sandboxed iframe. The frame is opaque-origin, so read it via CDP frames
    // rather than contentDocument.
    await page.goto(`${origin}/?lesson=hiccup-intro`);
    await page.waitForSelector('[data-testid="hiccup-snippet"]');
    const firstHiccup = page.locator('[data-testid="hiccup-snippet"]').first();
    await firstHiccup.locator('[data-testid="hiccup-run"]').click();
    await page.waitForSelector('[data-testid="hiccup-frame"]', { timeout: 20_000 });
    const sandbox = await page.locator('[data-testid="hiccup-frame"]').first().getAttribute("sandbox");
    let hiccupText = "";
    for (let attempt = 0; attempt < 50 && !hiccupText.includes("Hello, Hiccup!"); attempt += 1) {
      for (const frame of page.frames()) {
        if (frame.url() === "about:srcdoc") {
          hiccupText = await frame.evaluate(() => document.body.innerText).catch(() => "");
          if (hiccupText.includes("Hello, Hiccup!")) break;
        }
      }
      if (!hiccupText.includes("Hello, Hiccup!")) await sleep(200);
    }
    check(
      "Hiccup previews render through hiccup.core/html",
      hiccupText.includes("Hello, Hiccup!"),
      hiccupText.replace(/\s+/g, " ").slice(0, 80)
    );
    check("Hiccup preview iframe is sandboxed", sandbox === "", JSON.stringify(sandbox));

    // Capstone: the real Ring app in an iframe, driven by HTMX.
    await page.goto(`${origin}/?lesson=todo-capstone`);
    await page.waitForSelector('[data-testid="live-app-frame"]', { timeout: 20_000 });
    let live = null;
    for (let attempt = 0; attempt < 50 && !live; attempt += 1) {
      live = page.frames().find((frame) => frame.url().includes("/preview/todos"));
      if (!live) await sleep(200);
    }
    check("capstone Ring app loads in its iframe", Boolean(live));
    if (live) {
      await live.waitForSelector('input[name="text"]', { timeout: 20_000 });
      const before = await live.locator(".todo").count();
      await live.fill('input[name="text"]', "Write tests");
      await live.click("button.primary");
      await live.waitForFunction(
        () => document.body.innerText.includes("Write tests"),
        null,
        { timeout: 20_000 }
      );
      const after = await live.locator(".todo").count();
      check(
        "capstone is interactive end-to-end on the Ring app",
        after === before + 1,
        `${before} -> ${after} todos`
      );
      await live.click(".todo:last-child .toggle");
      await live.waitForFunction(
        () => {
          const last = document.querySelector(".todo:last-child .text");
          return last && last.classList.contains("is-done");
        },
        null,
        { timeout: 20_000 }
      );
      check("capstone toggles a todo through a second request", true);
    }

    await switchCourse(page, "regex", "Regex");
    const regex = await countLessons(page);
    check("Regex course renders every lesson", regex.seen === regex.total, `${regex.seen}/${regex.total}`);

    const totalLessons = clojure.total + web.total + regex.total;
    check("all 74 lessons render", totalLessons === 74, `${totalLessons}`);

    // Theme toggle + persistence across reload (also proves the token survived).
    await switchCourse(page, "clojure", "Parens");
    const beforeTheme = await page.getAttribute("html", "data-theme");
    await page.click('[data-testid="theme-toggle"]');
    const afterTheme = await page.getAttribute("html", "data-theme");
    check("theme toggle switches themes", beforeTheme !== afterTheme, `${beforeTheme} -> ${afterTheme}`);

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="lesson-view"]');
    const reloadedTheme = await page.getAttribute("html", "data-theme");
    check("theme choice survives reload", reloadedTheme === afterTheme, reloadedTheme);
    check(
      "runtime still reachable after reload",
      (await page.locator('[data-testid="runtime-unreachable"]').count()) === 0
    );

    // Search.
    await page.click('[data-testid="open-search"]');
    await page.fill('[data-testid="search-input"]', "map");
    await page.waitForSelector('[data-testid^="search-result-"]');
    const searchCount = await page.locator('[data-testid^="search-result-"]').count();
    const firstResult = page.locator('[data-testid^="search-result-"]').first();
    const firstTitle = (await firstResult.locator(".search-item-title").textContent()) || "";
    await firstResult.click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="search-dialog"]')
    );
    const topbarTitle = await page.textContent('[data-testid="topbar-title"]');
    check(
      "search finds lessons and opens the selection",
      searchCount > 0 && firstTitle.includes(topbarTitle.trim()),
      `${searchCount} results, opened "${topbarTitle?.trim()}"`
    );

    // REPL: run a real expression on the JVM.
    await page.click('[data-testid="open-repl"]');
    await page.waitForSelector('[data-testid="repl"]');
    await setEditor(page, '[data-testid="repl"]', "(+ 1 2)");
    await page.click('[data-testid="repl-run"]');
    await page.waitForFunction(
      () => {
        const entries = document.querySelectorAll(".repl-entry");
        const last = entries[entries.length - 1];
        return last && last.querySelector(".out-value")?.textContent.includes("3");
      },
      null,
      { timeout: 20_000 }
    );
    const prompt = await page.textContent(".repl-entry:last-child .repl-prompt");
    check("REPL evaluates on the JVM", prompt.includes("user"),
      `prompt ${prompt?.trim()}, value 3`);

    // Reset runtime action: the REPL's definitions disappear and the UI keeps
    // working against the fresh worker JVM.
    await setEditor(page, '[data-testid="repl"]', "(def smoke-marker 41)");
    await page.click('[data-testid="repl-run"]');
    await page.waitForFunction(
      () => {
        const entries = document.querySelectorAll(".repl-entry");
        const last = entries[entries.length - 1];
        return last && last.querySelector(".out-value")?.textContent.includes("#'user/smoke-marker");
      },
      null,
      { timeout: 20_000 }
    );
    check("REPL definition is live before reset", true);

    await page.click('[data-testid="reset-runtime-btn"]');
    await page.click('[data-testid="reset-runtime-confirm"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="runtime-status"]')?.textContent.includes("Runtime restarted"),
      null,
      { timeout: 30_000 }
    );
    check("reset runtime reports success", true);

    await setEditor(page, '[data-testid="repl"]', "smoke-marker");
    await page.click('[data-testid="repl-run"]');
    await page.waitForFunction(
      () => {
        const entries = document.querySelectorAll(".repl-entry");
        const last = entries[entries.length - 1];
        return last && last.querySelector(".out-error")?.textContent.includes("smoke-marker");
      },
      null,
      { timeout: 20_000 }
    );
    check("reset runtime drops earlier definitions", true);

    // Exercise checking + progress persistence.
    await page.click('[data-testid="nav-lesson-0"]');
    await page.waitForSelector('[data-testid="exercise-0"]');
    await setEditor(page, '[data-testid="exercise-0"]', "100");
    await page.click('[data-testid="exercise-check-0"]');
    await page.waitForSelector('[data-testid="exercise-0"] .check-banner.pass', { timeout: 20_000 });
    check("exercise answer is checked and marked solved", true);

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="exercise-solved-0"]');
    check("solved exercise survives reload", true);

    // The desktop app's source of truth is state.edn in the app-data dir.
    // Wait for the write to land, then prove the UI can rebuild itself from
    // the file alone: clear the localStorage mirror and reload.
    const stateFile = path.join(stateDir, "state.edn");
    let stateText = "";
    for (let i = 0; i < 30; i += 1) {
      if (fs.existsSync(stateFile)) {
        stateText = fs.readFileSync(stateFile, "utf8");
        if (stateText.includes("parens_clojure_v1") && stateText.includes(":exercises")) break;
      }
      await sleep(100);
    }
    check(
      "progress is written to state.edn",
      stateText.includes("parens_clojure_v1") && stateText.includes(":exercises"),
      stateText.slice(0, 60)
    );

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="exercise-solved-0"]', { timeout: 20_000 });
    check("progress hydrates from state.edn after the browser mirror is cleared", true);
    const hydratedTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    check(
      "theme hydrates from state.edn after the browser mirror is cleared",
      hydratedTheme === "kanagawa",
      hydratedTheme
    );

    check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
    check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
    check("no failed requests", failedRequests.length === 0, failedRequests.join(" | "));
    check("no external requests", externalRequests.length === 0, externalRequests.join(" | "));

    const elapsed = performance.now() - startedAt;
    console.log(`\n${results.length - failures}/${results.length} checks passed in ${(elapsed / 1000).toFixed(1)}s`);

    fs.mkdirSync(path.dirname(args.json), { recursive: true });
    fs.writeFileSync(
      args.json,
      `${JSON.stringify(
        {
          origin,
          total_lessons: totalLessons,
          courses: { clojure, web, regex },
          elapsed_ms: Number(elapsed.toFixed(1)),
          checks: results,
          failures,
        },
        null,
        2
      )}\n`
    );
    return failures === 0 ? 0 : 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    app.kill("SIGTERM");
    await sleep(500);
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
