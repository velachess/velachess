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
 * Into `public/engine/`, so Vite's public-dir handling serves both
 * unmodified, co-located under the basename the engine script expects when
 * it resolves its own `.wasm` path.
 *
 * In `config()`, so it happens before the dev server or the build reads
 * `public/` and a missing source file fails there rather than shipping a
 * worker that cannot load.
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
    // Turning SSR on later is this flag, not a rewrite.
    tanstackStart({ spa: { enabled: true } }),
    linguiMacro,
    viteReact(),
  ],
  server: {
    // Vite binds to localhost only by default, which Dev Container port
    // forwarding cannot reach: it needs a real listening interface.
    host: true,
    // The browser only talks to this origin, and /api is rewritten onto the
    // API in dev. The OAuth return leg lands here too, its explicit
    // redirectURI being under /api, so it needs no second rule.
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
