#!/usr/bin/env node
/*
 * Packaged offline smoke test.
 *
 * The app is supposed to work with no network at all: the JVM serves the whole
 * UI (scripts, styles, fonts, icons) from inside the package. This script
 * starts a packaged launcher, crawls every asset the shipped HTML/CSS
 * references, and fails if any of them is missing, empty, or points at another
 * origin. It then evaluates Clojure through the packaged worker JVM and checks
 * that shutting the app down leaves no orphan worker behind.
 *
 * That combination is what "offline" means for a package: no CDN, no
 * first-run download, every referenced file shipped. (The browser smoke test
 * separately records that a real page load makes zero external requests.)
 *
 * Usage:
 *   node scripts/offline_smoke.mjs [--jar target/parens-desktop.jar]
 *                                  [--command "/path/to/Parens"]
 *                                  [--json benchmarks/offline-smoke.json]
 */

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const desktopDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HOST = "127.0.0.1";
const IS_WINDOWS = process.platform === "win32";
const TOKEN = crypto.randomBytes(32).toString("base64url");
// The crawl follows HTML/CSS references, so a cycle (or a stray self-reference)
// cannot loop forever.
const MAX_ASSETS = 300;

function parseArgs(argv) {
  const args = {
    jar: path.join(desktopDir, "target", "parens-desktop.jar"),
    command: null,
    json: path.join(desktopDir, "benchmarks", "offline-smoke.json"),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--jar") {
      args.jar = path.resolve(value);
      i += 1;
    } else if (key === "--command") {
      args.command = value;
      i += 1;
    } else if (key === "--json") {
      args.json = path.resolve(value);
      i += 1;
    } else if (key === "--help" || key === "-h") {
      console.log(
        "offline_smoke.mjs [--jar PATH] [--command PATH] [--json PATH]"
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${key}`);
    }
  }
  return args;
}

const checks = [];
let failures = 0;

function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail: String(detail ?? "") });
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readLaunch(child, timeoutMs = 30_000) {
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

function get(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: HOST,
        port,
        method: "GET",
        path: requestPath,
        headers: { host: `${HOST}:${port}` },
        timeout: 20_000,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    request.on("timeout", () => request.destroy(new Error("request timed out")));
    request.on("error", reject);
    request.end();
  });
}

function api(port, method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const request = http.request(
      {
        host: HOST,
        port,
        method,
        path: requestPath,
        headers: {
          host: `${HOST}:${port}`,
          "content-type": "application/json",
          "x-parens-token": TOKEN,
          ...(payload ? { "content-length": Buffer.byteLength(payload) } : {}),
        },
        timeout: 30_000,
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          let data = null;
          try {
            data = JSON.parse(raw || "null");
          } catch {
            data = { raw };
          }
          resolve({ status: response.statusCode, data });
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("request timed out")));
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

// Windows has no SIGTERM: Node's kill() calls TerminateProcess, which skips the
// JVM shutdown hook and would leave the worker running, so kill the tree.
function stopApp(child) {
  if (IS_WINDOWS) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

async function waitForExit(child, timeoutMs = 10_000) {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

const ATTRIBUTE = /\b(?:src|href)="([^"]*)"/g;
const CSS_URL = /url\(\s*["']?([^"')]+)/g;

// Only HTML and CSS declare assets to fetch. Scanning the JS bundle would match
// template strings ("src=" + url, documentation links) that the browser never
// requests, and script-src 'self' already blocks anything it tried to load.
function referenceKind(requestPath, contentType) {
  if (/\.html?(?:$|\?)/.test(requestPath) || /text\/html/i.test(contentType || "")) return "html";
  if (/\.css(?:$|\?)/.test(requestPath) || /text\/css/i.test(contentType || "")) return "css";
  return null;
}

function decode(response) {
  return response.body.toString("utf8");
}

/*
 * Resolve one reference. Returns null for references that are not fetched
 * (fragments, data URIs), { external } for anything off-origin, or a request
 * path on the local server.
 */
function resolveReference(port, reference) {
  const ref = reference.trim();
  if (!ref || ref.startsWith("#") || /^(?:data|mailto|javascript):/i.test(ref)) return null;
  if (/^(?:https?:)?\/\//i.test(ref)) return { external: ref };
  try {
    const url = new URL(ref, `http://${HOST}:${port}/`);
    if (url.origin !== `http://${HOST}:${port}`) return { external: ref };
    return { path: `${url.pathname}${url.search}` };
  } catch {
    return { external: ref };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.command ? [args.command] : ["java", "-jar", args.jar];
  if (!args.command && !fs.existsSync(args.jar)) {
    throw new Error(`Jar not found at ${args.jar}. Run \`lein uberjar\` in desktop/ first.`);
  }
  // Keep the check off the real profile: state.edn lives in a temp directory
  // for the duration of the run.
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "parens-offline-state-"));
  const fullCommand = [...command, "--no-open", "--port", "0", "--token", TOKEN,
                       "--state-dir", stateDir];

  console.log(`Starting packaged app: ${fullCommand.join(" ")}`);
  const startedAt = performance.now();
  const child = spawn(fullCommand[0], fullCommand.slice(1), {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: args.command ? desktopDir : path.dirname(args.jar),
  });
  const appLog = [];
  child.stdout.on("data", (chunk) => appLog.push(chunk.toString()));

  let workerPid = null;
  try {
    const url = await readLaunch(child);
    const port = Number(new URL(url).port);
    console.log(`App: http://${HOST}:${port}`);

    const index = await get(port, "/");
    const html = decode(index);
    check(
      "package serves its own index.html",
      index.status === 200 && /text\/html/.test(index.headers["content-type"] || "") && /Parens/.test(html),
      `${index.status}, ${index.body.length} bytes`
    );
    check(
      "index.html carries the strict self-only CSP",
      /default-src 'self'/.test(index.headers["content-security-policy"] || ""),
      index.headers["content-security-policy"] || "missing"
    );

    // Crawl: every asset referenced by the shipped HTML and CSS must come from
    // this same server. A missing font or chunk fails here rather than at
    // runtime on a machine with no network.
    const queue = ["/"];
    const seen = new Set();
    const missing = [];
    const external = [];
    const served = [];
    while (queue.length > 0 && seen.size < MAX_ASSETS) {
      const requestPath = queue.shift();
      if (seen.has(requestPath)) continue;
      seen.add(requestPath);

      const response = await get(port, requestPath);
      const contentType = response.headers["content-type"] || "";
      if (response.status !== 200) {
        missing.push(`${requestPath} -> HTTP ${response.status}`);
        continue;
      }
      served.push({ path: requestPath, bytes: response.body.length, type: contentType });
      if (response.body.length === 0) {
        missing.push(`${requestPath} -> empty body`);
        continue;
      }
      const kind = referenceKind(requestPath, contentType);
      if (!kind) continue;

      const text = decode(response);
      const references = [
        ...(kind === "html" ? [...text.matchAll(ATTRIBUTE)] : []),
        ...(kind === "css" ? [...text.matchAll(CSS_URL)] : []),
      ];
      for (const match of references) {
        const resolved = resolveReference(port, match[1]);
        if (!resolved) continue;
        if (resolved.external) {
          external.push(`${requestPath} references ${resolved.external}`);
        } else if (!seen.has(resolved.path)) {
          queue.push(resolved.path);
        }
      }
    }

    check("every referenced asset is served by the package", missing.length === 0, missing.join(" | "));
    check("no asset points at another origin", external.length === 0, external.join(" | "));

    const fonts = served.filter((asset) => /\.woff2?(?:$|\?)/.test(asset.path));
    check("bundled fonts are present", fonts.length > 0, `${fonts.length} font file(s)`);
    const scripts = served.filter((asset) => /\.js(?:$|\?)/.test(asset.path));
    check("bundled scripts are present", scripts.length > 0, `${scripts.length} script(s)`);

    // The worker JVM ships inside the package: if it were missing, evaluation
    // would fail even though the HTTP server answered.
    const hello = await api(port, "POST", "/api/eval", { code: "(+ 1 2)", ns: "user" });
    check(
      "packaged worker JVM evaluates Clojure offline",
      hello.status === 200 && hello.data?.ok === true && hello.data?.value === "3",
      JSON.stringify(hello.data)
    );

    const firstRuntime = await api(port, "GET", "/api/runtime");
    workerPid = firstRuntime.data?.pid ?? null;

    const stopStarted = performance.now();
    stopApp(child);
    const exitCode = await waitForExit(child);
    check(
      IS_WINDOWS ? "app exits on taskkill" : "app exits on SIGTERM",
      exitCode !== null,
      exitCode
    );
    await sleep(2000);
    check("no orphan eval worker after quit", !pidAlive(workerPid), workerPid);

    check("no failing checks", failures === 0, `${failures} failure(s)`);

    const elapsed = performance.now() - startedAt;
    const redact = (value) => String(value).split(TOKEN).join("<token>");
    const output = {
      command: fullCommand.map((part) => redact(part)),
      elapsed_ms: Number(elapsed.toFixed(1)),
      served_assets: served.length,
      checks,
      failures,
      app_log_tail: appLog.join("").split("\n").slice(-20).map(redact),
    };
    fs.mkdirSync(path.dirname(args.json), { recursive: true });
    fs.writeFileSync(args.json, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`\nWrote ${args.json}`);
    console.log(`${checks.length - failures}/${checks.length} checks passed`);
    return failures === 0 ? 0 : 1;
  } finally {
    if (child.exitCode === null) {
      stopApp(child);
      if ((await waitForExit(child)) === null && !IS_WINDOWS) {
        child.kill("SIGKILL");
        await waitForExit(child);
      }
    }
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
