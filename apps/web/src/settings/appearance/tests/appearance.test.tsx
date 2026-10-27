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
  it("offers System, Light and Dark as one choice, with the current theme selected", async () => {
    sessionActive();

    await renderApp({ path: "/settings/appearance" });

    const group = await screen.findByRole("radiogroup", { name: "Application theme" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Dark" })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("applies and remembers a theme the moment it is chosen", async () => {
    sessionActive();

    const { user } = await renderApp({ path: "/settings/appearance" });

    await user.click(await screen.findByRole("radio", { name: "Dark" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Light" }));

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(window.localStorage.getItem("velachess-theme")).toBe("light");
  });

  it("is operable from the keyboard", async () => {
    sessionActive();

    const { user } = await renderApp({ path: "/settings/appearance" });

    await user.click(await screen.findByRole("radio", { name: "Light" }));
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
