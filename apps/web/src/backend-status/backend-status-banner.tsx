import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useId } from "react";

import { Alert, AlertDescription, AlertTitle } from "@velachess/ui/components/alert";
import { OctagonXIcon } from "@velachess/ui/icons";

import { useBackendStatus } from "./backend-status.ts";

const BACKEND_STATUS_COPY = {
  title: msg`Backend unavailable`,
  description: msg`Unable to connect to VelaChess. Reload the page to try again.`,
} as const;

export function BackendStatusBanner() {
  const { i18n } = useLingui();
  const titleId = useId();
  const status = useBackendStatus();

  if (status === "available") return null;

  return (
    <Alert
      variant="destructive"
      aria-labelledby={titleId}
      aria-live="polite"
      className="rounded-none border-x-0 border-t-0"
    >
      <OctagonXIcon aria-hidden="true" />
      <AlertTitle id={titleId}>{i18n._(BACKEND_STATUS_COPY.title)}</AlertTitle>
      <AlertDescription>{i18n._(BACKEND_STATUS_COPY.description)}</AlertDescription>
    </Alert>
  );
}
