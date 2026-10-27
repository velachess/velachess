import { ChessComIcon, FileText, LichessIcon } from "@velachess/ui/icons";

/** Indexing this map with a game's `source` is the drift guard: a value the
 * API grows and this map has not fails to compile at the call site. */
export const GAME_SOURCES = {
  chess_com: { label: "Chess.com", Icon: ChessComIcon, markClassName: "text-chess-com" },
  lichess: { label: "Lichess", Icon: LichessIcon, markClassName: "text-foreground" },
  pgn: { label: "PGN", Icon: FileText },
} as const;

export type GameSource = keyof typeof GAME_SOURCES;
