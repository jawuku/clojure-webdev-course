#!/usr/bin/env node
/*
 * Phase 0 end-to-end check for the Parens local JVM slice.
 *
 * Starts the app, exercises the token-protected API, measures cold start and
 * eval latency, proves timeout/crash recovery, and checks that no worker JVM
 * is left behind.
 *
 * Usage:
 *   node scripts/phase0_check.mjs [--jar target/parens-desktop.jar]
 *                                 [--command "path/to/launcher"]
 *                                 [--json target/phase0/results.json]
 */

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const HOST = "127.0.0.1";
const IS_WINDOWS = process.platform === "win32";
let TOKEN = crypto.randomBytes(32).toString("base64url");

function parseArgs(argv) {
  const args = {
    jar: "target/parens-desktop.jar",
    command: null,
    json: "benchmarks/results.json",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--jar") {
      args.jar = value;
      i += 1;
    } else if (key === "--command") {
      args.command = value;
      i += 1;
    } else if (key === "--json") {
      args.json = value;
      i += 1;
    } else if (key === "--help" || key === "-h") {
      console.log("phase0_check.mjs [--jar PATH] [--command CMD] [--json PATH]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${key}`);
    }
  }
  return args;
}

class Checker {
  constructor() {
    this.checks = [];
    this.measurements = {};
    this.failures = 0;
  }

  check(name, ok, detail = "") {
    this.checks.push({ name, ok: Boolean(ok), detail: String(detail ?? "") });
    if (!ok) this.failures += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
    return Boolean(ok);
  }

  note(name, value) {
    this.measurements[name] = value;
    console.log(`  INFO  ${name}: ${value}`);
  }
}

function readReady(child, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let port = 0;
    let token = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("timed out waiting for PARENS_PORT"));
      }
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (settled) return;
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("PARENS_PORT=")) {
          port = Number(line.slice("PARENS_PORT=".length));
        } else if (line.startsWith("PARENS_TOKEN=")) {
          token = line.slice("PARENS_TOKEN=".length);
        } else if (line.startsWith("PARENS_URL=")) {
          try {
            const url = new URL(line.slice("PARENS_URL=".length));
            port = Number(url.port) || port;
            token = new URLSearchParams(url.hash.replace(/^#/, "")).get("token") || token;
          } catch {
            /* the PORT/TOKEN lines are authoritative fallbacks */
          }
        }
        if (port) {
          settled = true;
          clearTimeout(timer);
          resolve({ port, token, readyAt: performance.now() });
          return;
        }
      }
    });

    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`app exited before ready (code ${code})`));
      }
    });
  });
}

function call(port, method, requestPath, body = null, options = {}) {
  const token = Object.prototype.hasOwnProperty.call(options, "token")
    ? options.token
    : TOKEN;
  const headers = { "content-type": "application/json" };
  if (token !== null && token !== undefined) headers["x-parens-token"] = token;
  Object.assign(headers, options.headers || {});

  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: HOST, port, method, path: requestPath, headers, timeout: options.timeout ?? 20000 },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          let data;
          try {
            data = JSON.parse(raw || "null");
          } catch {
            data = { raw };
          }
          resolve({
            status: response.statusCode,
            headers: response.headers,
            data,
          });
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("request timed out")));
    request.on("error", reject);
    if (body !== null) request.write(JSON.stringify(body));
    request.end();
  });
}

async function evalCode(port, code, ns = "user") {
  const started = performance.now();
  const response = await call(port, "POST", "/api/eval", { code, ns });
  return { ...response, wall: performance.now() - started };
}

async function runtime(port) {
  const response = await call(port, "GET", "/api/runtime");
  if (response.status !== 200) {
    throw new Error(`/api/runtime returned ${response.status}: ${JSON.stringify(response.data)}`);
  }
  return response.data;
}

function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.round(fraction * (ordered.length - 1))));
  return ordered[index];
}

