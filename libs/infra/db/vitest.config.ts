import { defineConfig } from "vitest/config";

import { aliases, backendTest } from "../../../vitest.shared.ts";

export default defineConfig({
  test: { ...backendTest, name: "db", include: ["**/*.test.ts"] },
  resolve: { alias: aliases },
});
