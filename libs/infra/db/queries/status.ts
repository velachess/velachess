import {
  ESTIMATED_MOVES,
  TIME_CLASS_CEILINGS,
  type TimeClass,
} from "@velachess/infra-platforms";
import { and, count, eq, sql, type SQL } from "drizzle-orm";

import type { Database } from "../client.ts";
import { withPagination, type Paginated } from "./pagination.ts";
import { perspectiveSql } from "./perspective.ts";
import { games, trackedAccounts } from "../schema.ts";

/** Absent means "do not narrow on this". */
export interface GameFilters {
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
 * Arithmetic on the stored columns rather than a stored class, so re-tuning
 * the boundaries never needs a backfill.
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
 * `gameOutcomeFor` in `@velachess/chess`, which no predicate can call from
 * inside Postgres; the route tests in
 * `apps/server/tests/library-filters.test.ts` hold the two together.
 *
 * The disjunction is parenthesized because AND binds tighter than OR, and
 * an unscoped branch would match other users' rows once combined with the
 * ownership condition.
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
 * Synced accounts and pasted PGNs together. The account join is provenance
 * only: it feeds perspective derivation and must not drop the rows with no
 * account.
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
    })
    .from(games)
    // Provenance, not ownership: a PGN row has no account and must survive
    // the read.
    .leftJoin(trackedAccounts, eq(games.accountId, trackedAccounts.id))
    .where(where)
    .$dynamic();

  // id as the tiebreak: `played_at` is nullable and repeats within a minute,
  // and a partial order lets a row show up on two pages. The count shares
  // the page's joins because the filters speak the same perspective rule.
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
