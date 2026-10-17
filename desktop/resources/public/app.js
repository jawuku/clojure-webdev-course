const token = new URLSearchParams(location.hash.replace(/^#/, "")).get("token") || "";

const $ = (id) => document.getElementById(id);

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (auth && token) headers["x-parens-token"] = token;

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }
  return { status: response.status, data };
}

function resultBlock(title, text, ok) {
  const wrap = document.createElement("div");
  wrap.className = `result-block ${ok ? "ok" : "bad"}`;
  const heading = document.createElement("div");
  heading.className = "result-title";
  heading.textContent = title;
  const body = document.createElement("pre");
  body.textContent = text;
  wrap.append(heading, body);
  return wrap;
}

function show(target, title, text, ok) {
  target.replaceChildren(resultBlock(title, text, ok));
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function evalText(result) {
  const { status, data } = result;
  const lines = [`HTTP ${status}${data.ms ? ` · ${data.ms.toFixed(1)} ms` : ""}`];
  if (data.timeout) lines.push("timeout: the worker was killed");
  if (data.crashed) lines.push("worker exited");
  if (data.value !== undefined && data.value !== null) lines.push(`=> ${data.value}`);
  if (data.output) lines.push(`out:\n${data.output}`);
  if (data.error) lines.push(`error: ${data.error}`);
  if (data.raw) lines.push(data.raw);
  return lines.join("\n");
}

async function refreshRuntime() {
  const result = await api("/api/runtime");
  const info = result.data;
  $("runtime-info").textContent = JSON.stringify(info, null, 2);
  if (info && info.ok) {
    $("runtime-pill").textContent =
      `worker ${info.pid} · Clojure ${info.clojure} · Java ${info.java}`;
  } else {
    $("runtime-pill").textContent = "worker: error";
  }
  return result;
}

async function runCode(code, label) {
  show($("result"), `${label} — running…`, "waiting for the worker", true);
  const result = await api("/api/eval", { method: "POST", body: { code, ns: "user" } });
  if (typeof result.data.ms === "number") {
    $("eval-ms").textContent = `${result.data.ms.toFixed(1)} ms`;
  }
  show($("result"), label, evalText(result), result.status === 200 && result.data.ok);
  return result;
}

async function timeoutAndRecover() {
  const before = await api("/api/runtime");
  const started = performance.now();
  const timedOut = await api("/api/eval", {
    method: "POST",
    body: { code: "(while true)", ns: "user" },
  });
  const elapsed = performance.now() - started;
  const recovery = await api("/api/eval", {
    method: "POST",
    body: { code: "(+ 1 2)", ns: "user" },
  });
  const after = await api("/api/runtime");
  const text = [
    `timeout request: ${elapsed.toFixed(0)} ms wall clock`,
    evalText(timedOut),
    "",
    `recovery eval:`,
    evalText(recovery),
    "",
    `worker pid: ${before.data.pid} -> ${after.data.pid}`,
  ].join("\n");
  show($("result"), "Timeout + recover", text, Boolean(recovery.data.ok));
}

async function crashAndRecover() {
  const before = await api("/api/runtime");
  const crashed = await api("/api/eval", {
    method: "POST",
    body: { code: "(System/exit 0)", ns: "user" },
  });
  const recovery = await api("/api/eval", {
    method: "POST",
    body: { code: "(+ 1 2)", ns: "user" },
  });
  const after = await api("/api/runtime");
  const text = [
    evalText(crashed),
    "",
    "recovery eval:",
    evalText(recovery),
    "",
    `worker pid: ${before.data.pid} -> ${after.data.pid}`,
  ].join("\n");
  show($("result"), "Kill worker + recover", text, Boolean(recovery.data.ok));
}

async function checkExercise() {
  const tests = ["(= (twice 2) 4)", "(= (twice 0) 0)"];
  const result = await api("/api/exercise", {
    method: "POST",
    body: { code: $("exercise-code").value, tests },
  });
  const data = result.data;
  const lines = [`HTTP ${result.status} · ${data.ms ? data.ms.toFixed(1) + " ms" : ""}`];
  if (data.runError) {
    lines.push(`run error: ${data.runError}`);
  } else if (data.results) {
    lines.push(`${data.passed ? "PASS" : "FAIL"} · ${data.results.filter((r) => r.ok).length}/${data.results.length} checks`);
    for (const check of data.results) {
      lines.push(`${check.ok ? "✓" : "✗"} ${check.test} — ${check.detail}`);
    }
  }
  if (data.output) lines.push(`out:\n${data.output}`);
  show($("exercise-result"), "Exercise result", lines.join("\n"), Boolean(data.passed));
}

async function restartWorker() {
  const result = await api("/api/reset", { method: "POST" });
  show(
    $("result"),
    "Restart worker",
    JSON.stringify(result.data, null, 2),
    result.status === 200 && Boolean(result.data.ok)
  );
  await refreshRuntime();
}

async function callWithoutToken() {
  const result = await api("/api/eval", {
    method: "POST",
    body: { code: "(+ 1 2)", ns: "user" },
    auth: false,
  });
  show(
    $("token-result"),
    "Request without X-Parens-Token",
    `${evalText(result)}\n\nExpected: HTTP 401 and no code execution.`,
    result.status === 401
  );
}

function initTokenState() {
  if (token) {
    $("token-state").textContent = `token ${token.slice(0, 6)}… (${token.length} chars)`;
    $("token-state").classList.add("ok");
  } else {
    $("token-state").textContent = "no token in URL — API calls will 401";
    $("token-state").classList.add("bad");
  }
}

$("run").addEventListener("click", () => runCode($("code").value, "eval"));
$("timeout").addEventListener("click", timeoutAndRecover);
$("crash").addEventListener("click", crashAndRecover);
$("reset").addEventListener("click", restartWorker);
$("check").addEventListener("click", checkExercise);
$("no-token").addEventListener("click", callWithoutToken);
$("refresh-runtime").addEventListener("click", refreshRuntime);

initTokenState();
refreshRuntime();
