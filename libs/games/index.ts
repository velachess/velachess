/**
 * [GAMES] — what this module offers the rest of the system.
 *
 * Root index.ts is the public interface of a vertical/module/capability.
 * It is not a convenience barrel. See AGENTS.md "Modules and slices" for
 * what belongs here versus what stays a private slice file.
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
