import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

process.env["LINGUI_CONFIG"] ??= new URL("lingui.config.ts", import.meta.url).pathname;

const linguiMacro = await babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] });

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [lingui(), linguiMacro, react()],
  test: {
    name: "site",
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    // Rendering the complete landing page can cross Vitest's 5s default when
    // every workspace test runs concurrently.
    testTimeout: 20_000,
  },
});
