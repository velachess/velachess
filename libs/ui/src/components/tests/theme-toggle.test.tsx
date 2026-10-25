import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../lib/theme-provider.tsx";
import { ThemeToggle } from "../theme-toggle.tsx";

const LABELS = { toggle: "Toggle theme", system: "System", light: "Light", dark: "Dark" };

function prefersDark(matches: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function Page() {
  return (
    <ThemeProvider>
      <ThemeToggle labels={LABELS} />
    </ThemeProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("hydrates for a light visitor over markup rendered before the theme was known", async () => {
  prefersDark(true);
  const container = document.createElement("div");
  container.innerHTML = renderToString(<Page />);
  prefersDark(false);
  const recovered: unknown[] = [];

  await act(async () => {
    hydrateRoot(container, <Page />, {
      onRecoverableError: (error) => recovered.push(error),
    });
  });

  expect(recovered).toEqual([]);
});
