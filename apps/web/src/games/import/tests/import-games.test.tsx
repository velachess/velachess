import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { addGames } from "../../../test/archive.ts";
import { ME, aGame } from "../../../test/games.ts";
import { accountIsTracked } from "../../../test/handlers/accounts.ts";
import { renderApp } from "../../../test/render.tsx";

/**
 * Importing is one read, so the screen has exactly two outcomes to get
 * right: the archive opened, or the platform has never heard of that
 * name. Both are asserted through what appears, not through what was
 * requested.
 */
describe("import games", () => {
  it("opens the games list once the archive answers", async () => {
    addGames(aGame({ blackName: "first-opponent" }));

    const { user } = await renderApp({ path: "/import" });

    await user.type(screen.getByLabelText("Chess.com username"), ME);
    await user.click(screen.getByRole("button", { name: "Import" }));

    // Landing on the list is the assertion: it proves the account was
    // remembered, because `_app` would have bounced the navigation back.
    expect(await screen.findByText("first-opponent")).toBeInTheDocument();
  });

  it("says so when the platform has no such player", async () => {
    const { user } = await renderApp({ path: "/import" });

    await user.type(screen.getByLabelText("Chess.com username"), "nobody-here");
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(
      await screen.findByText(
        "No games found for that username. Check the spelling and try again.",
      ),
    ).toBeInTheDocument();
  });

  it("catches an impossible username before spending a request", async () => {
    // No handler describes a request with a space in the username, so if
    // one were sent the run would fail on the unhandled request rather
    // than on this assertion — which is the check working twice.
    const { user } = await renderApp({ path: "/import" });

    await user.type(screen.getByLabelText("Chess.com username"), "not a username");
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(
      await screen.findByText("Letters, numbers, hyphen and underscore only"),
    ).toBeInTheDocument();
  });

  it("asks for a username rather than submitting an empty field", async () => {
    const { user } = await renderApp({ path: "/import" });

    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Enter your username")).toBeInTheDocument();
  });

  it("blocks a second Chess.com handle once one is already connected", async () => {
    // One account per provider: the form for an already-connected
    // platform is a dead end for every username, not just the typed one —
    // so it never gets the chance to be typed.
    accountIsTracked({ platform: "chess_com", username: "magnus" });

    await renderApp({ path: "/import" });

    expect(await screen.findByText("Account already connected")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This Chess.com account is already connected. Manage your existing connection above instead.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Chess.com username")).not.toBeInTheDocument();
  });

  it("leaves the other provider's tab free to import", async () => {
    accountIsTracked({ platform: "chess_com", username: "magnus" });

    const { user } = await renderApp({ path: "/import" });
    await screen.findByText("Account already connected");

    await user.click(screen.getByRole("tab", { name: "Lichess" }));

    expect(screen.getByLabelText("Lichess username")).toBeInTheDocument();
    expect(screen.queryByText("Account already connected")).not.toBeInTheDocument();
  });
});
