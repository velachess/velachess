/**
 * The odd source out: a repeatable paste that creates no account, holds no
 * cursor and never runs the engine. Rows land in the same games table, with
 * ownership direct on the user.
 */
import { importPgn } from "@velachess/infra-platforms";
import type { NormalizedGame, Participation } from "@velachess/infra-platforms";

type SaveGames = (
  games: NormalizedGame[],
  userId: string,
) => Promise<{ inserted: number }>;

export interface ImportPgnDeps {
  saveGames: SaveGames;
}

export interface ImportPgnInput {
  pgn: string;
  /** Absent means every game imports unattributed. */
  participation?: Participation | undefined;
}

export interface ImportPgnOutcome {
  imported: number;
  /** Already held by this user: a no-op, not an error. */
  duplicates: number;
  rejected: number;
}

/**
 * Idempotent by constraint rather than by prechecking: `(user, account,
 * movetext hash)` makes a re-import a no-op while another user importing
 * the same file keeps their own copy.
 */
export async function importPgnForUser(
  deps: ImportPgnDeps,
  userId: string,
  input: ImportPgnInput,
): Promise<ImportPgnOutcome> {
  const result = importPgn(input.pgn, { participation: input.participation });
  const { inserted } = await deps.saveGames(result.games, userId);

  return {
    imported: inserted,
    duplicates: result.games.length - inserted,
    rejected: result.failures.length,
  };
}
