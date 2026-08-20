import { defineConfig } from "vitest/config";

import { aliases, backendTest } from "../../vitest.shared.ts";

export default defineConfig({
  test: { ...backendTest, name: "worker", include: ["__tests__/**/*.test.ts"] },
  resolve: { alias: aliases },
});
