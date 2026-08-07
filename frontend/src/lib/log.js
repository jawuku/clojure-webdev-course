// Lightweight, dev-only logger. No-ops in production builds so no console
// output ships to production, while still surfacing diagnostics during
// development (used in place of silent empty catch blocks).
export function debug(...args) {
  if (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "production") {
    return;
  }
  // eslint-disable-next-line no-console
  console.debug(...args);
}
