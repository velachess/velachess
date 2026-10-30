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
 * Nothing polls alongside this: a stream that dies silently leaves the screen
 * stale until something else refetches, and a frame nobody was connected for
 * loses its toast. Both are accepted — see `docs/explanation/apps/web.md`.
 */
export function useSyncEvents(): void {
  const queryClient = useQueryClient();
  const { i18n } = useLingui();

  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup -- the cleanup is `controller.abort()`, which event-source-plus documents as what stops the stream
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: gamesQueryKey });
      void queryClient.invalidateQueries({ queryKey: trackedAccountsQuery.queryKey });
    };

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
        // One id, so two accounts settling moments apart leave one toast.
        toast.add({
          id: "sync-settled",
          type: failed ? "error" : "success",
          title: i18n._(failed ? SETTLEMENT_COPY.failed : SETTLEMENT_COPY.succeeded),
        });
      },
      // Fires for failures too, so the check is the connection: whatever
      // settled while this client had none is in the rows.
      onResponse: ({ response }) => {
        if (
          response.ok &&
          response.headers.get("content-type")?.includes("text/event-stream")
        ) {
          refresh();
        }
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
