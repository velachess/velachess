export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "velachess-theme";

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(
  resolved: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void {
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
}

/** Inline, pre-hydration script source: resolves the stored/system theme and
 * applies its class before React mounts, so the first paint never shows the
 * wrong theme. Each app delivers this string through its own mechanism
 * (Next's `<Script beforeInteractive>`, a raw `<script>` in TanStack Start's
 * document shell). */
export function themeInitScript(options?: {
  storageKey?: string;
  defaultTheme?: Theme;
}): string {
  const storageKey = options?.storageKey ?? THEME_STORAGE_KEY;
  const defaultTheme = options?.defaultTheme ?? "system";
  return `(function(){var root=document.documentElement;try{var saved=localStorage.getItem(${JSON.stringify(storageKey)});var theme=saved==="light"||saved==="dark"||saved==="system"?saved:${JSON.stringify(defaultTheme)};var resolved=theme==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):theme;root.classList.add(resolved)}catch(e){root.classList.add("dark")}})()`;
}
