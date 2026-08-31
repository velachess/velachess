import { and, desc, eq, exists, inArray, notExists, sql } from "drizzle-orm";

import type { Database } from "../client.ts";
import type { NewDeviation } from "../schema.ts";
import { deviations, exerciseSources, games, repertoires } from "../schema.ts";

/**
 * A narrowed structural subset of games/judge-games's own DeviationResult
 * (see its deviation.ts) — only the fields this file actually reads
 * (`type`, `ply`, `positionKey`, `actualSan`, `expectedMoves[].san`).
 * Declared locally rather than imported: infra must never depend on a
 * business module (no-infra-to-modules), that module's non-wildcard
 * tsconfig path only exposes its index.ts anyway, and this package is
 * further barred from `@velachess/chess` (see .oxlintrc.json), which the
 * real type's `actualMove`/`move` fields would drag in. Duplicate the
 * type, never the implementation.
 */
export interface DeviationEvent {
  type: "deviation" | "gap" | "book-ended";
  ply: number;
  positionKey: string;
  actualSan: string;
  expectedMoves?: { san: string }[] | undefined;
}

export interface DeviationResult {
  inBookPlies: number;
  event: DeviationEvent | null;
}

export interface JudgmentContext {
  gameId: string;
  repertoireId: string;
  chapterId: string;
  repertoireName: string;
  chapterName: string;
  /** replay.moves.length at judgment time. */
  gamePlies?: number;
}

/** Pure mapping, exported for unit testing without a database. */
export function judgmentToRow(
  ctx: JudgmentContext,
  result: DeviationResult,
): NewDeviation {
  const event = result.event;
  return {
    gameId: ctx.gameId,
    repertoireId: ctx.repertoireId,
    chapterId: ctx.chapterId,
    repertoireNameSnapshot: ctx.repertoireName,
    chapterNameSnapshot: ctx.chapterName,
    type: event?.type ?? "completed",
    inBookPlies: result.inBookPlies,
    gamePlies: ctx.gamePlies ?? null,
    ply: event?.ply ?? null,
    positionKey: event?.positionKey ?? null,
    playedSan: event?.actualSan ?? null,
    expectedSans: event?.expectedMoves?.map((m) => m.san) ?? null,
  };
}

/**
 * Persists a findDeviation result. event === null becomes type 'completed'
 * with null event columns. Upsert on (game, repertoire): re-judging
 * replaces, never duplicates.
 */
export async function upsertJudgment(
  db: Database,
  ctx: JudgmentContext,
  result: DeviationResult,
) {
  const row = judgmentToRow(ctx, result);

  const [judgment] = await db
    .insert(deviations)
    .values(row)
    .onConflictDoUpdate({
      target: [deviations.gameId, deviations.repertoireId],
      set: row,
    })
    .returning();

  return judgment!;
}

export interface UnmatchedContext {
  gameId: string;
  repertoireId: string;
  repertoireName: string;
  /** Null when the PGN could not even be replayed. */
  gamePlies?: number | null;
}

/**
 * Persists "no chapter of this repertoire could judge this game" — a
 * different starting universe, an unparseable PGN, or nothing prepared
 * at all. A row, not a skip: an unpersisted skip is rescanned on every
 * judge run and invisible to statistics, and "how many of my games my
 * preparation doesn't even speak to" is one of the statistics.
 */
export async function upsertUnmatchedJudgment(db: Database, ctx: UnmatchedContext) {
  const row: NewDeviation = {
    gameId: ctx.gameId,
    repertoireId: ctx.repertoireId,
    chapterId: null,
    repertoireNameSnapshot: ctx.repertoireName,
    chapterNameSnapshot: null,
    type: "unmatched",
    inBookPlies: 0,
    gamePlies: ctx.gamePlies ?? null,
  };

  const [judgment] = await db
    .insert(deviations)
    .values(row)
    .onConflictDoUpdate({
      target: [deviations.gameId, deviations.repertoireId],
      set: row,
    })
    .returning();

  return judgment!;
}

