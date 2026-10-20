/**
 * What a game's source is called, and the mark that stands for it.
 *
 * Shared at the root rather than owned by one domain: `list` puts the mark
 * in the table, `review` puts it in the breadcrumb, `import` builds the
 * connect form on the two a person can connect an account on, and
 * `settings` lists the ones they already did. One name and one icon per
 * source, so no two screens can disagree about what Lichess looks like.
 *
 * Ids are the values the API already speaks and the names are proper
 * nouns, so neither is translated. Indexing this map with a game's
 * `source` is also the drift guard: a value the API grows and this map has
 * not would fail to compile at the call site.
 */
import { ChessComIcon, FileText, LichessIcon } from "@velachess/ui/icons";

export const GAME_SOURCES = {
  chess_com: { label: "Chess.com", Icon: ChessComIcon },
  lichess: { label: "Lichess", Icon: LichessIcon },
  /** Not a provider — a file someone handed us, so the mark says document. */
  pgn: { label: "PGN", Icon: FileText },
} as const;

export type GameSource = keyof typeof GAME_SOURCES;
