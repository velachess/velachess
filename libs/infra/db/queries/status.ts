import {
  ESTIMATED_MOVES,
  TIME_CLASS_CEILINGS,
  type TimeClass,
} from "@velachess/platforms";
import { and, count, desc, eq, isNotNull, notExists, sql, type SQL } from "drizzle-orm";

import type { Database } from "../client.ts";
import { withPagination, type Paginated } from "./pagination.ts";
import { deviations, gameAnalyses, games, trackedAccounts } from "../schema.ts";

/** What the games screen filters by. Every field is optional: absent means
 * "don't narrow on this", which is what an untouched filter should do. */
export interface GameFilters {
  /** Which side you played. */
  color?: "white" | "black" | undefined;
  /** From your side of the board, not the scoresheet's. */
  outcome?: "win" | "loss" | "draw" | undefined;
  /** The verdict the repertoire reached — `unjudged` means no book saw it. */
  verdict?: "deviation" | "gap" | "book-ended" | "completed" | "unjudged" | undefined;
  timeClass?: TimeClass | undefined;
}

export interface GamePage {
  page: number;
  pageSize: number;
}

/** The username is not decoration: it is how "you" is resolved. */
export interface GameAccount {
  id: string;
  username: string;
}

/**
 * Which side was you. `games.perspective` is null for synced games (the
 * normalizer sees a PGN, not an identity), so this derives it by matching
 * the tracked username against player names — same rule as
 * `resolveGamePerspective` — instead of backfilling a column.
 */
const perspectiveSql = (username: string) => sql<"white" | "black" | null>`coalesce(
  ${games.perspective}::text,
  case
    when lower(${games.whiteName}) = lower(${username}) then 'white'
    when lower(${games.blackName}) = lower(${username}) then 'black'
  end
)`;

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
 * that is a win depends on which side you were, so the two columns have to
 * be read together.
 */
function outcomePredicate(
  outcome: NonNullable<GameFilters["outcome"]>,
  perspective: SQL,
): SQL {
  if (outcome === "draw") return sql`${games.result} = '1/2-1/2'`;

  const yourResult = outcome === "win" ? "1-0" : "0-1";
  const theirResult = outcome === "win" ? "0-1" : "1-0";
  return sql`((${perspective}) = 'white' and ${games.result} = ${yourResult})
    or ((${perspective}) = 'black' and ${games.result} = ${theirResult})`;
}

function gameFilterConditions(account: GameAccount, filters: GameFilters): SQL[] {
  const perspective = perspectiveSql(account.username);
  const conditions: SQL[] = [eq(games.accountId, account.id)];

  if (filters.color) conditions.push(sql`(${perspective}) = ${filters.color}`);
  if (filters.outcome) conditions.push(outcomePredicate(filters.outcome, perspective));
  if (filters.timeClass) conditions.push(timeClassPredicate(filters.timeClass));

  if (filters.verdict === "unjudged") {
    conditions.push(
      sql`not exists (select 1 from ${deviations} where ${deviations.gameId} = ${games.id})`,
    );
  } else if (filters.verdict) {
    conditions.push(
      sql`exists (select 1 from ${deviations} where ${deviations.gameId} = ${games.id} and ${deviations.type} = ${filters.verdict})`,
    );
  }

  return conditions;
}

/**
 * One page of games, filtered, with everything the list renders. The
 * DISTINCT ON picking a game's most actionable judgment lives in a
 * subquery, not the outer select — on top it would pin the sort and
 * block ordering by date. Verdict filtering is a separate EXISTS since
 * an equality on the surfaced row would drop games judged by another
 * repertoire.
 */
