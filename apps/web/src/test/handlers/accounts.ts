import { http, HttpResponse } from "msw";

import { archiveAccount, knowsPlayer, refreshArchive } from "../archive.ts";

type QueueState = "queued" | "active" | "failed" | "none";

interface TrackedAccountRow {
  id: string;
  platform: "chess_com" | "lichess";
  username: string;
  lastSyncedAt: string | null;
  syncState: QueueState;
}

/** What the server says this user tracks. The dashboard reads it to tell
 * "never started" from "connected and empty" — the two states that used
 * to render identically as four zeroes. */
let trackedAccounts: TrackedAccountRow[] = [];

export function accountIsTracked(
  account: Partial<TrackedAccountRow> & { username: string },
): void {
  trackedAccounts = [
    ...trackedAccounts,
    {
      id: account.id ?? `account-${trackedAccounts.length + 1}`,
      platform: account.platform ?? "chess_com",
      username: account.username,
      lastSyncedAt: account.lastSyncedAt ?? null,
      syncState: account.syncState ?? "none",
    },
  ];
}

export function resetTrackedAccounts(): void {
  trackedAccounts = [];
}

/** Sync contract incl. non-failure answers; 429 sends both a `Retry-After` header and the body field, per the status code contract. */
export const accountsHandlers = [
  http.get("/api/accounts", () => HttpResponse.json(trackedAccounts)),

  /** Connecting a handle is the only way to create one; 404 when the platform doesn't have it, matching the real route. */
  http.post("/api/accounts", async ({ request }) => {
    const body = (await request.json()) as { platform?: string; username?: string };
    if (!body.platform || !body.username) {
      return HttpResponse.json({ error: "invalid body" }, { status: 400 });
    }

    if (!knowsPlayer(body.platform, body.username)) {
      return HttpResponse.json({ error: "archive not found" }, { status: 404 });
    }

    const account = archiveAccount();
    if (!trackedAccounts.some((tracked) => tracked.id === account.id)) {
      accountIsTracked({
        id: account.id,
        platform: account.platform,
        username: account.username,
        lastSyncedAt: account.lastSyncedAt,
      });
    }
    return HttpResponse.json(
      { id: account.id, platform: account.platform, username: account.username },
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

    return HttpResponse.json({ saved: outcome.saved, judged: 0, seeded: 0 });
  }),
];
