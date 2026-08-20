import { defineConfig } from "@lingui/cli";

export default defineConfig({
  locales: ["en", "pt-BR", "es"],
  sourceLocale: "en",
  catalogs: [
    {
      include: ["src"],
      path: "<rootDir>/src/locales/{locale}/messages",
    },
  ],
});
