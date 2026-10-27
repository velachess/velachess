import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { renderApp } from "../../../test/render.tsx";
import { sessionActive } from "../../../test/handlers/auth.ts";

describe("settings navigation", () => {
  it("lists every section and links to its route", async () => {
    sessionActive();

    await renderApp({ path: "/settings/account" });

    for (const label of [
      "Account",
      "Chess accounts",
      "Language",
      "Appearance",
      "Gameplay",
    ]) {
      expect(await screen.findByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("titles each section with its navigation label", async () => {
    sessionActive();

    await renderApp({ path: "/settings/connections" });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Chess accounts" }),
    ).toBeInTheDocument();
  });

  it("is reachable by direct navigation to each section", async () => {
    sessionActive();

    const { router } = await renderApp({ path: "/settings/gameplay" });

    expect(router.state.location.pathname).toBe("/settings/gameplay");
    expect(
      await screen.findByRole("switch", { name: "Move sounds" }),
    ).toBeInTheDocument();
  });

  it("follows a nav click to the new section", async () => {
    sessionActive();

    const { user, router } = await renderApp({ path: "/settings/account" });

    await user.click(await screen.findByRole("link", { name: "Chess accounts" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/settings/connections"),
    );
  });
});
