/**
 * ImportPgn — a manual upload of PGN text into the user's library.
 *
 * The third source, and the odd one out by design: Chess.com and Lichess
 * are connected accounts with cursors and repeated syncs; a PGN file is
 * an explicit, repeatable paste that creates no account, holds no cursor,
 * and never runs the engine. What it shares with them is everything
 * downstream — rows land in the same games table (ownership direct on
 * the user), and new games feed the same extract → judge → seed pass a
 * refresh runs.
 */
import { importPgn } from "@velachess/platforms";
import type { Database } from "@velachess/db";
import { saveGames } from "@velachess/db";
import type { AnalysisQueue } from "@velachess/queue/ports";

import { ensureCandidateRepertoires } from "../../repertoires/extract-repertoire/extract-repertoire.ts";
import { judgeGamesForUser } from "../judge-games/judge-games.ts";
import { triageAndSeed } from "../../drills/seed-exercises/seed-exercises.ts";

/** A single request body is not an archive: ~2MB of PGN is thousands of
 * games, far past anything one paste should carry. */
export const MAX_PGN_LENGTH = 2_000_000;

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
  db: Database,
  userId: string,
  queue: AnalysisQueue,
  input: ImportPgnInput,
): Promise<ImportPgnOutcome> {
  const result = importPgn(input.pgn, { playerName: input.playerName });
  const { inserted } = await saveGames(db, result.games, { userId });

  let judged = 0;
  let seeded = 0;
  if (inserted > 0) {
    // Same tail as a sync: derived repertoires grow first so the fresh
    // book judges this pass, judging replays against it, seeding reads
    // the judgments. All replay — nothing here costs Stockfish.
    await ensureCandidateRepertoires(db, userId, { newGames: inserted });
    const outcome = await judgeGamesForUser(db, userId, queue);
    const triaged = await triageAndSeed(db, userId);
    judged = outcome.judged;
    seeded = triaged.seeded;
  }

  return {
    imported: inserted,
    duplicates: result.games.length - inserted,
    rejected: result.failures.length,
    judged,
    seeded,
  };
}
