import { setupI18n } from "@lingui/core";

import { messages } from "../locales/en/messages.po";
import { DEFAULT_LOCALE } from "./locale.ts";

/**
 * Instance ships already active with English bundled — I18nProvider renders `null` until activated,
 * so starting empty would blank the app until the first catalogue loads. Other locales fetch on switch.
 */
export const i18n = setupI18n({
  locale: DEFAULT_LOCALE,
  messages: { [DEFAULT_LOCALE]: messages },
});
