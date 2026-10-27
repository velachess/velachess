import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useId } from "react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@velachess/ui/components/alert";
import { Button } from "@velachess/ui/components/button";
import { Spinner } from "@velachess/ui/components/spinner";
import { OctagonXIcon } from "@velachess/ui/icons";

import { useMutation, useQueryClient } from "../libs/react-query.ts";
import { retryUnavailableBackend, useBackendStatus } from "./backend-status.ts";

const BACKEND_STATUS_COPY = {
  title: msg`Backend unavailable`,
  description: msg`Unable to connect to VelaChess. Please try again.`,
  tryAgain: msg`Try again`,
} as const;

export function BackendStatusBanner() {
  const { i18n } = useLingui();
  const titleId = useId();
  const status = useBackendStatus();
  const queryClient = useQueryClient();

  const retry = useMutation({
    mutationFn: () =>
      retryUnavailableBackend(() =>
        queryClient.refetchQueries({
          type: "active",
          // Engine work runs on this device and never raised the outage;
          // refetching it would restart an analysis.
          predicate: (query) => query.meta?.["engine"] !== true,
        }),
      ),
  });

  if (status === "available") return null;

  return (
    <Alert
      variant="destructive"
      aria-labelledby={titleId}
      className="rounded-none border-x-0 border-t-0"
    >
      <OctagonXIcon aria-hidden="true" />
      <AlertTitle id={titleId}>{i18n._(BACKEND_STATUS_COPY.title)}</AlertTitle>
      <AlertDescription>{i18n._(BACKEND_STATUS_COPY.description)}</AlertDescription>
      <AlertAction>
        <Button
          variant="outline"
          size="sm"
          disabled={retry.isPending}
          onClick={() => retry.mutate()}
        >
          {retry.isPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
          {i18n._(BACKEND_STATUS_COPY.tryAgain)}
        </Button>
      </AlertAction>
    </Alert>
  );
}
