import { defineConfig } from "vitest/config";

import { aliases, backendTest } from "../../vitest.shared.ts";

export default defineConfig({
  test: {
    ...backendTest,
    name: "games",
    include: ["**/*.test.ts"],
    // These slices have no unit tests of their own — behavior is covered
    // by apps/server's pgn-import and api integration suites, which
    // exercise them with composed deps.
    passWithNoTests: true,
  },
  resolve: { alias: aliases },
});
