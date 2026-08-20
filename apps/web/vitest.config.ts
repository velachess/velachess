import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Lingui doesn't search upward for its config and `pnpm test` runs from repo root, so the path is passed explicitly.
// `.po` loader lets copy assertions read the real shipped English catalogue.
process.env["LINGUI_CONFIG"] ??= new URL("lingui.config.ts", import.meta.url).pathname;

const linguiMacro = await babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] });

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [lingui(), linguiMacro, react()],
  test: {
    name: "web",
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    // A screen test mounts a router, boots a query client, and waits on a
    // request — the default 5s makes a healthy suite fail on a busy machine.
    testTimeout: 20_000,
  },
});
