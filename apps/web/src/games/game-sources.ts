import { ChessComIcon, FileText, LichessIcon } from "@velachess/ui/icons";

export const GAME_SOURCE_IDS = ["chess_com", "lichess", "pgn"] as const;

export type GameSource = (typeof GAME_SOURCE_IDS)[number];

/** Indexing this map with a game's `source` is the drift guard: a value the
 * API grows and this map has not fails to compile at the call site. */
export const GAME_SOURCES = {
  chess_com: { label: "Chess.com", Icon: ChessComIcon, markClassName: "text-chess-com" },
  lichess: { label: "Lichess", Icon: LichessIcon, markClassName: "text-foreground" },
  pgn: { label: "PGN", Icon: FileText, markClassName: "text-muted-foreground" },
} as const satisfies Record<GameSource, unknown>;
