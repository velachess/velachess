import { setupI18n } from "@lingui/core";

import { messages } from "../locales/en/messages.po";
import { DEFAULT_LOCALE, type Locale } from "./locale.ts";

/**
 * Instance ships already active with English bundled — I18nProvider renders `null` until activated,
 * so starting empty would blank the app until the first catalogue loads. Other locales fetch on switch.
 */
export const i18n = setupI18n({
  locale: DEFAULT_LOCALE,
  messages: { [DEFAULT_LOCALE]: messages },
});

/** Fetches and activates a locale's catalogue, skipping the network round
 * trip for English since it's already bundled. */
export async function activateLocale(locale: Locale): Promise<void> {
  if (locale === DEFAULT_LOCALE) {
    i18n.activate(DEFAULT_LOCALE);
    return;
  }

  const catalogue = await import(`../locales/${locale}/messages.po`);
  i18n.loadAndActivate({ locale, messages: catalogue.messages });
}
