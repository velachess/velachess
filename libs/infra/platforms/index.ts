/**
 * [INGEST] — fetches and normalizes chess games from Chess.com, Lichess,
 * and pasted PGN into one shared shape (`NormalizedGame`). Doesn't persist
 * anything, doesn't validate move legality, doesn't decide who "you" are in
 * a pasted game — see docs/explanation for why.
 */

export * from "./schema.ts";
export * from "./time-class.ts";
export * from "./normalize.ts";
export * from "./split.ts";
export * from "./hash.ts";
export * from "./opening-family.ts";
export * from "./providers/chess-com.ts";
export * from "./providers/lichess.ts";
export * from "./providers/pgn.ts";
