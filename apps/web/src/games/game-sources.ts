/**
 * Shared at the root rather than owned by one domain, so no two screens can
 * disagree about what Lichess looks like.
 *
 * Ids are the values the API speaks and the names are proper nouns, so
 * neither is translated. Indexing this map with a game's `source` is the
 * drift guard: a value the API grows and this map has not fails to compile
 * at the call site.
 */
import { ChessComIcon, FileText, LichessIcon } from "@velachess/ui/icons";

export const GAME_SOURCES = {
  chess_com: { label: "Chess.com", Icon: ChessComIcon },
  lichess: { label: "Lichess", Icon: LichessIcon },
  /** Not a provider, so the mark says document. */
  pgn: { label: "PGN", Icon: FileText },
} as const;

export type GameSource = keyof typeof GAME_SOURCES;
