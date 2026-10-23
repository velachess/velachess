import { describe, expect, it } from "vitest";

import { messages as en } from "../locales/en/messages.ts";
import { messages as es } from "../locales/es/messages.ts";
import { messages as ptBR } from "../locales/pt-BR/messages.ts";
import { emailLocaleOf } from "../locale.ts";
import { renderAuthEmail } from "../render.ts";

const URL_WITH_TOKEN = "https://chess.example.com/reset-password?token=abc&x=1";

describe("renderAuthEmail", () => {
  it.each([
    ["en", "reset-password", "Reset your VelaChess password", "Choose a new password"],
    ["pt-BR", "reset-password", "Redefina sua senha do VelaChess", "Escolher nova senha"],
    [
      "es",
      "reset-password",
      "Restablece tu contraseña de VelaChess",
      "Elegir contraseña nueva",
    ],
    ["en", "verify-email", "Confirm your email for VelaChess", "Confirm email"],
    ["pt-BR", "verify-email", "Confirme seu email no VelaChess", "Confirmar email"],
    ["es", "verify-email", "Confirma tu correo en VelaChess", "Confirmar correo"],
  ] as const)(
    "%s %s: subject, HTML and text",
    async (locale, template, subject, action) => {
      const email = await renderAuthEmail({ template, url: URL_WITH_TOKEN, locale });

      expect(email.subject).toBe(subject);
      expect(email.html).toContain(`lang="${locale}"`);
      expect(email.html).toContain(
        'href="https://chess.example.com/reset-password?token=abc&amp;x=1"',
      );
      expect(email.html).toContain(action);
      expect(email.text).toContain(URL_WITH_TOKEN);
      expect(email.text).toContain(action);
      expect(email.text).not.toContain("<");
    },
  );
});

describe("compiled catalogs", () => {
  it.each([
    ["pt-BR", ptBR],
    ["es", es],
  ])("%s translates every message the templates use", (_locale, catalog) => {
    for (const id of Object.keys(en)) {
      expect(catalog[id], id).toBeTruthy();
      expect(catalog[id], id).not.toEqual(en[id]);
    }
  });
});

describe("emailLocaleOf", () => {
  it.each([
    [null, "en"],
    ["", "en"],
    ["fr-FR,fr;q=0.9", "en"],
    ["pt-BR,pt;q=0.9,en;q=0.8", "pt-BR"],
    ["pt-PT", "pt-BR"],
    ["es-MX", "es"],
    ["en;q=0.5, es;q=0.9", "es"],
    ["PT-br", "pt-BR"],
  ])("%j → %s", (header, locale) => {
    expect(emailLocaleOf(header)).toBe(locale);
  });
});
