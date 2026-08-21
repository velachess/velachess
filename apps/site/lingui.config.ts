import { defineConfig } from "@lingui/cli";

export default defineConfig({
  locales: ["en"],
  sourceLocale: "en",
  catalogs: [
    {
      include: ["src"],
      path: "<rootDir>/src/locales/{locale}/messages",
    },
  ],
});
