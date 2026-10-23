import { apiBaseUrl, reportUnauthorized } from "../../../api/index.ts";
import { EventSourcePlus, type SseMessage } from "../../../libs/event-source.ts";
import type { QueryClientType } from "../../../libs/react-query.ts";
import { z } from "../../../libs/zod.ts";
import { gamesQueryKey } from "../../game-query-keys.ts";
import { trackedAccountsQuery } from "./queries.ts";

/**
 * Mirrors `@velachess/accounts`' `SYNC_SETTLED_EVENTS`, which this app
 * cannot import at runtime: its slices pull in Postgres and `node:crypto`.
 * `tests/sync-events.test.ts` holds the copy to the server's.
 */
export const SYNC_SETTLED_EVENT_NAMES = ["sync.completed", "sync.failed"] as const;
const SETTLED_STATUS_BY_EVENT: Record<
  (typeof SYNC_SETTLED_EVENT_NAMES)[number],
  "succeeded" | "failed"
> = {
  "sync.completed": "succeeded",
  "sync.failed": "failed",
};
const SETTLED_EVENTS: ReadonlySet<string> = new Set(SYNC_SETTLED_EVENT_NAMES);

export interface SettledSync {
  syncId: string;
  accountId: string;
  status: "succeeded" | "failed";
}

const settledListeners = new Set<(settled: SettledSync) => void>();

/** Reuses `startSyncEvents`' one stream. A reconnection's catch-up
 * `refresh()` never reaches this: it has no precise ids. */
export function onSyncSettled(listener: (settled: SettledSync) => void): () => void {
  settledListeners.add(listener);
  return () => settledListeners.delete(listener);
}

const settledPayloadSchema = z.object({ syncId: z.string(), accountId: z.string() });

function isSettledEventName(
  event: SseMessage["event"],
): event is keyof typeof SETTLED_STATUS_BY_EVENT {
  return event in SETTLED_STATUS_BY_EVENT;
}

function parseSettled(message: SseMessage): SettledSync | null {
  if (!isSettledEventName(message.event)) return null;
  try {
    const payload = settledPayloadSchema.parse(JSON.parse(message.data));
    return {
      syncId: payload.syncId,
      accountId: payload.accountId,
      status: SETTLED_STATUS_BY_EVENT[message.event],
    };
  } catch {
    // `refresh()` still brings the data current; there is just nothing
    // precise to tell a watcher.
    return null;
  }
}

/**
 * A sync runs in the worker whatever the browser does; this only hears when
 * one settles and lets React Query refetch what changed. Nothing here is a
 * record: the server announces what it saw while listening, so every
 * reconnection repairs the gap with the same refetch.
 *
 * Returns what stops it. Transport failures are the client's to retry
 * (exponential backoff, 30 s cap); only a 401 means something else — the
 * session ended, and the app already knows what to do about that.
 */
export function startSyncEvents(queryClient: QueryClientType): () => void {
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: gamesQueryKey });
    void queryClient.invalidateQueries({ queryKey: trackedAccountsQuery.queryKey });
  };

  let streams = 0;
  const source = new EventSourcePlus(`${apiBaseUrl}/syncs/events`);
  const controller = source.listen({
    onMessage: (message) => {
      if (!SETTLED_EVENTS.has(message.event)) return;
      refresh();
      const settled = parseSettled(message);
      if (settled) settledListeners.forEach((listener) => listener(settled));
    },
    // Fires for every response, failures included, so only a stream that
    // opened counts, and only the ones after the first mean a gap.
    onResponse: ({ response }) => {
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.includes("text/event-stream")) return;
      streams += 1;
      if (streams > 1) refresh();
    },
    // A 401 is not a transport failure to retry: the session ended.
    onResponseError: ({ response }) => {
      if (response.status !== 401) return;
      controller.abort();
      reportUnauthorized();
    },
  });
  return () => controller.abort();
}
