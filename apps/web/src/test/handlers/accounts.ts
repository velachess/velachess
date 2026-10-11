import { http, HttpResponse } from "msw";

import {
  activeSyncOf,
  archiveAccount,
  knowsPlayer,
  pollSync,
  refreshArchive,
  scheduleSync,
  type SyncJob,
} from "../archive.ts";

interface TrackedAccountRow {
  id: string;
  platform: "chess_com" | "lichess";
  username: string;
  lastSyncedAt: string | null;
}

/** What the server says this user tracks. The onboarding reads it to tell
 * "never started" from "connected and empty" — the two states that used
 * to render identically as four zeroes. */
let trackedAccounts: TrackedAccountRow[] = [];

export function accountIsTracked(
  account: Partial<TrackedAccountRow> & { username: string },
): TrackedAccountRow {
  const row: TrackedAccountRow = {
    id: account.id ?? `account-${trackedAccounts.length + 1}`,
    platform: account.platform ?? "chess_com",
    username: account.username,
    lastSyncedAt: account.lastSyncedAt ?? null,
  };
  trackedAccounts = [...trackedAccounts, row];
  return row;
}

export function resetTrackedAccounts(): void {
  trackedAccounts = [];
}

/** Shaped exactly as GET /syncs/:id reports it. */
function syncJobBody(job: SyncJob) {
  return {
    id: job.id,
    accountId: job.accountId,
    trigger: job.trigger,
    status: job.status,
    progress: {
      unitsDone: null,
      unitsTotal: null,
      gamesFetched: job.gamesInserted,
      gamesInserted: job.gamesInserted,
    },
    error: job.error,
    retryAfterSeconds: null,
    startedAt: null,
    finishedAt: null,
  };
}

/** Sync contract incl. non-failure answers; 429 sends both a `Retry-After` header and the body field, per the status code contract. */
export const accountsHandlers = [
  http.get("/api/accounts", () =>
    HttpResponse.json(
      trackedAccounts.map((account) => {
        const active = activeSyncOf(account.id);
        return {
          ...account,
          syncStatus: active?.status ?? "idle",
          activeSyncId: active?.id ?? null,
          lastSyncError: null,
        };
      }),
    ),
  ),

  /** Connecting a handle is the only way to create one; 404 when the platform doesn't have it, matching the real route. */
  http.post("/api/accounts", async ({ request }) => {
    const body = (await request.json()) as { platform?: string; username?: string };
    if (!body.platform || !body.username) {
      return HttpResponse.json({ error: "invalid body" }, { status: 400 });
    }

    if (!knowsPlayer(body.platform, body.username)) {
      return HttpResponse.json(
        { error: "handle not found at the provider" },
        { status: 404 },
      );
    }

    const account = archiveAccount();
    const known = trackedAccounts.some((tracked) => tracked.id === account.id);
    if (!known) {
      accountIsTracked({
        id: account.id,
        platform: account.platform,
        username: account.username,
        lastSyncedAt: account.lastSyncedAt,
      });
    }
    return HttpResponse.json(
      {
        id: account.id,
        platform: account.platform,
        username: account.username,
        syncId: known ? null : scheduleSync(account.id, "connect").id,
      },
      { status: 201 },
    );
  }),

  http.post("/api/accounts/:id/sync", ({ params }) => {
    const outcome = refreshArchive(String(params["id"]));

    if (outcome.status === "not-found") {
      return HttpResponse.json({ error: "account not found" }, { status: 404 });
    }

    if (outcome.status === "too-soon") {
      return HttpResponse.json(
        { error: "synced too recently", retryAfterSeconds: outcome.retryAfterSeconds },
        {
          status: 429,
          headers: { "Retry-After": String(outcome.retryAfterSeconds) },
        },
      );
    }

    return HttpResponse.json(
      { syncId: outcome.job.id, status: outcome.job.status },
      { status: 202 },
    );
  }),

  http.get("/api/syncs/:id", ({ params }) => {
    const job = pollSync(String(params["id"]));
    if (!job) return HttpResponse.json({ error: "sync not found" }, { status: 404 });
    return HttpResponse.json(syncJobBody(job));
  }),

  /** Owner-scoped delete, mirroring the real route: unknown id answers the
   * same 404 a never-tracked one would. */
  http.delete("/api/accounts/:id", ({ params }) => {
    const id = String(params["id"]);
    if (!trackedAccounts.some((account) => account.id === id)) {
      return HttpResponse.json({ error: "account not found" }, { status: 404 });
    }
    trackedAccounts = trackedAccounts.filter((account) => account.id !== id);
    return new HttpResponse(null, { status: 204 });
  }),
];