function rssMb(pid) {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    const match = status.match(/^VmRSS:\s+(\d+) kB/m);
    return match ? Number((Number(match[1]) / 1024).toFixed(1)) : null;
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// println uses the platform line separator (\r\n on Windows); the protocol
// output is otherwise identical, so compare it with normalized newlines.
const normalizeNewlines = (value) => String(value ?? "").replace(/\r\n/g, "\n");

async function waitForExit(child, timeoutMs = 5000) {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

// Windows has no SIGTERM: Node's kill() calls TerminateProcess, which skips
// the JVM shutdown hook and would leave the worker running. taskkill /T kills
// the whole tree instead, so the orphan check means the same thing everywhere.
function stopApp(child) {
  if (IS_WINDOWS) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checker = new Checker();
  // --command is one executable path, not a command line: installed Windows
  // launchers live under "C:/Program Files/...", and splitting on whitespace
  // would break them. Extra app arguments are appended below.
  const command = args.command
    ? [args.command]
    : ["java", "-XX:TieredStopAtLevel=1", "-jar", args.jar];
  // Isolated state directory: no test may read or overwrite the real profile,
  // and the persistence check below needs a directory it fully controls.
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "parens-phase0-state-"));
  const fullCommand = [...command, "--no-open", "--port", "0", "--token", TOKEN,
                       "--state-dir", stateDir];

  console.log(`Starting app: ${fullCommand.join(" ")}`);
  const startedAt = performance.now();
  const child = spawn(fullCommand[0], fullCommand.slice(1), {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const appLog = [];
  child.stdout.on("data", (chunk) => appLog.push(chunk.toString()));
  child.stderr.on("data", (chunk) => appLog.push(chunk.toString()));

  let workerPid = null;
  try {
    const ready = await readReady(child);
    TOKEN = ready.token || TOKEN;
    const coldStartMs = ready.readyAt - startedAt;
    checker.note("cold_start_ms", Number(coldStartMs.toFixed(1)));
    checker.note("port", ready.port);
    checker.note("token_chars", TOKEN.length);
    checker.check("launcher printed a token", TOKEN.length >= 32, `${TOKEN.length} chars`);

    const port = ready.port;
    const instanceUrlFile = path.join(stateDir, "instance.url");

    let response = await call(port, "GET", "/api/health", null, { token: null });
    checker.check(
      "health is unauthenticated and 200",
      response.status === 200 && response.data.ok === true,
      response.status
    );

    response = await call(port, "GET", "/", null, { token: null });
    checker.check(
      "static page is served",
      response.status === 200 && String(response.data.raw || "").includes("Parens"),
      response.status
    );
    checker.check(
      "static page has a CSP",
      String(response.headers["content-security-policy"] || "").includes("default-src 'self'")
    );

    // Single instance: the lock is held and the launch URL is published, so a
    // second double-click hands off to this server instead of binding a new
    // port and spawning a second worker JVM.
    checker.check(
      "launcher publishes its URL for a second launch",
      fs.existsSync(instanceUrlFile) &&
        /^http:\/\/127\.0\.0\.1:\d+\/#token=/.test(
          fs.readFileSync(instanceUrlFile, "utf8").trim()
        ),
      instanceUrlFile
    );
    const secondLaunch = spawn(fullCommand[0], fullCommand.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let secondOutput = "";
    secondLaunch.stdout.on("data", (chunk) => (secondOutput += chunk.toString()));
    secondLaunch.stderr.on("data", (chunk) => (secondOutput += chunk.toString()));
    const secondCode = await waitForExit(secondLaunch, 10000);
    if (secondCode === null) stopApp(secondLaunch);
    checker.check(
      "a second launch hands off and exits",
      secondCode === 0 && /already running/i.test(secondOutput),
      `exit ${secondCode}, ${JSON.stringify(secondOutput.trim().split("\n").slice(-2))}`
    );
    response = await call(port, "GET", "/api/health", null, { token: null });
    checker.check(
      "the first instance keeps serving after the second launch",
      response.status === 200 && response.data.ok === true,
      response.status
    );

    response = await call(port, "POST", "/api/set-ns", { ns: "audit-check" });
    checker.check(
      "set-ns selects the default namespace",
      response.status === 200 && response.data.ns === "audit-check",
      response.status
    );
    const namespaced = await call(port, "POST", "/api/eval", { code: "(ns-name *ns*)" });
    checker.check(
      "eval without ns uses the active namespace",
      namespaced.status === 200 && namespaced.data.value === "audit-check",
      namespaced.data.value
    );
    const afterSetNs = await runtime(port);
    checker.check(
      "runtime info reports the active namespace",
      afterSetNs["active-ns"] === "audit-check",
      afterSetNs["active-ns"]
    );
    await call(port, "POST", "/api/set-ns", { ns: "user" });

    const firstEval = await evalCode(port, "(+ 1 2)");
    checker.note("time_to_first_eval_ms", Number((performance.now() - startedAt).toFixed(1)));
    checker.note("first_eval_wall_ms", Number(firstEval.wall.toFixed(1)));
    checker.check("first eval succeeds", firstEval.data.value === "3", firstEval.data.value);
    const firstRuntime = await runtime(port);
    checker.note("app_rss_mb", rssMb(child.pid));
    checker.note("worker_rss_mb", rssMb(firstRuntime.pid));

    response = await call(port, "POST", "/api/eval", { code: "(+ 1 2)" }, { token: null });
    checker.check("API rejects a missing token", response.status === 401, response.status);

    response = await call(port, "POST", "/api/eval", { code: "(+ 1 2)" }, { token: "wrong" });
    checker.check("API rejects a wrong token", response.status === 401, response.status);

    response = await call(port, "POST", "/api/eval", { code: "(+ 1 2)" }, {
      headers: { Origin: "http://evil.example" },
    });
    checker.check("API rejects a foreign Origin", response.status === 403, response.status);

    response = await call(port, "POST", "/api/eval", { code: "(+ 1 2)" }, {
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    checker.check("API rejects a cross-site fetch", response.status === 403, response.status);

    response = await call(port, "GET", "/api/health", null, {
      token: null,
      headers: { Host: "evil.example" },
    });
    checker.check("API rejects a foreign Host", response.status === 403, response.status);

    response = await call(port, "POST", "/api/eval", { code: "(+ 1 2)", ns: "bad ns" });
    checker.check("API rejects an invalid namespace", response.status === 400, response.status);

    const evalCases = [
      ["hello + value", '(println "hi")\n(+ 1 2)', "3", "hi\n"],
      ["JVM ratio", "(/ 1 2)", "1/2", ""],
      ["JVM Math interop", "(Math/sqrt 16)", "4.0", ""],
      ["JVM Long class", "(class 1)", "java.lang.Long", ""],
      ["JVM numeric equality", "(= 1 1.0)", "false", ""],
      ["JVM numeric ==", "(== 1 1.0)", "true", ""],
      ["JVM divide by zero", "(/ 1 0)", null, ""],
    ];
    for (const [name, code, expectedValue, expectedOutput] of evalCases) {
      const result = await evalCode(port, code);
      if (expectedValue === null) {
        checker.check(
          `eval: ${name}`,
          result.status === 200 &&
            result.data.ok === false &&
            String(result.data.error || "").includes("Divide by zero"),
          result.data.error
        );
      } else {
        checker.check(
          `eval: ${name}`,
          result.status === 200 &&
            result.data.ok === true &&
            result.data.value === expectedValue &&
            normalizeNewlines(result.data.output) === normalizeNewlines(expectedOutput),
          `${JSON.stringify(result.data.value)} / ${JSON.stringify(result.data.output)}`
        );
      }
    }

    response = await call(port, "POST", "/api/exercise", {
      code: "(defn twice [x] (* 2 x))",
      tests: ["(= (twice 2) 4)", "(= (twice 0) 0)"],
    });
    checker.check(
      "exercise passes in a fresh namespace",
      response.status === 200 &&
        response.data.passed === true &&
        response.data.results.length === 2,
      JSON.stringify(response.data.results)
    );

    response = await call(port, "POST", "/api/exercise", {
      code: "(defn twice [x] (+ x 1))",
      tests: ["(= (twice 2) 4)"],
    });
    checker.check(
      "exercise reports a failed check",
      response.status === 200 &&
        response.data.passed === false &&
        response.data.results[0].ok === false,
      JSON.stringify(response.data.results)
    );

    // App-data state: the store the UI uses for progress, theme and the active
    // course. It must be an ordinary EDN file and survive a full app restart.
    const STATE_BUCKET = "checker_state_v1";
    response = await call(port, "PUT", "/api/state", {
      key: STATE_BUCKET,
      value: { course: "clojure", progress: { welcome: { done: true } } },
    });
    checker.check(
      "state write succeeds",
      response.status === 200 && response.data.ok === true,
      response.status
    );
    response = await call(port, "GET", "/api/state");
    checker.check(
      "state read returns the bucket",
      response.status === 200 &&
        response.data.state?.[STATE_BUCKET]?.progress?.welcome?.done === true,
      JSON.stringify(response.data.state?.[STATE_BUCKET])
    );
    const stateFile = path.join(stateDir, "state.edn");
    const stateText = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, "utf8") : "";
    checker.check("state.edn is written", stateText.length > 0, stateFile);
    checker.check(
      "state.edn is versioned EDN",
      stateText.includes(":version 1") && stateText.includes(STATE_BUCKET),
      stateText.slice(0, 80)
    );
    checker.check(
      "no temporary state file is left behind",
      fs.readdirSync(stateDir).every((name) => !name.endsWith(".tmp")),
      fs.readdirSync(stateDir).join(", ")
    );

    // Reset runtime: the UI action behind /api/reset. It must replace the
    // worker process and drop definitions made in it, while the server and the
    // page keep running.
    response = await call(port, "POST", "/api/eval", { code: "(def reset-marker 41)", ns: "user" });
    checker.check(
      "definition exists before reset",
      response.status === 200 && response.data.value === "#'user/reset-marker",
      response.data.value
    );
    const beforeReset = await runtime(port);
    response = await call(port, "POST", "/api/reset", {});
    const afterReset = await runtime(port);
    checker.check(
      "reset restarts the worker",
      response.status === 200 &&
        response.data.ok === true &&
        afterReset.pid !== beforeReset.pid,
      `pid ${beforeReset.pid} -> ${afterReset.pid}`
    );
    response = await call(port, "POST", "/api/eval", { code: "(resolve 'user/reset-marker)", ns: "user" });
    checker.check(
      "reset drops definitions from the old worker",
      response.status === 200 && response.data.ok === true && response.data.value === "nil",
      response.data.value
    );

    let before = await runtime(port);
    let started = performance.now();
    response = await call(port, "POST", "/api/eval", { code: "(while true)", ns: "user" });
    const timeoutWallMs = performance.now() - started;
    checker.note("timeout_wall_ms", Number(timeoutWallMs.toFixed(1)));
    checker.check(
      "runaway eval is killed",
      response.status === 200 &&
        response.data.timeout === true &&
        timeoutWallMs > 1500 &&
        timeoutWallMs < 4000,
      response.data.error
    );
    let recovery = await evalCode(port, "(+ 1 2)");
    let after = await runtime(port);
    checker.check(
      "worker recovers after timeout",
      recovery.status === 200 &&
        recovery.data.value === "3" &&
        after.pid !== before.pid,
      `pid ${before.pid} -> ${after.pid}, ${recovery.wall.toFixed(0)} ms`
    );
    checker.note("timeout_recovery_ms", Number(recovery.wall.toFixed(1)));

    before = after;
    response = await call(port, "POST", "/api/eval", { code: "(System/exit 0)", ns: "user" });
    checker.check(
      "System/exit is contained to the worker",
      response.status === 200 && response.data.crashed === true,
      response.data.error
    );
    recovery = await evalCode(port, "(+ 1 2)");
    after = await runtime(port);
    checker.check(
      "worker recovers after System/exit",
      recovery.status === 200 &&
        recovery.data.value === "3" &&
        after.pid !== before.pid,
      `pid ${before.pid} -> ${after.pid}, ${recovery.wall.toFixed(0)} ms`
    );
    checker.note("crash_recovery_ms", Number(recovery.wall.toFixed(1)));

    for (let i = 0; i < 10; i += 1) await evalCode(port, "(+ 1 2)");

    for (const count of [100, 200]) {
      const wallTimes = [];
      const serverTimes = [];
      for (let i = 0; i < count; i += 1) {
        const result = await evalCode(port, "(+ 1 2)");
        if (result.status !== 200 || result.data.ok !== true) {
          throw new Error(`latency eval failed: ${JSON.stringify(result.data)}`);
        }
        wallTimes.push(result.wall);
        serverTimes.push(Number(result.data.ms || 0));
      }
      const label = `eval_${count}`;
      checker.note(`${label}_p50_ms`, Number(percentile(wallTimes, 0.5).toFixed(2)));
      checker.note(`${label}_p95_ms`, Number(percentile(wallTimes, 0.95).toFixed(2)));
      checker.note(`${label}_p99_ms`, Number(percentile(wallTimes, 0.99).toFixed(2)));
      checker.note(`${label}_max_ms`, Number(Math.max(...wallTimes).toFixed(2)));
      checker.note(
        `${label}_server_p95_ms`,
        Number(percentile(serverTimes, 0.95).toFixed(2))
      );
    }

    const heavyTimes = [];
    for (let i = 0; i < 20; i += 1) {
      const result = await evalCode(port, "(reduce + (range 100000))");
      heavyTimes.push(result.wall);
      if (result.data.ok !== true) throw new Error("heavy eval failed");
    }
    checker.check("larger expression evaluates", true, "reduce 100k");
    checker.note("reduce_100k_p50_ms", Number(percentile(heavyTimes, 0.5).toFixed(2)));
    checker.note("reduce_100k_p95_ms", Number(percentile(heavyTimes, 0.95).toFixed(2)));

    const exerciseTimes = [];
    for (let i = 0; i < 20; i += 1) {
      started = performance.now();
      response = await call(port, "POST", "/api/exercise", {
        code: "(defn twice [x] (* 2 x))",
        tests: ["(= (twice 2) 4)", "(= (twice 0) 0)"],
      });
      exerciseTimes.push(performance.now() - started);
      if (response.status !== 200 || response.data.passed !== true) {
        throw new Error("exercise latency run failed");
      }
    }
    checker.note("exercise_p50_ms", Number(percentile(exerciseTimes, 0.5).toFixed(2)));
    checker.note("exercise_p95_ms", Number(percentile(exerciseTimes, 0.95).toFixed(2)));

    workerPid = (await runtime(port)).pid;
    checker.note("worker_pid_before_shutdown", workerPid);

    stopApp(child);
    const exitCode = await waitForExit(child);
    checker.check(
      IS_WINDOWS ? "app exits on taskkill" : "app exits on SIGTERM",
      exitCode !== null,
      exitCode
    );
    await sleep(2000);
    checker.check("no orphan eval worker", !pidAlive(workerPid), workerPid);
    checker.check(
      "launcher removes instance.url on exit",
      !fs.existsSync(instanceUrlFile),
      instanceUrlFile
    );

    // Relaunch against the same --state-dir: this is the "quit and reopen"
    // path, and the value must still be there. On Unix a fake Chromium records
    // its argv, proving the app-window command points at the live URL.
    const browserArgsFile = path.join(stateDir, "browser-args.txt");
    let relaunchArgs = fullCommand.slice(1);
    let relaunchEnv = process.env;
    if (!IS_WINDOWS) {
      const fakeBrowser = path.join(stateDir, "fake-browser.sh");
      fs.writeFileSync(
        fakeBrowser,
        `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(browserArgsFile)}\n`
      );
      fs.chmodSync(fakeBrowser, 0o755);
      relaunchArgs = relaunchArgs.filter((arg) => arg !== "--no-open");
      relaunchEnv = { ...process.env, PARENS_BROWSER: fakeBrowser };
    }
    const relaunch = spawn(fullCommand[0], relaunchArgs, {
      env: relaunchEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const readyAgain = await readReady(relaunch);
      TOKEN = readyAgain.token || TOKEN;
      const persisted = await call(readyAgain.port, "GET", "/api/state");
      checker.check(
        "state survives an app restart",
        persisted.status === 200 &&
          persisted.data.state?.[STATE_BUCKET]?.course === "clojure",
        JSON.stringify(persisted.data.state?.[STATE_BUCKET])
      );

      if (!IS_WINDOWS) {
        let browserArgs = "";
        for (let i = 0; i < 50 && !browserArgs; i += 1) {
          if (fs.existsSync(browserArgsFile)) {
            browserArgs = fs.readFileSync(browserArgsFile, "utf8");
          }
          if (!browserArgs) await sleep(100);
        }
        checker.check(
          "app window receives the live URL",
          browserArgs.includes(`--app=http://127.0.0.1:${readyAgain.port}/#token=`),
          browserArgs.split("\n")[0] || "(no browser invocation)"
        );
        checker.check(
          "app window uses an isolated profile",
          browserArgs.includes("--user-data-dir="),
          browserArgs.split("\n")[1] || ""
        );
      }
    } finally {
      stopApp(relaunch);
      await waitForExit(relaunch);
    }

    checker.check("no failing checks", checker.failures === 0, `${checker.failures} failure(s)`);

    const redact = (value) => String(value).split(TOKEN).join("<token>");
    const safeCommand = fullCommand.map((part, index) =>
      fullCommand[index - 1] === "--token" ? "<token>" : redact(part)
    );
    const output = {
      command: safeCommand,
      cold_start_ms: checker.measurements.cold_start_ms,
      checks: checker.checks,
      measurements: checker.measurements,
      failed_checks: checker.failures,
      app_log_tail: appLog.join("").split("\n").slice(-20).map(redact),
    };
    fs.mkdirSync(path.dirname(args.json), { recursive: true });
    fs.writeFileSync(args.json, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`\nWrote ${args.json}`);
    console.log(
      `${checker.checks.length - checker.failures}/${checker.checks.length} checks passed`
    );
    return checker.failures === 0 ? 0 : 1;
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
