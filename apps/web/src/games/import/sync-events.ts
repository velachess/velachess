import { apiBaseUrl, reportUnauthorized } from "../../api/index.ts";
import { EventSourcePlus } from "../../libs/event-source.ts";
import type { QueryClientType } from "../../libs/react-query.ts";
import { gamesQueryKey } from "../list/queries.ts";
import { trackedAccountsQuery } from "./queries.ts";

/** Both answer the same question — "the server has new facts about this
 * sync" — and the payload adds nothing a refetch does not already bring. */
const SETTLED_EVENTS = new Set(["sync.completed", "sync.failed"]);

/**
 * The one stream the app keeps on `GET /syncs/events`. A sync runs in the
 * worker whatever the browser does; this only hears when one settles and
 * lets React Query refetch what that changed — the library and the
 * accounts. Nothing here is a record: the server announces what it saw
 * while listening, so every reconnection repairs the gap with the same
 * refetch, and the queries' own staleness covers the rest.
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
      if (SETTLED_EVENTS.has(message.event)) refresh();
    },
    // Fires for every response, failures included: only a stream that
    // actually opened counts, and only the ones after the first mean a
    // gap to repair.
    onResponse: ({ response }) => {
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.includes("text/event-stream")) return;
      streams += 1;
      if (streams > 1) refresh();
    },
    // A 401 is not a transport failure to retry: the session ended. Stop
    // here, and let the app do what it does with that.
    onResponseError: ({ response }) => {
      if (response.status !== 401) return;
      controller.abort();
      reportUnauthorized();
    },
  });
  return () => controller.abort();
}
