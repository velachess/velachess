// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyTheme, resolveTheme, themeInitScript } from "./theme.ts";

function matchMediaMock(matches: boolean) {
  return vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
}

describe("resolveTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns light and dark unchanged", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves system from prefers-color-scheme", () => {
    vi.stubGlobal("matchMedia", matchMediaMock(true));
    expect(resolveTheme("system")).toBe("dark");

    vi.stubGlobal("matchMedia", matchMediaMock(false));
    expect(resolveTheme("system")).toBe("light");
  });
});

describe("applyTheme", () => {
  it("sets exactly one of light/dark on the given root, removing the other", () => {
    const root = document.createElement("html");
    root.classList.add("light");

    applyTheme("dark", root);

    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("light")).toBe(false);
  });
});

describe("themeInitScript", () => {
  it("produces a self-invoking function reading the given storage key", () => {
    const script = themeInitScript({ storageKey: "custom-key", defaultTheme: "light" });
    expect(script).toContain('localStorage.getItem("custom-key")');
    expect(script).toContain('"light"');
    expect(script.trim().startsWith("(function(){")).toBe(true);
    expect(script.trim().endsWith("})()")).toBe(true);
  });

  it("falls back to the shared storage key and system default", () => {
    const script = themeInitScript();
    expect(script).toContain('localStorage.getItem("velachess-theme")');
    expect(script).toContain('"system"');
  });
});
