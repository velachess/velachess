import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { useMyAccounts } from "../my-accounts.ts";
import {
  addGames,
  failNextSync,
  refuseRefreshFor,
  scheduleSync,
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

/** A second tracked account whose syncs the archive runs like the first's. */
function secondAccountSyncs(options: { fails?: boolean } = {}) {
  const second = accountIsTracked({ platform: "lichess", username: "second-seat" });
  server.use(
    http.post(`/api/accounts/${second.id}/sync`, () => {
      if (options.fails) failNextSync();
      const job = scheduleSync(second.id, "manual");
      return HttpResponse.json({ syncId: job.id, status: job.status }, { status: 202 });
    }),
  );
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

  it("refreshes the library and the accounts once the job settles, and nothing else", async () => {
    syncTakesPolls(1);
    const { user } = await renderApp();
    await screen.findByText("already-here");
    const sessions = countRequests("/api/auth/get-session");
    const accounts = countRequests("/api/accounts");
    const library = countRequests("/api/games");

    await user.click(screen.getByRole("button", { name: "Sync games" }));
    expect(
      await screen.findByText("Already up to date", undefined, { timeout: ONE_POLL * 2 }),
    ).toBeInTheDocument();
    const settled = { accounts: accounts.count, library: library.count };
    // The POST plus one refresh of the list on settle.
    expect(settled.accounts).toBe(2);
    expect(settled.library).toBeGreaterThan(0);

    // A settled job is never asked again, so nothing refreshes twice.
    await sleep(ONE_POLL);
    expect({ accounts: accounts.count, library: library.count }).toEqual(settled);
    expect(sessions.count).toBe(0);
    [sessions, accounts, library].forEach((counter) => counter.stop());
  }, 15_000);

  it("keeps following after the screen goes away, and stops once it settles", async () => {
    syncTakesPolls(1);
    const polls = countRequests("/api/syncs/");

    const { user, unmount } = await renderApp();
    await screen.findByText("already-here");
    await user.click(screen.getByRole("button", { name: "Sync games" }));
    await waitFor(() => expect(polls.count).toBe(1));

    unmount();
    await sleep(ONE_POLL);
    expect(polls.count).toBe(2);
    await sleep(ONE_POLL);
    expect(polls.count).toBe(2);
    polls.stop();
  }, 15_000);

  it("follows several accounts at once and reports their sum once", async () => {
    secondAccountSyncs();
    syncTakesPolls(1);
    stageIncomingGames(aGame({ blackName: "just-arrived" }));

    const { user } = await renderApp();
    await screen.findByText("already-here");
    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(
      await screen.findByText("New games imported", undefined, { timeout: ONE_POLL * 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    await sleep(ONE_POLL);
    expect(screen.getAllByText("New games imported")).toHaveLength(1);
  }, 15_000);

  it("fails the batch when any job fails, whatever the others brought", async () => {
    secondAccountSyncs({ fails: true });
    stageIncomingGames(aGame({ blackName: "just-arrived" }));

    const { user } = await renderApp();
    await screen.findByText("already-here");
    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("Couldn't reach that account")).toBeInTheDocument();
    expect(screen.queryByText("New games imported")).not.toBeInTheDocument();
    // What the other job brought still lands.
    expect(await screen.findByText("just-arrived")).toBeInTheDocument();
  });

  it("admits a sync that ended in failure", async () => {
    failNextSync();

    const { user } = await renderApp();
    await screen.findByText("already-here");
    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("Couldn't reach that account")).toBeInTheDocument();
  });
});
