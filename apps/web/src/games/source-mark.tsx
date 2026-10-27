import type * as React from "react";

import { cn } from "@velachess/ui/lib/utils";

import { GAME_SOURCES, type GameSource } from "./game-sources.ts";

/** The source's mark in its own colour, decorative: the caller names the
 * source in text beside it. Sized `size-4` unless the caller says otherwise. */
export function SourceMark({
  source,
  className,
  ...props
}: { source: GameSource } & React.SVGProps<SVGSVGElement>) {
  const { Icon, markClassName } = GAME_SOURCES[source];

  return (
    <Icon aria-hidden className={cn("size-4", markClassName, className)} {...props} />
  );
}
