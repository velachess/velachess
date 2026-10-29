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
import { accountIsTracked } from "../../../../test/handlers/accounts.ts";
import { renderApp } from "../../../../test/render.tsx";
import { server } from "../../../../test/server.ts";
import { dropSyncStreams, openSyncStreams } from "../../../../test/sync-stream.ts";

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

/** Longer than the poll, so "nothing more was asked" means it stopped
 * rather than that the wait was too short. */
const PAST_ONE_POLL_MS = 4_000;

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
    expect(await screen.findByRole("button", { name: "Syncing…" })).toBeDisabled();
    expect(screen.queryByText("just-arrived")).not.toBeInTheDocument();

    landSync(latestSync().id);

    expect(await screen.findByText("just-arrived")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Sync games" })).toBeEnabled();
  });

  it("treats a cooldown as nothing to do, silently", async () => {
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

  it("admits it once, however often it is retried", async () => {
    server.use(
      http.post("/api/accounts/sync", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );
    const syncs = countRequests("/api/accounts/sync");

    const { user } = await renderApp();
    await screen.findByText("already-here");

    for (let press = 1; press <= 3; press += 1) {
      await user.click(screen.getByRole("button", { name: "Sync games" }));
      await waitFor(() => expect(syncs.count).toBe(press));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Sync games" })).toBeEnabled(),
      );
    }
    syncs.stop();

    expect(screen.getAllByText("Couldn't sync your games")).toHaveLength(1);
  });

  it("reports the sync it started once it lands", async () => {
    stageIncomingGames(aGame({ blackName: "just-arrived" }));

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));
    await screen.findByRole("button", { name: "Syncing…" });

    landSync(latestSync().id);

    expect(await screen.findByText("Games synced")).toBeInTheDocument();
  });

  it("comes back from a sync the server failed, and says so", async () => {
    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));
    await screen.findByRole("button", { name: "Syncing…" });

    landSync(latestSync().id, { fails: true });

    expect(await screen.findByText("Couldn't finish syncing")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Sync games" })).toBeEnabled();
  });

  it.each(["queued", "running", "retrying"] as const)(
    "is disabled while the server calls the sync %s",
    async (status) => {
      scheduleSync("account-1", "manual").status = status;

      await renderApp();

      expect(await screen.findByRole("button", { name: "Syncing…" })).toBeDisabled();
    },
  );

  it.each(["succeeded", "failed"] as const)(
    "is ready again once the server calls the sync %s",
    async (status) => {
      scheduleSync("account-1", "manual").status = status;

      await renderApp();
      await screen.findByText("already-here");

      expect(screen.getByRole("button", { name: "Sync games" })).toBeEnabled();
      expect(screen.queryByText("Games synced")).not.toBeInTheDocument();
      expect(screen.queryByText("Couldn't finish syncing")).not.toBeInTheDocument();
    },
  );

  it("stays disabled while a second account is still syncing", async () => {
    accountIsTracked({ username: "other-handle", platform: "lichess" });
    const mine = scheduleSync("account-1", "manual");
    const other = scheduleSync("account-2", "manual");

    await renderApp();
    expect(await screen.findByRole("button", { name: "Syncing…" })).toBeDisabled();

    landSync(mine.id);
    await sleep(50);
    expect(screen.getByRole("button", { name: "Syncing…" })).toBeDisabled();

    landSync(other.id);

    expect(await screen.findByRole("button", { name: "Sync games" })).toBeEnabled();
    // Both landed, one toast: it says how syncing went, not how each
    // account went.
    expect(screen.getAllByText("Games synced")).toHaveLength(1);
  });

  it("calls a sync successful even while another account's last one reads failed", async () => {
    // The other account's failure is older than this sync and says nothing
    // about it.
    accountIsTracked({
      username: "other-handle",
      platform: "lichess",
      lastSyncError: "internal",
    });

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));
    await screen.findByRole("button", { name: "Syncing…" });
    landSync(latestSync().id);

    expect(await screen.findByText("Games synced")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't finish syncing")).not.toBeInTheDocument();
  });

  it("follows a sync the server was already running, from any screen", async () => {
    stageIncomingGames(aGame({ blackName: "just-arrived" }));
    const job = scheduleSync("account-1", "manual");

    await renderApp();
    expect(await screen.findByRole("button", { name: "Syncing…" })).toBeDisabled();

    landSync(job.id);

    expect(await screen.findByText("just-arrived")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Sync games" })).toBeEnabled();
  });

  it("asks nothing about the job itself, and stops asking once nothing is syncing", async () => {
    const job = scheduleSync("account-1", "manual");
    const jobReads = countRequests("/api/syncs/");
    const streams = countRequests("/api/syncs/events");

    await renderApp();
    expect(await screen.findByRole("button", { name: "Syncing…" })).toBeDisabled();

    landSync(job.id);
    await screen.findByRole("button", { name: "Sync games" });

    const accounts = countRequests("/api/accounts");
    await sleep(PAST_ONE_POLL_MS);
    expect(accounts.count).toBe(0);
    // Every /api/syncs/ request this screen made was the one stream.
    expect(jobReads.count).toBe(streams.count);
    [jobReads, streams, accounts].forEach((counter) => counter.stop());
  }, 15_000);

  it("keeps asking while the sync is still running", async () => {
    scheduleSync("account-1", "manual");

    await renderApp();
    expect(await screen.findByRole("button", { name: "Syncing…" })).toBeDisabled();

    const accounts = countRequests("/api/accounts");
    await sleep(PAST_ONE_POLL_MS);
    expect(accounts.count).toBeGreaterThan(0);
    accounts.stop();
  }, 15_000);
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
    landSync(latestSync().id);

    expect(await screen.findByText("just-arrived")).toBeInTheDocument();
    expect(accounts.count).toBeGreaterThan(0);
    expect(library.count).toBeGreaterThan(0);
    // Nothing about the session: a sync landing is not a sign-in.
    expect(sessions.count).toBe(0);
    [sessions, accounts, library].forEach((counter) => counter.stop());
  });

  it("reconnects when the stream ends and brings the library current, since what landed meanwhile was never announced", async () => {
    stageIncomingGames(aGame({ blackName: "landed-in-the-dark" }));
    await renderApp();
    await screen.findByText("already-here");
    await waitFor(() => expect(openSyncStreams()).toBe(1));
    const connections = countRequests("/api/syncs/events");

    dropSyncStreams();
    addGames(aGame({ blackName: "landed-in-the-dark" }));

    expect(await screen.findByText("landed-in-the-dark")).toBeInTheDocument();
    await waitFor(() => expect(openSyncStreams()).toBe(1));
    expect(connections.count).toBe(1);
    connections.stop();
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
    // Nothing is syncing, so nothing polls either.
    expect(accounts.count).toBe(0);
    expect(library.count).toBe(0);

    server.resetHandlers();
    await waitFor(() => expect(openSyncStreams()).toBe(1));
    await waitFor(() => expect(accounts.count).toBeGreaterThan(0));
    expect(library.count).toBeGreaterThan(0);
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
