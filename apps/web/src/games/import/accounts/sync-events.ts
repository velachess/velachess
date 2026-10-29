import { apiBaseUrl, reportUnauthorized } from "../../../api/index.ts";
import { EventSourcePlus } from "../../../libs/event-source.ts";
import type { QueryClientType } from "../../../libs/react-query.ts";
import { gamesQueryKey } from "../../game-query-keys.ts";
import { trackedAccountsQuery } from "./queries.ts";

/**
 * A sync runs in the worker whatever the browser does; this only hears that
 * one settled and lets React Query read the rows again. It carries no
 * meaning of its own: which account settled, and how, is what `GET
 * /accounts` says, so every frame means the same thing and a reconnection
 * repairs its gap with the same refetch.
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
    // Every frame the server sends is a sync that settled; the heartbeat is
    // an SSE comment and never arrives here.
    onMessage: refresh,
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
