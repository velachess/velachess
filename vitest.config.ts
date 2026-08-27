import { defineConfig } from "vitest/config";

import { aliases, backendTest } from "./vitest.shared.ts";

/**
 * Root aggregator only — every project owns its environment, aliases and
 * globs in its own `vitest.config.ts`, next to the code it tests. Glob
 * entries discover one project per app/library. Root `tests/` owns
 * repository-wide checks, while `e2e/` composes both `apps/server` and
 * `apps/worker` — a
 * cross-app test living inside either app would make that app import the
 * other's source, which is exactly what those tests exist to forbid.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...backendTest,
          name: "root",
          include: ["tests/**/*.test.ts"],
        },
      },
      {
        test: {
          ...backendTest,
          name: "e2e",
          // `e2e/capture/` is Playwright, not Vitest: it stays out of this project.
          include: ["e2e/*.spec.ts"],
        },
        resolve: { alias: aliases },
      },
      "apps/*/vitest.config.ts",
      "libs/*/vitest.config.ts",
      "libs/infra/*/vitest.config.ts",
      "packages/*/vitest.config.ts",
    ],
  },
});
