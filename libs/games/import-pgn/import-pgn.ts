/**
 * ImportPgn — a manual upload of PGN text into the user's library.
 *
 * The third source, and the odd one out by design: Chess.com and Lichess
 * are connected accounts with cursors and repeated syncs; a PGN file is
 * an explicit, repeatable paste that creates no account, holds no cursor,
 * and never runs the engine. What it shares with them is everything
 * downstream — rows land in the same games table (ownership direct on
 * the user), and new games feed the same land-new-games pass a refresh
 * runs.
 */
import { importPgn } from "@velachess/infra-platforms";
import type { NormalizedGame } from "@velachess/infra-platforms";

type SaveGames = (
  games: NormalizedGame[],
  userId: string,
) => Promise<{ inserted: number }>;
/**
 * Declared independently from accounts/sync-account's identical-shaped
 * type — expected duplication: the implementation (land-new-games) is
 * singular, but every caller names its own dependency in its own
 * vocabulary.
 */
type LandNewGames = (
  userId: string,
  newGames: number,
) => Promise<{ judged: number; seeded: number }>;

export interface ImportPgnDeps {
  saveGames: SaveGames;
  landNewGames: LandNewGames;
}

export interface ImportPgnInput {
  pgn: string;
  /**
   * Who these games belong to, as named in the headers. Resolved per
   * game, so one file may mix White and Black; games without the name on
   * either side still import, unattributed. Optional — but without it no
   * game is judgeable, so the frontend asks for it.
   */
  playerName?: string | undefined;
}

export interface ImportPgnOutcome {
  /** Games written for this user. */
  imported: number;
  /** Games this user already had — deduplicated as a no-op, not an error. */
  duplicates: number;
  /** Chunks that failed to parse at all. */
  rejected: number;
  judged: number;
  seeded: number;
}

/**
 * Normalize every game in the text, persist what parses, then bring the
 * training pipeline up to date for exactly the rows that landed.
 *
 * Idempotent by constraint, not by prechecking: `(user, account,
 * movetext hash)` makes this user's re-import a no-op while another
 * user importing the very same file keeps their own copy. No engine is
 * ever queued here — analysis has one trigger, opening a game.
 */
export async function importPgnForUser(
  deps: ImportPgnDeps,
  userId: string,
  input: ImportPgnInput,
): Promise<ImportPgnOutcome> {
  const result = importPgn(input.pgn, { playerName: input.playerName });
  const { inserted } = await deps.saveGames(result.games, userId);

  const outcome = await deps.landNewGames(userId, inserted);

  return {
    imported: inserted,
    duplicates: result.games.length - inserted,
    rejected: result.failures.length,
    judged: outcome.judged,
    seeded: outcome.seeded,
  };
}
