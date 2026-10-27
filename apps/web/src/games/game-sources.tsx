import type * as React from "react";

import { ChessComIcon, FileText, LichessIcon } from "@velachess/ui/icons";
import { cn } from "@velachess/ui/lib/utils";

/** Indexing this map with a game's `source` is the drift guard: a value the
 * API grows and this map has not fails to compile at the call site. */
export const GAME_SOURCES = {
  chess_com: { label: "Chess.com", Icon: ChessComIcon, markClassName: "text-chess-com" },
  lichess: { label: "Lichess", Icon: LichessIcon, markClassName: "text-foreground" },
  pgn: { label: "PGN", Icon: FileText, markClassName: "text-muted-foreground" },
} as const;

export type GameSource = keyof typeof GAME_SOURCES;

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
