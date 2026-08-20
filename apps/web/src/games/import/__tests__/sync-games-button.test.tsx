import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { useMyAccounts } from "../my-accounts.ts";
import { addGames, refuseRefreshFor, stageIncomingGames } from "../../../test/archive.ts";
import { deviceHasImported } from "../../../test/device.ts";
import { aGame } from "../../../test/games.ts";
import { renderApp } from "../../../test/render.tsx";
import { server } from "../../../test/server.ts";

/**
 * Refreshing has four answers and only one of them is "here are your new
 * games". The other three — nothing new, too soon, unreachable — are the
 * ones a silent button gets wrong, so each has its own test.
 */
describe("sync games button", () => {
  beforeEach(() => {
    deviceHasImported();
    addGames(aGame({ blackName: "already-here" }));
  });

  it("brings the new games in and says how many", async () => {
    stageIncomingGames(aGame({ blackName: "just-arrived" }));

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("New games imported")).toBeInTheDocument();
    // The toast is the receipt; the row is the point. A refresh that
    // reports a number without refetching leaves the list a lie.
    expect(await screen.findByText("just-arrived")).toBeInTheDocument();
  });

  it("says nothing was new instead of staying silent", async () => {
    // Silence after pressing a button reads as a button that doesn't work.
    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("Already up to date")).toBeInTheDocument();
    expect(screen.getByText("No new games since your last sync.")).toBeInTheDocument();
  });

  it("treats the cooldown as an answer, not a failure", async () => {
    refuseRefreshFor(45);

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("Synced a moment ago")).toBeInTheDocument();
  });

  it("syncs the accounts the server knows, never a stale remembered id", async () => {
    // A browser that imported against a database since rebuilt still
    // remembers the old uuid. The server's list is the authority; a
    // remembered id reaching the sync route is a guaranteed 404, which
    // this button once reported as "couldn't reach that account".
    useMyAccounts.getState().remember({
      accountId: "gone-from-a-rebuilt-db",
      platform: "chess_com",
      username: "me",
    });
    stageIncomingGames(aGame({ blackName: "just-arrived" }));

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("New games imported")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't reach that account")).not.toBeInTheDocument();
  });

  it("admits it could not reach the account", async () => {
    server.use(
      http.post("/api/accounts/:id/sync", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("Couldn't reach that account")).toBeInTheDocument();
  });
});
