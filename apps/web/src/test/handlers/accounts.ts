import { http, HttpResponse } from "msw";

import {
  activeSyncOf,
  archiveAccount,
  knowsPlayer,
  landSync,
  latestSyncOf,
  refreshArchive,
  scheduleSync,
} from "../archive.ts";

interface TrackedAccountRow {
  id: string;
  platform: "chess_com" | "lichess";
  username: string;
  lastSyncedAt: string | null;
  lastSyncError: "not-found" | "incomplete" | "internal" | null;
}

let trackedAccounts: TrackedAccountRow[] = [];

export function accountIsTracked(
  account: Partial<TrackedAccountRow> & { username: string },
): TrackedAccountRow {
  const row: TrackedAccountRow = {
    id: account.id ?? `account-${trackedAccounts.length + 1}`,
    platform: account.platform ?? "chess_com",
    username: account.username,
    lastSyncedAt: account.lastSyncedAt ?? null,
    lastSyncError: account.lastSyncError ?? null,
  };
  trackedAccounts = [...trackedAccounts, row];
  // A failure is a job that failed: the API reads the error off the newest
  // job rather than beside it, so the fake cannot hold one without one.
  if (row.lastSyncError) landSync(scheduleSync(row.id, "manual").id, { fails: true });
  return row;
}

export function resetTrackedAccounts(): void {
  trackedAccounts = [];
}

export const accountsHandlers = [
  http.get("/api/accounts", () =>
    HttpResponse.json(
      trackedAccounts.map((account) => {
        const latest = latestSyncOf(account.id);
        return {
          ...account,
          syncStatus: latest?.status ?? "idle",
          lastSyncError:
            latest?.status === "failed" ? (account.lastSyncError ?? "internal") : null,
        };
      }),
    ),
  ),

  http.post<never, { platform?: string; username?: string }>(
    "/api/accounts",
    async ({ request }) => {
      const body = await request.json();
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
    },
  ),

  /** Mirrors `requestSync`'s idempotency: an active job is reused, a
   * cooling-down or unknown row is left out. */
  http.post("/api/accounts/sync", () => {
    const syncIds = trackedAccounts.flatMap((row) => {
      const active = activeSyncOf(row.id);
      if (active) return [active.id];
      const outcome = refreshArchive(row.id);
      return outcome.status === "accepted" ? [outcome.job.id] : [];
    });
    return HttpResponse.json({ syncIds }, { status: 202 });
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

  http.delete("/api/accounts/:id", ({ params }) => {
    const id = String(params["id"]);
    if (!trackedAccounts.some((account) => account.id === id)) {
      return HttpResponse.json({ error: "account not found" }, { status: 404 });
    }
    trackedAccounts = trackedAccounts.filter((account) => account.id !== id);
    return new HttpResponse(null, { status: 204 });
  }),
];
