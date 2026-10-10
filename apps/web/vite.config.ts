import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Turns the `msg` and `<Trans>` macros into plain Lingui calls. */
const linguiMacro = await babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] });

const API_TARGET = process.env["VITE_API_TARGET"] ?? "http://localhost:3000";

const ENGINE_FILES = ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"];

/**
 * Copies the browser Stockfish engine's glue script + wasm binary from the
 * installed `stockfish` npm package into `public/engine/`, so Vite's normal
 * public-dir handling serves them unmodified in both dev and the production
 * build — co-located under the same basename the engine script expects when
 * it resolves its own `.wasm` path (swap `.js` for `.wasm`, same directory).
 * Runs in `config()` so it happens before either the dev server or the
 * build reads `public/`; a missing source file fails the config step
 * loudly instead of shipping a worker that can't load.
 */
function copyStockfishEngineAssets(): Plugin {
  return {
    name: "copy-stockfish-engine-assets",
    config() {
      const pkgPath = fileURLToPath(import.meta.resolve("stockfish/package.json"));
      const binDir = join(dirname(pkgPath), "bin");
      const destDir = join(import.meta.dirname, "public/engine");
      mkdirSync(destDir, { recursive: true });
      for (const file of ENGINE_FILES) {
        const src = join(binDir, file);
        if (!existsSync(src)) {
          throw new Error(
            `Stockfish engine asset missing at ${src} — check the installed "stockfish" package version/layout.`,
          );
        }
        copyFileSync(src, join(destDir, file));
      }
    },
  };
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    copyStockfishEngineAssets(),
    lingui(),
    tailwindcss(),
    // Full client for now. Turning SSR on later is this flag, not a rewrite.
    tanstackStart({ spa: { enabled: true } }),
    linguiMacro,
    viteReact(),
  ],
  server: {
    // Vite binds to localhost only by default — unreachable from outside
    // a container (VS Code's Dev Container port forwarding needs a real
    // listening interface, not the container's internal loopback).
    host: true,
    // The browser only ever talks to this origin; /api is rewritten onto
    // the API in dev. The Google OAuth return leg lands here too — the
    // provider is configured with an explicit redirectURI under /api
    // (libs/infra/auth/auth.ts), so it needs no second proxy rule.
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
