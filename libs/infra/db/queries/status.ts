import {
  ESTIMATED_MOVES,
  TIME_CLASS_CEILINGS,
  type TimeClass,
} from "@velachess/infra-platforms";
import { and, count, eq, isNotNull, sql, type SQL } from "drizzle-orm";

import type { Database } from "../client.ts";
import { withPagination, type Paginated } from "./pagination.ts";
import { perspectiveSql } from "./perspective.ts";
import { gameAnalyses, games, trackedAccounts } from "../schema.ts";

/** What the games screen filters by. Every field is optional: absent means
 * "don't narrow on this", which is what an untouched filter should do. */
export interface GameFilters {
  /** Which side you played. */
  color?: "white" | "black" | undefined;
  /** From your side of the board, not the scoresheet's. */
  outcome?: "win" | "loss" | "draw" | undefined;
  timeClass?: TimeClass | undefined;
}

export interface GamePage {
  page: number;
  pageSize: number;
}

/**
 * Estimated duration in SQL, from the same rule the app uses. Written as
 * arithmetic on the stored columns rather than a stored class, so
 * re-tuning the boundaries never needs a backfill.
 */
const estimatedSecondsSql = sql`(${games.timeControlInitialSeconds} + ${ESTIMATED_MOVES} * coalesce(${games.timeControlIncrementSeconds}, 0))`;

function timeClassPredicate(timeClass: TimeClass): SQL {
  switch (timeClass) {
    case "bullet":
      return sql`${estimatedSecondsSql} < ${TIME_CLASS_CEILINGS.bullet}`;
    case "blitz":
      return sql`${estimatedSecondsSql} >= ${TIME_CLASS_CEILINGS.bullet} and ${estimatedSecondsSql} < ${TIME_CLASS_CEILINGS.blitz}`;
    case "rapid":
      return sql`${estimatedSecondsSql} >= ${TIME_CLASS_CEILINGS.blitz} and ${estimatedSecondsSql} < ${TIME_CLASS_CEILINGS.rapid}`;
    case "classical":
      return sql`${estimatedSecondsSql} >= ${TIME_CLASS_CEILINGS.rapid}`;
  }
}

/**
 * Won, lost or drew — from your seat. The scoresheet says "1-0"; whether
 * that is a win depends on which side you were, so the two columns have
 * to be read together. The whole disjunction is parenthesized: AND binds
 * tighter than OR, and an unscoped branch here would match other users'
 * rows once combined with the ownership condition.
 */
function outcomePredicate(
  outcome: NonNullable<GameFilters["outcome"]>,
  perspective: SQL,
): SQL {
  if (outcome === "draw") return sql`(${games.result} = '1/2-1/2')`;

  const yourResult = outcome === "win" ? "1-0" : "0-1";
  const theirResult = outcome === "win" ? "0-1" : "1-0";
  return sql`(((${perspective}) = 'white' and ${games.result} = ${yourResult})
    or ((${perspective}) = 'black' and ${games.result} = ${theirResult}))`;
}

function gameFilterConditions(userId: string, filters: GameFilters): SQL[] {
  const conditions: SQL[] = [eq(games.userId, userId)];

  if (filters.color) conditions.push(sql`(${perspectiveSql}) = ${filters.color}`);
  if (filters.outcome) {
    conditions.push(outcomePredicate(filters.outcome, perspectiveSql));
  }
  if (filters.timeClass) conditions.push(timeClassPredicate(filters.timeClass));

  return conditions;
}

/**
 * One page of the user's unified library — synced accounts and manually
 * imported PGNs together, filtered, with everything the list renders.
 * The account join is provenance only: it feeds perspective derivation
 * for games that have one and must not drop the ones that don't.
 */
export async function listGamesPage(
  db: Database,
  userId: string,
  filters: GameFilters = {},
  { page, pageSize }: GamePage = { page: 1, pageSize: 25 },
) {
  const where = and(...gameFilterConditions(userId, filters))!;

  const page$ = db
    .select({
      id: games.id,
      whiteName: games.whiteName,
      whiteRating: games.whiteRating,
      blackName: games.blackName,
      blackRating: games.blackRating,
      result: games.result,
      playedAt: games.playedAt,
      perspective: perspectiveSql,
      source: games.source,
      externalUrl: games.externalUrl,
      timeControlInitialSeconds: games.timeControlInitialSeconds,
      timeControlIncrementSeconds: games.timeControlIncrementSeconds,
      openingName: games.openingName,
      analyzed: isNotNull(gameAnalyses.id),
    })
    .from(games)
    // Provenance, not ownership — perspective derivation input for the
    // synced rows; a PGN row has none and must survive the read.
    .leftJoin(trackedAccounts, eq(games.accountId, trackedAccounts.id))
    .leftJoin(gameAnalyses, eq(gameAnalyses.gameId, games.id))
    .where(where)
    .$dynamic();

  // Newest first, id as the tiebreak: `played_at` is nullable and repeats
  // within a minute, and a partial order lets a row show up on two pages.
  // The count shares the page's joins — the filters speak the same
  // perspective rule, which references the provenance account.
  const [rows, [totals]] = await Promise.all([
    withPagination(
      page$,
      sql`${games.playedAt} desc nulls last, ${games.id} desc`,
      page,
      pageSize,
    ),
    db
      .select({ total: count() })
      .from(games)
      .leftJoin(trackedAccounts, eq(games.accountId, trackedAccounts.id))
      .where(where),
  ]);

  return { rows, total: totals?.total ?? 0, page, pageSize } satisfies Paginated<
    (typeof rows)[number]
  >;
}

export type GameRow = Awaited<ReturnType<typeof listGamesPage>>["rows"][number];
