import type { MessageDescriptor } from "@lingui/core";
import { useMatches } from "@tanstack/react-router";

export interface BreadcrumbCrumb {
  label: MessageDescriptor;
  fullPath: string;
  params: Record<string, string>;
}

export function useBreadcrumbTrail(): BreadcrumbCrumb[] {
  const matches = useMatches();
  const currentFullPath = matches[matches.length - 1]?.fullPath;

  return matches.flatMap((match) =>
    match.staticData.crumb && match.fullPath !== currentFullPath
      ? [
          {
            label: match.staticData.crumb,
            fullPath: match.fullPath,
            params: match.params,
          },
        ]
      : [],
  );
}
