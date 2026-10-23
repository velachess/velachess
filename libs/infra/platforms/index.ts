/**
 * Re-exported from `@velachess/chess`, not copied: `libs/infra/db` builds
 * its filter predicate from these constants and may not depend on the chess
 * package directly (see `.oxlintrc.json`).
 */
export { ESTIMATED_MOVES, TIME_CLASS_CEILINGS, type TimeClass } from "@velachess/chess";

export * from "./schema.ts";
export * from "./normalize.ts";
export * from "./split.ts";
/**
 * `hash.ts` is deliberately not re-exported: it imports `node:crypto`, and
 * a barrel pulling a Node built-in puts it in every consumer's import
 * graph. It stays reachable at `@velachess/infra-platforms/hash`.
 */
export * from "./opening.ts";
export * from "./providers/chess-com.ts";
export * from "./providers/lichess.ts";
export * from "./providers/pgn.ts";
export * from "./providers/profile.ts";
