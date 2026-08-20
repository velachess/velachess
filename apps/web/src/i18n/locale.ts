const LOCALES = {
  en: "English",
  "pt-BR": "Português (Brasil)",
  es: "Español",
} as const;

export type Locale = keyof typeof LOCALES;

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string): value is Locale {
  return value in LOCALES;
}

/** Pure so it can be tested without a DOM. */
export function resolveLocale(
  stored: string | null,
  preferred: readonly string[],
): Locale {
  if (stored && isLocale(stored)) return stored;

  for (const candidate of preferred) {
    if (isLocale(candidate)) return candidate;

    // "pt" and "pt-PT" should still land on the Portuguese catalogue.
    const base = candidate.split("-")[0];
    const match = Object.keys(LOCALES).find((locale) => locale.split("-")[0] === base);
    if (match && isLocale(match)) return match;
  }

  return DEFAULT_LOCALE;
}
