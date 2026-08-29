import { getConfig } from "@lingui/conf";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Each Vitest project is loaded in the root process. Passing the config to
// the plugin keeps the web and site catalogs independent of load order.
const linguiConfig = new URL("lingui.config.ts", import.meta.url).pathname;
const resolvedLinguiConfig = getConfig({ configPath: linguiConfig });

const linguiMacro = await babel({
  presets: [
    linguiTransformerBabelPreset(
      { linguiConfig: resolvedLinguiConfig },
      { configPath: linguiConfig },
    ),
  ],
});

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [lingui({ configPath: linguiConfig }), linguiMacro, react()],
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
