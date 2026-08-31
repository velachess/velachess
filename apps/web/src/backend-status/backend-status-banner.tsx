import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Alert, AlertTitle } from "@velachess/ui/components/alert";

import { useBackendStatus } from "./backend-status.ts";

const BACKEND_STATUS_COPY = {
  unavailable: msg`Backend unavailable · Retrying automatically`,
} as const;

export function BackendStatusBanner() {
  const { i18n } = useLingui();
  const status = useBackendStatus();

  if (status === "available") return null;

  return (
    <Alert aria-live="polite" className="rounded-none border-x-0 border-t-0">
      <AlertTitle>{i18n._(BACKEND_STATUS_COPY.unavailable)}</AlertTitle>
    </Alert>
  );
}
