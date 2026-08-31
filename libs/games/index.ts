/**
 * [GAMES] — what this module offers the rest of the system.
 *
 * Root index.ts is the public interface of a vertical/module/capability.
 * It is not a convenience barrel. See AGENTS.md "Modules and slices" for
 * what belongs here versus what stays a private slice file.
 *
 * `landNewGames` is exposed here for two callers: `import-pgn`'s own
 * composition wiring within this module, and `accounts/sync-account` (a
 * genuinely different, not-yet-migrated module) which needs the same
 * tail after a refresh — see land-new-games.ts's doc comment.
 *
 * `backfillOpeningNames` (a one-shot data-backfill script) is deliberately
 * NOT exported here — it has zero current consumers anywhere in the repo,
 * confirmed by grep. Preserved as deferred, unwired functionality; see its
 * own doc comment.
 */

export { getGameForReview } from "./get-game/get-game.ts";
export type { GetGameDeps, SeatIdentity } from "./get-game/get-game.ts";

export { openLibrary } from "./list-games/list-games.ts";
export type { Library, ListGamesDeps } from "./list-games/list-games.ts";

export { importPgnForUser } from "./import-pgn/import-pgn.ts";
export type {
  ImportPgnDeps,
  ImportPgnInput,
  ImportPgnOutcome,
} from "./import-pgn/import-pgn.ts";

export { judgeGamesForUser } from "./judge-games/judge-games.ts";
export type {
  JudgeGamesDeps,
  JudgeOptions,
  JudgeOutcome,
} from "./judge-games/judge-games.ts";

export { landNewGames } from "./land-new-games/land-new-games.ts";
export type {
  LandNewGamesDeps,
  LandNewGamesOutcome,
} from "./land-new-games/land-new-games.ts";
