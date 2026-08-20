import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { Button } from "@velachess/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@velachess/ui/components/empty";

const ROUTE_ERROR_COPY = {
  title: msg`Something went wrong.`,
  description: msg`An unexpected error interrupted this screen.`,
  tryAgain: msg`Try again`,
  reload: msg`Reload`,
} as const;

export function DefaultRouteError({ error, reset }: ErrorComponentProps) {
  const { i18n } = useLingui();
  const detail = runtimeErrorDetail(error);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center p-6">
      <Empty className="border-0">
        <EmptyContent>
          <EmptyTitle>{i18n._(ROUTE_ERROR_COPY.title)}</EmptyTitle>
          <EmptyDescription>{i18n._(ROUTE_ERROR_COPY.description)}</EmptyDescription>
          {detail !== undefined && (
            <p className="text-muted-foreground max-w-sm text-center font-mono text-xs">
              {detail}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={reset}>
              {i18n._(ROUTE_ERROR_COPY.tryAgain)}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
              {i18n._(ROUTE_ERROR_COPY.reload)}
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </main>
  );
}

function runtimeErrorDetail(
  error: unknown,
  showDetails = import.meta.env.DEV,
): string | null {
  if (!showDetails) return null;
  return error instanceof Error ? error.message : String(error);
}
