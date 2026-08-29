import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderApp } from "../../../test/render.tsx";
import { sessionActive } from "../../../test/handlers/auth.ts";
import { useSoundPreferences } from "../../../shared/chess-sounds/chess-sounds.ts";

/** Settings → Gameplay: the only place move sounds can be muted — not
 * duplicated in the account dropdown. */
describe("gameplay", () => {
  it("mutes and unmutes move sounds", async () => {
    sessionActive();

    const { user } = await renderApp({ path: "/settings/gameplay" });

    const mute = await screen.findByRole("button", { name: "Mute move sounds" });
    await user.click(mute);

    expect(useSoundPreferences.getState().muted).toBe(true);

    const unmute = screen.getByRole("button", { name: "Turn move sounds on" });
    await user.click(unmute);

    expect(useSoundPreferences.getState().muted).toBe(false);
  });
});