export async function listGamesPage(
  db: Database,
  account: GameAccount,
  filters: GameFilters = {},
  { page, pageSize }: GamePage = { page: 1, pageSize: 25 },
) {
  const where = and(...gameFilterConditions(account, filters))!;
  const perspective = perspectiveSql(account.username);

  const judgment = db
    .selectDistinctOn([deviations.gameId], {
      gameId: deviations.gameId,
      repertoireName: deviations.repertoireNameSnapshot,
      type: deviations.type,
      ply: deviations.ply,
    })
    .from(deviations)
    .orderBy(
      deviations.gameId,
      sql`case when ${deviations.type} = 'deviation' then 0 else 1 end`,
      desc(deviations.createdAt),
    )
    .as("judgment");

  const page$ = db
    .select({
      id: games.id,
      whiteName: games.whiteName,
      whiteRating: games.whiteRating,
      blackName: games.blackName,
      blackRating: games.blackRating,
      result: games.result,
      playedAt: games.playedAt,
      perspective,
      source: games.source,
      externalUrl: games.externalUrl,
      timeControlInitialSeconds: games.timeControlInitialSeconds,
      timeControlIncrementSeconds: games.timeControlIncrementSeconds,
      openingName: games.openingName,
      repertoireName: judgment.repertoireName,
      judgmentType: judgment.type,
      judgmentPly: judgment.ply,
      analyzed: isNotNull(gameAnalyses.id),
    })
    .from(games)
    .leftJoin(judgment, eq(judgment.gameId, games.id))
    .leftJoin(gameAnalyses, eq(gameAnalyses.gameId, games.id))
    .where(where)
    .$dynamic();

  // Newest first, id as the tiebreak: `played_at` is nullable and repeats
  // within a minute, and a partial order lets a row show up on two pages.
  const [rows, [totals]] = await Promise.all([
    withPagination(
      page$,
      sql`${games.playedAt} desc nulls last, ${games.id} desc`,
      page,
      pageSize,
    ),
    db.select({ total: count() }).from(games).where(where),
  ]);

  return { rows, total: totals?.total ?? 0, page, pageSize } satisfies Paginated<
    (typeof rows)[number]
  >;
}

export type GameRow = Awaited<ReturnType<typeof listGamesPage>>["rows"][number];

/** Games of the user's accounts not yet judged BY THIS repertoire —
 * judgments accumulate per (game, repertoire), so a new repertoire (e.g.
 * a fresh extraction) reaches games older repertoires already judged.
 * Carries player names + the account username so the caller can derive
 * perspective when the game doesn't store one (synced games don't — the
 * normalizer can't know who "you" are; the tracked account can). */
export async function listUnjudgedGames(
  db: Database,
  userId: string,
  repertoireId: string,
) {
  return db
    .select({
      id: games.id,
      rawPgn: games.rawPgn,
      perspective: games.perspective,
      whiteName: games.whiteName,
      blackName: games.blackName,
      accountUsername: trackedAccounts.username,
    })
    .from(games)
    .innerJoin(trackedAccounts, eq(games.accountId, trackedAccounts.id))
    .where(
      and(
        eq(trackedAccounts.userId, userId),
        notExists(
          db
            .select({ one: deviations.id })
            .from(deviations)
            .where(
              and(
                eq(deviations.gameId, games.id),
                eq(deviations.repertoireId, repertoireId),
              ),
            ),
        ),
      ),
    );
}

/** Everything extraction needs in one read: mainline source (rawPgn),
 * perspective derivation inputs, and the opening-name sources (chess.com
 * hides the name in the ECOUrl slug — both columns travel). */
export async function listGamesForExtraction(db: Database, userId: string) {
  return db
    .select({
      id: games.id,
      rawPgn: games.rawPgn,
      perspective: games.perspective,
      whiteName: games.whiteName,
      blackName: games.blackName,
      accountUsername: trackedAccounts.username,
      openingName: games.openingName,
      openingUrl: games.openingUrl,
    })
    .from(games)
    .innerJoin(trackedAccounts, eq(games.accountId, trackedAccounts.id))
    .where(eq(trackedAccounts.userId, userId));
}
