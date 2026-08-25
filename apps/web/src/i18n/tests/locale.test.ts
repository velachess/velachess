import { describe, expect, it } from "vitest";

import { activateLocale, i18n } from "../i18n.ts";
import { isLocale, resolveLocale } from "../locale.ts";

describe("resolveLocale", () => {
  it("prefers what the person chose before anything else", () => {
    expect(resolveLocale("es", ["pt-BR", "en"])).toBe("es");
  });

  it("ignores a stored value that is no longer a locale we ship", () => {
    expect(resolveLocale("de", ["pt-BR"])).toBe("pt-BR");
  });

  it("takes the browser's first supported language", () => {
    expect(resolveLocale(null, ["fr", "es", "en"])).toBe("es");
  });

  it("matches a region-less request to the regional catalogue", () => {
    // A browser asking for "pt" or "pt-PT" should still get Portuguese
    // rather than falling all the way through to English.
    expect(resolveLocale(null, ["pt"])).toBe("pt-BR");
    expect(resolveLocale(null, ["pt-PT"])).toBe("pt-BR");
  });

  it("falls back to English when nothing matches", () => {
    expect(resolveLocale(null, ["de", "ja"])).toBe("en");
    expect(resolveLocale(null, [])).toBe("en");
  });

  it("narrows a plain string to a locale", () => {
    expect(isLocale("pt-BR")).toBe(true);
    expect(isLocale("de")).toBe(false);
  });
});

describe("activateLocale", () => {
  it("activates the already-bundled English catalogue", async () => {
    await activateLocale("es");
    await activateLocale("en");

    expect(i18n.locale).toBe("en");
  });

  it("loads and activates a locale that isn't bundled yet", async () => {
    await activateLocale("pt-BR");

    expect(i18n.locale).toBe("pt-BR");
    expect(Object.keys(i18n.messages).length).toBeGreaterThan(0);
  });
});
