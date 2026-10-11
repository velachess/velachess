import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { useMyAccounts } from "../my-accounts.ts";
import {
  addGames,
  failNextSync,
  refuseRefreshFor,
  stageIncomingGames,
  syncTakesPolls,
} from "../../../test/archive.ts";
import { deviceHasImported } from "../../../test/device.ts";
import { accountIsTracked } from "../../../test/handlers/accounts.ts";
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
    // With the actual wait — "a moment" invites an immediate retry.
    expect(screen.getByText("Try again in 45 seconds.")).toBeInTheDocument();
  });

  it("reports an account in cooldown even while another one syncs", async () => {
    const cooling = accountIsTracked({ platform: "lichess", username: "second-seat" });
    server.use(
      http.post(`/api/accounts/${cooling.id}/sync`, () =>
        HttpResponse.json(
          { error: "synced too recently", retryAfterSeconds: 30 },
          { status: 429, headers: { "Retry-After": "30" } },
        ),
      ),
    );
    stageIncomingGames(aGame({ blackName: "just-arrived" }));

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("Synced a moment ago")).toBeInTheDocument();
    expect(screen.getByText("Try again in 30 seconds.")).toBeInTheDocument();
    expect(await screen.findByText("New games imported")).toBeInTheDocument();
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

/** Counts requests whose path starts with `prefix`, from the moment it is called. */
function countRequests(prefix: string) {
  let count = 0;
  const listener = ({ request }: { request: Request }) => {
    if (new URL(request.url).pathname.startsWith(prefix)) count += 1;
  };
  server.events.on("request:start", listener);
  return {
    get count() {
      return count;
    },
    stop: () => server.events.removeListener("request:start", listener),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** A little over one 3 s polling interval. */
const ONE_POLL = 3_500;

describe("following a sync to its outcome", () => {
  beforeEach(() => {
    deviceHasImported();
    addGames(aGame({ blackName: "already-here" }));
  });

  it("asks every few seconds while the sync runs, and stops once it settles", async () => {
    syncTakesPolls(1);
    stageIncomingGames(aGame({ blackName: "just-arrived" }));
    const polls = countRequests("/api/syncs/");

    const { user } = await renderApp();
    await screen.findByText("already-here");
    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(
      await screen.findByText("New games imported", undefined, { timeout: ONE_POLL * 2 }),
    ).toBeInTheDocument();
    expect(await screen.findByText("just-arrived")).toBeInTheDocument();
    // One answer while running, one with the outcome — then silence.
    expect(polls.count).toBe(2);
    await sleep(ONE_POLL);
    expect(polls.count).toBe(2);
    polls.stop();
  }, 15_000);

  it("refetches the library and the accounts, and nothing else", async () => {
    const { user } = await renderApp();
    await screen.findByText("already-here");
    const sessions = countRequests("/api/auth/get-session");

    await user.click(screen.getByRole("button", { name: "Sync games" }));
    expect(await screen.findByText("Already up to date")).toBeInTheDocument();

    expect(sessions.count).toBe(0);
    sessions.stop();
  });

  it("stops asking when the screen goes away", async () => {
    syncTakesPolls(Number.POSITIVE_INFINITY);
    const polls = countRequests("/api/syncs/");

    const { user, unmount } = await renderApp();
    await screen.findByText("already-here");
    await user.click(screen.getByRole("button", { name: "Sync games" }));
    await waitFor(() => expect(polls.count).toBe(1));

    unmount();
    await sleep(ONE_POLL);
    expect(polls.count).toBe(1);
    polls.stop();
  }, 15_000);

  it("admits a sync that ended in failure", async () => {
    failNextSync();

    const { user } = await renderApp();
    await screen.findByText("already-here");
    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("Couldn't reach that account")).toBeInTheDocument();
  });
});
