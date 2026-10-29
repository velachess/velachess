import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useRef } from "react";

import { toast } from "@velachess/ui/components/toast";

import { useQuery, useQueryClient } from "../../../libs/react-query.ts";
import { gamesQueryKey } from "../../game-query-keys.ts";
import { isSyncActive, trackedAccountsQuery, type TrackedAccount } from "./queries.ts";

const SETTLEMENT_COPY = {
  succeeded: msg`Games synced`,
  failed: msg`Couldn't finish syncing`,
} as const;

/** Often enough to read as prompt, seldom enough that a long sync costs
 * little. The stream usually gets there first; this is what covers a
 * notification that never arrived. */
const SYNC_POLL_MS = 3_000;

/**
 * Mounted once, by the authenticated layout, never by a screen:
 * `refetchInterval` belongs to an observer rather than to a query key, so a
 * hook per screen would be a timer per screen and a toast per copy.
 *
 * Per account, not "was anything syncing": an account that failed last week
 * still reads `failed`, so asking whether any account carries an error would
 * report a successful sync as a failure.
 *
 * A sync that starts and settles with nothing mounted goes unannounced — the
 * status says what happened, not when, so no transition is left to notice.
 */
export function useSyncSettlement(): void {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const accounts = useQuery({
    ...trackedAccountsQuery,
    refetchInterval: (query) =>
      query.state.data?.some((account) => isSyncActive(account.syncStatus))
        ? SYNC_POLL_MS
        : false,
  }).data;
  const lastSeen = useRef(new Map<string, TrackedAccount["syncStatus"]>());

  useEffect(() => {
    if (!accounts) return;

    const settled = accounts.filter(
      (account) =>
        isSyncActive(lastSeen.current.get(account.id)) &&
        !isSyncActive(account.syncStatus),
    );
    // Rebuilt rather than updated, so a disconnected account drops out.
    lastSeen.current = new Map(
      accounts.map((account) => [account.id, account.syncStatus]),
    );
    if (settled.length === 0) return;

    void queryClient.invalidateQueries({ queryKey: gamesQueryKey });
    const failed = settled.some((account) => account.syncStatus === "failed");
    // One id, so two accounts finishing moments apart leave one toast
    // saying how the last of them went, not a stack of them.
    toast.add({
      id: "sync-settled",
      type: failed ? "error" : "success",
      title: i18n._(failed ? SETTLEMENT_COPY.failed : SETTLEMENT_COPY.succeeded),
    });
  }, [accounts, i18n, queryClient]);
}
