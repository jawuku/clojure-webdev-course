// Lightweight, dev-only logger. No-ops in production builds so no console
// output ships to production, while still surfacing diagnostics during
// development (used in place of silent empty catch blocks).
export function debug(...args) {
  // Vite replaces import.meta.env.PROD at build time; `process` is not defined
  // in the browser, so the old process.env check always logged.
  if (import.meta.env.PROD) return;
  console.debug(...args);
}
