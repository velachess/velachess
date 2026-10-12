import { act, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { useMyAccounts } from "../my-accounts.ts";
import {
  addGames,
  landSync,
  latestSync,
  refuseRefreshFor,
  scheduleSync,
  stageIncomingGames,
} from "../../../test/archive.ts";
import { deviceHasImported } from "../../../test/device.ts";
import { accountIsTracked } from "../../../test/handlers/accounts.ts";
import { aGame } from "../../../test/games.ts";
import { renderApp } from "../../../test/render.tsx";
import { server } from "../../../test/server.ts";
import { dropSyncStreams, openSyncStreams } from "../../../test/sync-stream.ts";

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

/** A second tracked account whose syncs the archive schedules like the first's. */
function secondAccountSyncs() {
  const second = accountIsTracked({ platform: "lichess", username: "second-seat" });
  server.use(
    http.post(`/api/accounts/${second.id}/sync`, () => {
      const job = scheduleSync(second.id, "manual");
      return HttpResponse.json({ syncId: job.id, status: job.status }, { status: 202 });
    }),
  );
  return second;
}

/**
 * The button asks; the worker syncs; the stream says when it landed. What
 * the button owes the person is honesty about those three moments: that
 * the request went through (or was too soon, or failed), that a sync is
 * still running, and the games themselves once they are in.
 */
describe("sync games button", () => {
  beforeEach(() => {
    deviceHasImported();
    addGames(aGame({ blackName: "already-here" }));
  });

  it("asks the server, shows the sync running, and lists the games once they land", async () => {
    stageIncomingGames(aGame({ blackName: "just-arrived" }));

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));
    // Running per the server's accounts, not this button's memory.
    expect(await screen.findByRole("button", { name: "Syncing…" })).toBeDisabled();
    expect(screen.queryByText("just-arrived")).not.toBeInTheDocument();

    landSync(latestSync().id);

    expect(await screen.findByText("just-arrived")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Sync games" })).toBeEnabled();
  });

  it("treats the cooldown as an answer, not a failure", async () => {
    refuseRefreshFor(45);

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("Synced a moment ago")).toBeInTheDocument();
    // With the actual wait — "a moment" invites an immediate retry.
    expect(screen.getByText("Try again in 45 seconds.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync games" })).toBeEnabled();
  });

  it("reports an account in cooldown while another one's sync still goes through", async () => {
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
    // The 429 did not discard the other account's 202.
    expect(await screen.findByRole("button", { name: "Syncing…" })).toBeDisabled();
    landSync(latestSync().id);
    expect(await screen.findByText("just-arrived")).toBeInTheDocument();
  });

  it("syncs the accounts the server knows, never a stale remembered id", async () => {
    // A browser that imported against a database since rebuilt still
    // remembers the old uuid. The server's list is the authority; a
    // remembered id reaching the sync route is a guaranteed 404.
    useMyAccounts.getState().remember({
      accountId: "gone-from-a-rebuilt-db",
      platform: "chess_com",
      username: "me",
    });

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByRole("button", { name: "Syncing…" })).toBeInTheDocument();
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

  it("follows a sync the server was already running, from any screen", async () => {
    // A reload mid-sync, or a sync started from settings: the accounts say
    // one is on its way, and the button is disabled until the stream says
    // it landed.
    stageIncomingGames(aGame({ blackName: "just-arrived" }));
    const job = scheduleSync("account-1", "manual");

    await renderApp();
    expect(await screen.findByRole("button", { name: "Syncing…" })).toBeDisabled();

    landSync(job.id);

    expect(await screen.findByText("just-arrived")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Sync games" })).toBeEnabled();
  });
});

