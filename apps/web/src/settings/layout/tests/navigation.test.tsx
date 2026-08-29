import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { renderApp } from "../../../test/render.tsx";
import { sessionActive } from "../../../test/handlers/auth.ts";

/**
 * Settings navigation is route-driven: the active section comes from the
 * URL, every section is a real destination (direct link, refresh, back/
 * forward all agree), and there is no local `useState` switch.
 */

describe("settings navigation", () => {
  it("lists every section and links to its route", async () => {
    sessionActive();

    await renderApp({ path: "/settings/account" });

    for (const label of [
      "Account",
      "Connections",
      "Language & region",
      "Appearance",
      "Gameplay",
    ]) {
      expect(await screen.findByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("is reachable by direct navigation to each section", async () => {
    sessionActive();

    const { router } = await renderApp({ path: "/settings/gameplay" });

    expect(router.state.location.pathname).toBe("/settings/gameplay");
    expect(
      await screen.findByRole("button", { name: "Mute move sounds" }),
    ).toBeInTheDocument();
  });

  it("follows a nav click to the new section", async () => {
    sessionActive();

    const { user, router } = await renderApp({ path: "/settings/account" });

    await user.click(await screen.findByRole("link", { name: "Connections" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/settings/connections"),
    );
  });
});
