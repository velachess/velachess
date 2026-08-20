import { defineConfig } from "vitest/config";

import { aliases, backendTest } from "./vitest.shared.ts";

/**
 * Root aggregator only — every project owns its environment, aliases and
 * globs in its own `vitest.config.ts`, next to the code it tests. Glob
 * entries discover one project per app/package; `__tests__/` and
 * `__e2e__/` are inline because they belong to no single package: the
 * architecture/auth-boundary suites read the whole repo, and the
 * acceptance suite composes both `apps/server` and `apps/worker` — a
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
          include: ["__tests__/**/*.test.ts"],
        },
      },
      {
        test: {
          ...backendTest,
          name: "e2e",
          include: ["__e2e__/**/*.test.ts"],
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
