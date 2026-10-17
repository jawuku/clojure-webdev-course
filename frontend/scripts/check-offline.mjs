#!/usr/bin/env node
/*
 * Offline guard for the production build.
 *
 * The app is served by a local JVM with `default-src 'self'`; any CDN URL in
 * the shipped HTML or CSS is a bug (and a request that will fail at runtime).
 * Scans dist/ after `vite build`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(frontendDir, "dist");
const problems = [];

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error(`No build found at ${distDir}. Run \`yarn build\` first.`);
  process.exit(1);
}

const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
  const url = match[1];
  if (/^(?:https?:)?\/\//i.test(url)) {
    problems.push(`index.html references an external URL: ${url}`);
  }
}

const bannedHosts = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "emergent.sh",
  "scittle",
];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.(?:css|html)$/.test(entry.name)) {
      const text = fs.readFileSync(full, "utf8");
      for (const match of text.matchAll(/url\(\s*["']?([^"')]+)/g)) {
        if (/^(?:https?:)?\/\//i.test(match[1])) {
          problems.push(`${path.relative(distDir, full)} loads ${match[1]}`);
        }
      }
      for (const host of bannedHosts) {
        if (text.includes(host)) {
          problems.push(`${path.relative(distDir, full)} mentions ${host}`);
        }
      }
    }
  }
}

walk(distDir);

if (problems.length > 0) {
  console.error("Build is not self-contained:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log("Build is self-contained: no external scripts, styles, or fonts.");