describe("the sync stream", () => {
  beforeEach(() => {
    deviceHasImported();
    addGames(aGame({ blackName: "already-here" }));
  });

  it("is one connection for the session, kept across screens and closed with it", async () => {
    const connections = countRequests("/api/syncs/events");
    const { router, unmount } = await renderApp();
    await screen.findByText("already-here");
    await waitFor(() => expect(openSyncStreams()).toBe(1));

    await act(() => router.navigate({ to: "/settings/connections" }));
    await screen.findByText("Connect an account");
    await act(() => router.navigate({ to: "/games" }));
    await screen.findByText("already-here");
    expect(connections.count).toBe(1);

    unmount();
    // Closed with the wall: a stream ending now brings nobody back.
    dropSyncStreams();
    await sleep(50);
    expect(connections.count).toBe(1);
    connections.stop();
  });

  it("refreshes the library and the accounts on each sync that lands, and nothing else", async () => {
    const second = secondAccountSyncs();
    stageIncomingGames(aGame({ blackName: "just-arrived" }));
    const { user } = await renderApp();
    await screen.findByText("already-here");
    const sessions = countRequests("/api/auth/get-session");
    const accounts = countRequests("/api/accounts");
    const library = countRequests("/api/games");

    await user.click(screen.getByRole("button", { name: "Sync games" }));
    // Two POSTs, plus the accounts refresh once the requests settle.
    await waitFor(() => expect(accounts.count).toBe(3));
    const first = [...Array(2)].map((_, index) => `sync-${index + 1}`);

    landSync(first[0]!);
    expect(await screen.findByText("just-arrived")).toBeInTheDocument();
    await waitFor(() => expect(accounts.count).toBe(4));
    const afterFirst = library.count;
    expect(afterFirst).toBeGreaterThan(0);

    landSync(first[1]!, { fails: true });
    await waitFor(() => expect(accounts.count).toBe(5));
    await waitFor(() => expect(library.count).toBe(afterFirst + 1));
    // A failed sync refreshes what it changed; it claims nothing.
    expect(screen.queryByText("Couldn't reach that account")).not.toBeInTheDocument();
    expect(screen.queryByText(second.username)).not.toBeInTheDocument();
    expect(sessions.count).toBe(0);
    [sessions, accounts, library].forEach((counter) => counter.stop());
  });

  it("reconnects when the stream ends and refreshes once, since what landed meanwhile was never announced", async () => {
    stageIncomingGames(aGame({ blackName: "landed-in-the-dark" }));
    await renderApp();
    await screen.findByText("already-here");
    await waitFor(() => expect(openSyncStreams()).toBe(1));
    const connections = countRequests("/api/syncs/events");
    const accounts = countRequests("/api/accounts");
    const library = countRequests("/api/games");

    // The games land while nobody can hear it.
    dropSyncStreams();
    const job = scheduleSync("account-1", "manual");
    job.gamesInserted = 1;
    addGames(aGame({ blackName: "landed-in-the-dark" }));

    expect(await screen.findByText("landed-in-the-dark")).toBeInTheDocument();
    await waitFor(() => expect(openSyncStreams()).toBe(1));
    expect(connections.count).toBe(1);
    expect(accounts.count).toBe(1);
    expect(library.count).toBe(1);
    [connections, accounts, library].forEach((counter) => counter.stop());
  });

  it("keeps trying through a failed attempt without refreshing, and refreshes once a stream opens again", async () => {
    await renderApp();
    await screen.findByText("already-here");
    await waitFor(() => expect(openSyncStreams()).toBe(1));
    const accounts = countRequests("/api/accounts");
    const library = countRequests("/api/games");

    let refusals = 0;
    server.use(
      http.get("/api/syncs/events", () => {
        refusals += 1;
        return HttpResponse.json({ error: "unavailable" }, { status: 503 });
      }),
    );
    dropSyncStreams();
    await waitFor(() => expect(refusals).toBeGreaterThanOrEqual(2));
    expect(accounts.count).toBe(0);
    expect(library.count).toBe(0);

    server.resetHandlers();
    await waitFor(() => expect(openSyncStreams()).toBe(1));
    await waitFor(() => expect(accounts.count).toBe(1));
    expect(library.count).toBe(1);
    [accounts, library].forEach((counter) => counter.stop());
  });

  it("takes a 401 on the stream as the session ending", async () => {
    server.use(
      http.get("/api/syncs/events", () =>
        HttpResponse.json({ error: "unauthorized" }, { status: 401 }),
      ),
    );
    const connections = countRequests("/api/syncs/events");

    const { router } = await renderApp();

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    await sleep(50);
    // The wall came down and took the stream with it: no retry loop.
    expect(connections.count).toBe(1);
    connections.stop();
  });
});
