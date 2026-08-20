/**
 * Other half of the triage worklist: engine-judged blunders from the whole
 * game (its sibling `listTriageCandidates` only reaches the opening).
 * Graded plies live as `jsonb` on `game_analyses`, not rows, so filtering
 * happens in the caller — fine per-game, would hurt on a full-history sweep.
 */

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import type { Database } from "../client.ts";
import {
  exerciseSources,
  gameAnalyses,
  games,
  trackedAccounts,
  type StoredGradedPly,
} from "../schema.ts";

export interface EngineDrillCandidate {
  gameId: string;
  /** Which side the user played — a blunder by the opponent is not
   * something to practise. Null when it cannot be determined. */
  perspective: "white" | "black" | null;
  plies: StoredGradedPly[];
  /** Plies of this game that already became an exercise, so the caller
   * does not seed them twice. */
  alreadySeeded: ReadonlySet<number>;
}

/**
 * Analyses of the user's games, with already-seeded plies marked.
 * Deliberately skips the drill rule (severity/budget/ordering) — that's
 * `selectDrillCandidates` in `packages/drill`, pure and DB-free. Fetch only.
 */
export async function listEngineDrillCandidates(
  db: Database,
  userId: string,
  opts: { gameId?: string } = {},
): Promise<EngineDrillCandidate[]> {
  const rows = await db
    .select({
      gameId: gameAnalyses.gameId,
      positions: gameAnalyses.positions,
      perspective: games.perspective,
      whiteName: games.whiteName,
      blackName: games.blackName,
      accountUsername: trackedAccounts.username,
    })
    .from(gameAnalyses)
    .innerJoin(games, eq(gameAnalyses.gameId, games.id))
    // Inner join, not left: a game with no tracked account has no "you",
    // and there is nobody to attribute the mistake to.
    .innerJoin(trackedAccounts, eq(games.accountId, trackedAccounts.id))
    .where(
      and(
        eq(trackedAccounts.userId, userId),
        opts.gameId ? eq(gameAnalyses.gameId, opts.gameId) : undefined,
      ),
    );

  if (rows.length === 0) return [];

  const seeded = await seededPliesByGame(
    db,
    rows.map((row) => row.gameId),
  );

  return rows.map((row) => ({
    gameId: row.gameId,
    perspective: sideOfUser(row),
    plies: row.positions,
    alreadySeeded: seeded.get(row.gameId) ?? new Set(),
  }));
}

/**
 * Which plies of these games are already drilled, as a set per game.
 *
 * One query for all of them rather than one per game: the caller is a
 * worker running after every analysis, and a per-game round trip there
 * turns a batch into a stampede.
 */
async function seededPliesByGame(
  db: Database,
  gameIds: string[],
): Promise<Map<string, Set<number>>> {
  const rows = await db
    .select({ gameId: exerciseSources.gameId, ply: exerciseSources.ply })
    .from(exerciseSources)
    .where(and(inArray(exerciseSources.gameId, gameIds), isNotNull(exerciseSources.ply)));

  const byGame = new Map<string, Set<number>>();
  for (const row of rows) {
    if (!row.gameId || row.ply === null) continue;
    const plies = byGame.get(row.gameId) ?? new Set<number>();
    plies.add(row.ply);
    byGame.set(row.gameId, plies);
  }
  return byGame;
}

/**
 * Stored perspective wins; otherwise the tracked username decides. Same
 * rule as `resolveGamePerspective` in application, restated rather than
 * imported — importing it would invert the persistence/application
 * dependency the architecture tests protect. Acceptance test pins both.
 */
function sideOfUser(row: {
  perspective: string | null;
  whiteName: string;
  blackName: string;
  accountUsername: string;
}): "white" | "black" | null {
  if (row.perspective === "white" || row.perspective === "black") {
    return row.perspective;
  }
  const username = row.accountUsername.toLowerCase();
  if (row.whiteName.toLowerCase() === username) return "white";
  if (row.blackName.toLowerCase() === username) return "black";
  return null;
}

/**
 * Who a game belongs to, for callers holding only a game id.
 *
 * Null when the game has no tracked account — a pasted PGN nobody
 * claimed. Nothing downstream can be attributed to a person then.
 */
export async function userIdForGame(
  db: Database,
  gameId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ userId: trackedAccounts.userId })
    .from(games)
    .innerJoin(trackedAccounts, eq(games.accountId, trackedAccounts.id))
    .where(eq(games.id, gameId))
    .limit(1);

  return row?.userId ?? null;
}
