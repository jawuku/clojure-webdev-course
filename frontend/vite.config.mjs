import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite replaces CRA/CRACO. The JVM server serves the contents of dist/ at the
// root of the app, under a strict `default-src 'self'` CSP, so the build must
// not inline scripts, styles, or assets.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // No inline module-preload bootstrap: `script-src 'self'` would block it.
    modulePreload: { polyfill: false },
    // Emit real files instead of data: URIs so `default-src 'self'` covers
    // images and fonts too.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
