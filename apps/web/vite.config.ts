import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Turns the `msg` and `<Trans>` macros into plain Lingui calls. */
const linguiMacro = await babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] });

const API_TARGET = process.env["VITE_API_TARGET"] ?? "http://localhost:3000";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
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
