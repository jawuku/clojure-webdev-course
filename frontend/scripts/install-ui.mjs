#!/usr/bin/env node
/*
 * Copy the Vite build into the desktop app's classpath resources.
 *
 * The JVM server serves `public/` resources from the classpath, so the built
 * UI lives at desktop/resources/public and ships inside the uberjar. Run via
 * `yarn build:desktop`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(frontendDir, "dist");
const targetDir = path.resolve(frontendDir, "..", "desktop", "resources", "public");

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error(`No build found at ${distDir}. Run \`yarn build\` first.`);
  process.exit(1);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(distDir, targetDir, { recursive: true });

const files = fs.readdirSync(targetDir).sort();
console.log(`Copied ${files.length} top-level entries to ${targetDir}`);
