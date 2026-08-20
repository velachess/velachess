/**
 * Training counts per chapter, in one read — the chapter list renders a
 * due badge per row, and asking `countDrillQueue` once per chapter would
 * be three queries times the chapter count.
 *
 * Counts distinct exercises, not source rows: an exercise reached from
 * one chapter through both a line and a deviation is one thing to
 * train, and the row would double it.
 */

import { and, countDistinct, eq, isNull, lte, or, sql } from "drizzle-orm";

import type { Database } from "../client.ts";
import {
  cards,
  deviations,
  exercises,
  exerciseSources,
  repertoireChapters,
} from "../schema.ts";

export interface ChapterTrainingCounts {
  chapterId: string;
  /** Scheduled and past due. */
  due: number;
  /** Seeded but never scheduled. */
  fresh: number;
}

export async function countTrainingByChapter(
  db: Database,
  userId: string,
  repertoireId: string,
  now: Date = new Date(),
): Promise<ChapterTrainingCounts[]> {
  const chapterOf = sql<string>`coalesce(${exerciseSources.chapterId}, ${deviations.chapterId})`;

  const rows = await db
    .select({
      chapterId: chapterOf,
      // ISO string + explicit cast, not the Date itself: a Date inside a
      // raw sql fragment bypasses the column's driver mapping, and
      // postgres-js cannot serialize an untyped Date (pglite can, which
      // is why tests alone never caught it).
      due: countDistinct(
        sql`case when ${cards.due} <= ${now.toISOString()}::timestamptz then ${exercises.id} end`,
      ),
      fresh: countDistinct(sql`case when ${cards.id} is null then ${exercises.id} end`),
    })
    .from(exerciseSources)
    .innerJoin(exercises, eq(exerciseSources.exerciseId, exercises.id))
    .leftJoin(deviations, eq(exerciseSources.deviationId, deviations.id))
    .leftJoin(
      repertoireChapters,
      eq(
        sql`coalesce(${exerciseSources.chapterId}, ${deviations.chapterId})`,
        repertoireChapters.id,
      ),
    )
    .leftJoin(cards, eq(cards.exerciseId, exercises.id))
    .where(
      and(
        eq(exercises.userId, userId),
        eq(repertoireChapters.repertoireId, repertoireId),
        or(isNull(cards.id), lte(cards.due, now)),
      ),
    )
    .groupBy(chapterOf);

  return rows.map((row) => ({
    chapterId: row.chapterId,
    due: row.due,
    fresh: row.fresh,
  }));
}

/** Chapters of one repertoire, counted — the landing card's number. */
export async function countChaptersByRepertoire(db: Database, repertoireId: string) {
  const [row] = await db
    .select({ n: countDistinct(repertoireChapters.id) })
    .from(repertoireChapters)
    .where(eq(repertoireChapters.repertoireId, repertoireId));
  return row?.n ?? 0;
}
