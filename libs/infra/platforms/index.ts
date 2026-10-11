/**
 * [INGEST] — fetches and normalizes chess games from Chess.com, Lichess,
 * and pasted PGN into one shared shape (`NormalizedGame`). Doesn't persist
 * anything, doesn't validate move legality, doesn't decide who "you" are in
 * a pasted game — see docs/explanation for why.
 */

/**
 * The time-class rule is owned by `@velachess/chess` — it derives from a
 * PGN time-control header and the web reads it too. It is re-exported
 * here, not copied, because `libs/infra/db` builds its filter predicate
 * from these constants and is forbidden from depending on the chess
 * package directly (see `.oxlintrc.json`). One definition, reached
 * through the layer that is allowed to hold it.
 */
export { ESTIMATED_MOVES, TIME_CLASS_CEILINGS, type TimeClass } from "@velachess/chess";

export * from "./schema.ts";
export * from "./normalize.ts";
export * from "./split.ts";
/**
 * `hash.ts` is deliberately NOT re-exported here. It imports
 * `node:crypto`, and a barrel that pulls a Node built-in puts it in the
 * import graph of every consumer of this file — which is why `apps/web`
 * cannot depend on this package at all, and why it ended up re-typing
 * rules that lived here. `movetextHash` stays reachable at
 * `@velachess/infra-platforms/hash` for anything that genuinely needs
 * it; normalization uses it directly.
 */
export * from "./opening.ts";
export * from "./opening-family.ts";
export * from "./providers/chess-com.ts";
export * from "./providers/lichess.ts";
export * from "./providers/pgn.ts";
export * from "./providers/profile.ts";
