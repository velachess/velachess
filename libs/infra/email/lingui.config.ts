import { defineConfig } from "@lingui/cli";

import { EMAIL_LOCALES } from "./locale.ts";

export default defineConfig({
  locales: [...EMAIL_LOCALES],
  sourceLocale: "en",
  catalogs: [
    {
      include: ["templates"],
      path: "<rootDir>/locales/{locale}/messages",
    },
  ],
});
