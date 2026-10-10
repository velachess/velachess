/**
 * ImportPgn — a manual upload of PGN text into the user's library.
 *
 * The third source, and the odd one out by design: Chess.com and Lichess
 * are connected accounts with cursors and repeated syncs; a PGN file is
 * an explicit, repeatable paste that creates no account, holds no cursor,
 * and never runs the engine. Rows land in the same games table, with
 * ownership direct on the user.
 */
import { importPgn } from "@velachess/infra-platforms";
import type { NormalizedGame } from "@velachess/infra-platforms";

type SaveGames = (
  games: NormalizedGame[],
  userId: string,
) => Promise<{ inserted: number }>;

export interface ImportPgnDeps {
  saveGames: SaveGames;
}

export interface ImportPgnInput {
  pgn: string;
  /**
   * Who these games belong to, as named in the headers. Resolved per
   * game, so one file may mix White and Black; games without the name on
   * either side still import, unattributed.
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
}

/**
 * Normalize every game in the text and persist what parses.
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

  return {
    imported: inserted,
    duplicates: result.games.length - inserted,
    rejected: result.failures.length,
  };
}
