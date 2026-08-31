import { defineConfig } from "vitest/config";

import { aliases, backendTest } from "../../vitest.shared.ts";

export default defineConfig({
  test: {
    ...backendTest,
    name: "accounts",
    include: ["**/*.test.ts"],
    // These slices have no unit tests of their own — behavior is covered
    // by the root integration suite (tests/application.test.ts),
    // libs/infra/db's status-flow test, and apps/worker's worker test,
    // all of which exercise these slices with composed deps.
    passWithNoTests: true,
  },
  resolve: { alias: aliases },
});
