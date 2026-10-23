import { setupI18n, type I18n } from "@lingui/core";
import { jsx } from "react/jsx-runtime";
import { render, toPlainText } from "react-email";

import { messages as en } from "./locales/en/messages.ts";
import { messages as es } from "./locales/es/messages.ts";
import { messages as ptBR } from "./locales/pt-BR/messages.ts";
import type { EmailLocale } from "./locale.ts";
import { ActionEmail } from "./templates/action-email.ts";
import { AUTH_EMAIL_COPY, type AuthEmailTemplate } from "./templates/auth-emails.ts";

// One instance per locale, never `activate()` on a shared one: concurrent
// requests in different languages would read each other's locale.
const I18N: Record<EmailLocale, I18n> = {
  en: setupI18n({ locale: "en", messages: { en } }),
  "pt-BR": setupI18n({ locale: "pt-BR", messages: { "pt-BR": ptBR } }),
  es: setupI18n({ locale: "es", messages: { es } }),
};

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export async function renderAuthEmail({
  template,
  url,
  locale,
}: {
  template: AuthEmailTemplate;
  url: string;
  locale: EmailLocale;
}): Promise<RenderedEmail> {
  const { subject, ...copy } = AUTH_EMAIL_COPY[template](I18N[locale]);
  const html = await render(jsx(ActionEmail, { locale, url, ...copy }));

  return { subject, html, text: toPlainText(html) };
}
