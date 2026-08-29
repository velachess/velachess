import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderApp } from "../../../test/render.tsx";
import { sessionActive } from "../../../test/handlers/auth.ts";

/**
 * Settings → Appearance: the same theme provider the account dropdown's
 * quick toggle reads. Selecting an option applies the class immediately —
 * there is no separate "save" step, and no second theme state to drift
 * from the shared one.
 */

describe("appearance", () => {
  it("reflects the current theme and switches it", async () => {
    sessionActive();

    const { user } = await renderApp({ path: "/settings/appearance" });

    const dark = await screen.findByRole("button", { name: "Dark" });
    await user.click(dark);

    expect(document.documentElement.classList.contains("dark")).toBe(true);

    const light = screen.getByRole("button", { name: "Light" });
    await user.click(light);

    expect(document.documentElement.classList.contains("light")).toBe(true);
  });
});
