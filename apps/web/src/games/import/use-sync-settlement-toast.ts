import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useRef } from "react";

import { toast } from "@velachess/ui/components/toast";

import { onSyncSettled } from "./sync-events.ts";

const SETTLEMENT_COPY = {
  succeeded: msg`Games synced`,
  failed: msg`Couldn't finish syncing`,
} as const;

/**
 * Toasts once, when every sync id a caller handed to `watch` has settled —
 * success if all of them did, error if any failed. Nothing toasts for a
 * sync nobody here asked for (an automatic sync, or one from another tab):
 * those ids never enter `watch`, so their settlement passes through unseen.
 */
export function useSyncSettlementToast() {
  const { i18n } = useLingui();
  const pending = useRef(new Set<string>());
  const sawFailure = useRef(false);

  useEffect(
    () =>
      onSyncSettled(({ syncId, status }) => {
        if (!pending.current.delete(syncId)) return;
        if (status === "failed") sawFailure.current = true;
        if (pending.current.size > 0) return;

        // ponytail: binary outcome only (any failure -> one error toast). A
        // three-way "partial" state is unneeded for this scope, add if asked.
        const failed = sawFailure.current;
        sawFailure.current = false;
        toast.add({
          type: failed ? "error" : "success",
          title: i18n._(failed ? SETTLEMENT_COPY.failed : SETTLEMENT_COPY.succeeded),
        });
      }),
    [i18n],
  );

  return {
    watch: (syncIds: readonly string[]) => {
      syncIds.forEach((id) => pending.current.add(id));
    },
  };
}
