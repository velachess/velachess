import { getConfig } from "@lingui/conf";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Each Vitest project is loaded in the root process. Passing the config to
// the plugin keeps the site and web catalogs independent of load order.
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
