import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";

import { renderApp } from "../../../test/render.tsx";
import { sessionActive } from "../../../test/handlers/auth.ts";
import { useSoundPreferences } from "../../../chess-sounds/index.ts";

describe("gameplay", () => {
  it("keeps move sounds under a Sounds group", async () => {
    sessionActive();

    await renderApp({ path: "/settings/gameplay" });

    const sounds = await screen.findByRole("group", { name: "Sounds" });
    expect(within(sounds).getByRole("switch", { name: "Move sounds" })).toBeChecked();
  });

  it("mutes and unmutes move sounds", async () => {
    sessionActive();

    const { user } = await renderApp({ path: "/settings/gameplay" });

    const moveSounds = await screen.findByRole("switch", { name: "Move sounds" });
    await user.click(moveSounds);

    expect(useSoundPreferences.getState().muted).toBe(true);
    expect(moveSounds).not.toBeChecked();

    await user.click(moveSounds);

    expect(useSoundPreferences.getState().muted).toBe(false);
    expect(moveSounds).toBeChecked();
  });
});
