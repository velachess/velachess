import { defineConfig } from "vitest/config";

import { aliases, backendTest } from "../../vitest.shared.ts";

export default defineConfig({
  test: { ...backendTest, name: "auth", include: ["**/*.test.ts"] },
  resolve: { alias: aliases },
});
