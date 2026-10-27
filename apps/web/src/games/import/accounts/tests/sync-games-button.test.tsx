import { act, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import {
  addGames,
  landSync,
  latestSync,
  refuseRefreshFor,
  scheduleSync,
  stageIncomingGames,
} from "../../../../test/archive.ts";
import { deviceHasImported } from "../../../../test/device.ts";
import { aGame } from "../../../../test/games.ts";
import { renderApp } from "../../../../test/render.tsx";
import { server } from "../../../../test/server.ts";
import { dropSyncStreams, openSyncStreams } from "../../../../test/sync-stream.ts";

/** Counts requests under `prefix` from the moment it is called. */
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

/**
 * The button asks, the worker syncs, the stream says when it landed, and
 * the button owes the person honesty about all three.
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
    // Per the server's accounts, not this button's memory.
    expect(await screen.findByRole("button", { name: "Syncing…" })).toBeDisabled();
    expect(screen.queryByText("just-arrived")).not.toBeInTheDocument();

    landSync(latestSync().id);

    expect(await screen.findByText("just-arrived")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Sync games" })).toBeEnabled();
  });

  it("treats a cooldown as nothing to do, silently", async () => {
    // The backend folds a cooling-down account out of its answer, so there
    // is nothing new to watch.
    refuseRefreshFor(45);

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByRole("button", { name: "Sync games" })).toBeEnabled();
    expect(screen.queryByText("Synced a moment ago")).not.toBeInTheDocument();
    expect(screen.queryByText("Games synced")).not.toBeInTheDocument();
  });

  it("admits it could not sync", async () => {
    server.use(
      http.post("/api/accounts/sync", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("Couldn't sync your games")).toBeInTheDocument();
  });

  it("fires a success toast once the sync it started lands", async () => {
    stageIncomingGames(aGame({ blackName: "just-arrived" }));

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));
    await screen.findByRole("button", { name: "Syncing…" });

    landSync(latestSync().id);

    expect(await screen.findByText("Games synced")).toBeInTheDocument();
  });

  it("fires an error toast when the sync it started lands as failed", async () => {
    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));
    await screen.findByRole("button", { name: "Syncing…" });

    landSync(latestSync().id, { fails: true });

    expect(await screen.findByText("Couldn't finish syncing")).toBeInTheDocument();
  });

  it("stays quiet for a sync nobody clicked this button for", async () => {
    // A sync the button never watched refreshes the data but earns no
    // toast.
    const job = scheduleSync("account-1", "connect");

    await renderApp();
    await screen.findByText("already-here");

    landSync(job.id);

    expect(screen.queryByText("Games synced")).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't finish syncing")).not.toBeInTheDocument();
  });

  it("follows a sync the server was already running, from any screen", async () => {
    // A reload mid-sync: the accounts say one is on its way, and the button
    // stays disabled until the stream says it landed.
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
    await screen.findByRole("heading", { name: "Chess accounts" });
    await act(() => router.navigate({ to: "/games" }));
    await screen.findByText("already-here");
    expect(connections.count).toBe(1);

    unmount();
    // A stream ending with the wall brings nobody back.
    dropSyncStreams();
    await sleep(50);
    expect(connections.count).toBe(1);
    connections.stop();
  });

  it("refreshes the library and the accounts on each sync that lands, and nothing else", async () => {
    stageIncomingGames(aGame({ blackName: "just-arrived" }));
    const { user } = await renderApp();
    await screen.findByText("already-here");
    const sessions = countRequests("/api/auth/get-session");
    const accounts = countRequests("/api/accounts");
    const library = countRequests("/api/games");

    await user.click(screen.getByRole("button", { name: "Sync games" }));
    // One POST, plus the refresh once it settles.
    await waitFor(() => expect(accounts.count).toBe(2));

    landSync(latestSync().id);
    expect(await screen.findByText("just-arrived")).toBeInTheDocument();
    await waitFor(() => expect(accounts.count).toBe(3));
    const afterFirst = library.count;
    expect(afterFirst).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Sync games" }));
    await waitFor(() => expect(accounts.count).toBe(5));
    landSync(latestSync().id, { fails: true });
    await waitFor(() => expect(accounts.count).toBe(6));
    // A failed sync refreshes what it changed and claims nothing.
    await waitFor(() => expect(library.count).toBe(afterFirst + 1));
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
    // The wall took the stream with it: no retry loop.
    expect(connections.count).toBe(1);
    connections.stop();
  });
});
