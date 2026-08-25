import { defineConfig } from "vitest/config";

import { aliases } from "../../vitest.shared.ts";

/**
 * The one project that renders: board, eval bar, player strip. jsdom and
 * `@testing-library/react` only — no Lingui transform, unlike `apps/web`,
 * because these components take plain strings and never touch `msg`.
 */
export default defineConfig({
  test: {
    name: "ui",
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: { alias: aliases },
});
