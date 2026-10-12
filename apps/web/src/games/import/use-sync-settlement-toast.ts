import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useRef } from "react";

import { toast } from "@velachess/ui/components/toast";

import { onSyncSettled } from "./sync-events.ts";

const SETTLEMENT_COPY = {
  succeeded: msg`Games synced`,
  failed: msg`Couldn't finish syncing`,
} as const;

/** One toast once every watched id settles — success if all did, error if
 * any failed. An unwatched (automatic) sync's settlement stays silent. */
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
