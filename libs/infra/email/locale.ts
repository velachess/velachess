export const EMAIL_LOCALES = ["en", "pt-BR", "es"] as const;

export type EmailLocale = (typeof EMAIL_LOCALES)[number];

const DEFAULT_LOCALE: EmailLocale = "en";

function matchLocale(tag: string): EmailLocale | undefined {
  const lower = tag.toLowerCase();
  const base = lower.split("-")[0];
  return (
    EMAIL_LOCALES.find((locale) => locale.toLowerCase() === lower) ??
    EMAIL_LOCALES.find((locale) => locale.toLowerCase().split("-")[0] === base)
  );
}

export function emailLocaleOf(acceptLanguage: string | null): EmailLocale {
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((entry) => {
      const [tag = "", ...params] = entry.trim().split(";");
      const quality = params.find((param) => param.trim().startsWith("q="));
      return { tag: tag.trim(), q: quality ? Number(quality.trim().slice(2)) : 1 };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .toSorted((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const locale = matchLocale(tag);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}
