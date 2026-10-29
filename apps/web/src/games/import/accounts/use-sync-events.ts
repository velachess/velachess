import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect } from "react";

import { toast } from "@velachess/ui/components/toast";

import { apiBaseUrl, reportUnauthorized } from "../../../api/index.ts";
import { EventSourcePlus } from "../../../libs/event-source.ts";
import { useQueryClient } from "../../../libs/react-query.ts";
import { gamesQueryKey } from "../../game-query-keys.ts";
import { trackedAccountsQuery } from "./queries.ts";

/**
 * Mirrors `@velachess/accounts`' `SYNC_SETTLED_EVENTS`, which this app cannot
 * import at runtime: its slices pull in Postgres and `node:crypto`.
 * `tests/sync-events.test.ts` holds this copy to the server's.
 */
export const SYNC_SETTLED_EVENTS = {
  completed: "sync.completed",
  failed: "sync.failed",
} as const;

const SETTLEMENT_COPY = {
  succeeded: msg`Games synced`,
  failed: msg`Couldn't finish syncing`,
} as const;

/**
 * The session's one stream, opened by the authenticated layout and closed
 * with it. A sync runs in the worker whatever the browser does; the frame
 * says it settled and how, React Query reads the rows again, and `GET
 * /accounts` remains the authority on what they now say.
 *
 * Transport failures are the client's to retry (exponential backoff, 30 s
 * cap), and every reconnection after the first repairs its gap with the same
 * refetch. Only a 401 means something else — the session ended, and the app
 * already knows what to do about that.
 *
 * A frame nobody was connected for is not replayed, so its toast is lost
 * while the rows it changed are not. Recovering that would need a record of
 * notifications, which is not worth having.
 */
export function useSyncEvents(): void {
  const queryClient = useQueryClient();
  const { i18n } = useLingui();

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: gamesQueryKey });
      void queryClient.invalidateQueries({ queryKey: trackedAccountsQuery.queryKey });
    };

    let streams = 0;
    const source = new EventSourcePlus(`${apiBaseUrl}/syncs/events`);
    const controller = source.listen({
      onMessage: ({ event }) => {
        if (
          event !== SYNC_SETTLED_EVENTS.completed &&
          event !== SYNC_SETTLED_EVENTS.failed
        ) {
          return;
        }
        refresh();

        const failed = event === SYNC_SETTLED_EVENTS.failed;
        // One id, so two accounts settling moments apart leave one toast
        // saying how the last of them went.
        toast.add({
          id: "sync-settled",
          type: failed ? "error" : "success",
          title: i18n._(failed ? SETTLEMENT_COPY.failed : SETTLEMENT_COPY.succeeded),
        });
      },
      // Fires for every response, failures included, so only a stream that
      // opened counts, and only the ones after the first mean a gap.
      onResponse: ({ response }) => {
        const type = response.headers.get("content-type") ?? "";
        if (!response.ok || !type.includes("text/event-stream")) return;
        streams += 1;
        if (streams > 1) refresh();
      },
      onResponseError: ({ response }) => {
        if (response.status !== 401) return;
        controller.abort();
        reportUnauthorized();
      },
    });

    return () => controller.abort();
  }, [queryClient, i18n]);
}