/**
 * Reopens the judgments a bigger book might answer differently: games
 * where the opponent left first, where preparation ran out, or that
 * nothing matched. Deleting the row is what makes the game "unjudged"
 * again, so the next judge run re-reads it against the enlarged book.
 *
 * 'deviation' and 'completed' rows stay untouched on purpose: a
 * player-left row is evidence a drill may reference (the exercise-source
 * FK cascades off it), and the player's own failure does not stop being
 * one because a chapter was added elsewhere.
 */
export async function reopenNonPlayerJudgments(db: Database, repertoireId: string) {
  return db
    .delete(deviations)
    .where(
      and(
        eq(deviations.repertoireId, repertoireId),
        inArray(deviations.type, ["gap", "book-ended", "unmatched"]),
      ),
    )
    .returning({ id: deviations.id });
}

/**
 * Clears every judgment of a repertoire — the re-extraction path, where
 * the whole candidate book is replaced and judgments against the old one
 * describe chapters that no longer exist. Only ever called for extracted
 * candidates; confirmed preparation refuses extraction before this runs.
 */
export async function clearJudgments(db: Database, repertoireId: string) {
  return db
    .delete(deviations)
    .where(eq(deviations.repertoireId, repertoireId))
    .returning({ id: deviations.id });
}

export async function listJudgmentsByGame(db: Database, gameId: string) {
  return db.select().from(deviations).where(eq(deviations.gameId, gameId));
}

export async function listJudgmentsByRepertoire(db: Database, repertoireId: string) {
  return db.select().from(deviations).where(eq(deviations.repertoireId, repertoireId));
}

/** The deviations module's own read: own deviations with the engine
 * verdict, repertoire attribution (snapshots survive deletion), the game
 * context, and whether an exercise was already seeded from it. Shaped to
 * satisfy libs/deviations' own ListOwnDeviations contract — the slice
 * turns positionKey (an EPD) into a playable FEN, not this query. */
export async function listOwnDeviations(db: Database, userId: string) {
  return db
    .select({
      id: deviations.id,
      gameId: deviations.gameId,
      ply: deviations.ply,
      playedSan: deviations.playedSan,
      expectedSans: deviations.expectedSans,
      positionKey: deviations.positionKey,
      cpLoss: deviations.cpLoss,
      engineCategory: deviations.engineCategory,
      drillable: deviations.drillable,
      repertoireName: deviations.repertoireNameSnapshot,
      chapterName: deviations.chapterNameSnapshot,
      whiteName: games.whiteName,
      blackName: games.blackName,
      result: games.result,
      playedAt: games.playedAt,
      openingName: games.openingName,
      gameUrl: games.externalUrl,
      drilled: sql<boolean>`${exists(
        db
          .select({ one: exerciseSources.deviationId })
          .from(exerciseSources)
          .where(eq(exerciseSources.deviationId, deviations.id)),
      )}`,
    })
    .from(deviations)
    .innerJoin(games, eq(deviations.gameId, games.id))
    .where(and(eq(games.userId, userId), eq(deviations.type, "deviation")))
    .orderBy(desc(games.playedAt));
}

/**
 * The triage worklist: judged deviations with no exercise yet.
 *
 * Not filtered on engine verdict: requiring `engine_category` used to trap
 * deviations from games analysed before their repertoire existed.
 */
export async function listTriageCandidates(db: Database, userId: string) {
  return db
    .select({
      id: deviations.id,
      type: deviations.type,
      positionKey: deviations.positionKey,
      expectedSans: deviations.expectedSans,
    })
    .from(deviations)
    .innerJoin(repertoires, eq(deviations.repertoireId, repertoires.id))
    .where(
      and(
        eq(repertoires.userId, userId),
        notExists(
          db
            .select({ one: exerciseSources.deviationId })
            .from(exerciseSources)
            .where(eq(exerciseSources.deviationId, deviations.id)),
        ),
      ),
    );
}
