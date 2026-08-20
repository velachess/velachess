import { and, asc, eq } from "drizzle-orm";

import type { Database } from "../client.ts";
import type { NewRepertoire, NewRepertoireChapter } from "../schema.ts";
import { repertoireChapters, repertoires } from "../schema.ts";

export async function createRepertoire(
  db: Database,
  data: Pick<NewRepertoire, "userId" | "name" | "color" | "source">,
) {
  const [repertoire] = await db.insert(repertoires).values(data).returning();
  return repertoire!;
}

/**
 * Confirms a repertoire: a manual edit to an extracted candidate is the
 * user declaring "this is my preparation now", after which extraction
 * must refuse to overwrite it.
 */
export async function markRepertoireManual(db: Database, repertoireId: string) {
  await db
    .update(repertoires)
    .set({ source: "manual" })
    .where(eq(repertoires.id, repertoireId));
}

/** One chapter, reachable only through its owner's repertoire — another
 * user's chapter id and a missing one are the same null. */
export async function getChapterForUser(
  db: Database,
  userId: string,
  repertoireId: string,
  chapterId: string,
) {
  const [row] = await db
    .select({
      chapter: repertoireChapters,
      repertoireName: repertoires.name,
      color: repertoires.color,
    })
    .from(repertoireChapters)
    .innerJoin(repertoires, eq(repertoireChapters.repertoireId, repertoires.id))
    .where(
      and(
        eq(repertoireChapters.id, chapterId),
        eq(repertoireChapters.repertoireId, repertoireId),
        eq(repertoires.userId, userId),
      ),
    );
  return row ?? null;
}

export async function addChapter(
  db: Database,
  data: Pick<
    NewRepertoireChapter,
    "repertoireId" | "name" | "sortOrder" | "pgn" | "startingFen"
  >,
) {
  const [chapter] = await db.insert(repertoireChapters).values(data).returning();
  return chapter!;
}

/**
 * Repertoire + chapters in order. The caller (orchestration, not this
 * package) parses `chapter.pgn` and feeds buildRepertoire — db never does.
 */
export async function getRepertoireWithChapters(
  db: Database,
  userId: string,
  repertoireId: string,
) {
  // Scoped in the predicate: another user's repertoire id and a missing
  // one are the same null, so the response never confirms which uuids
  // exist.
  const [repertoire] = await db
    .select()
    .from(repertoires)
    .where(and(eq(repertoires.id, repertoireId), eq(repertoires.userId, userId)));
  if (!repertoire) return null;

  const chapters = await db
    .select()
    .from(repertoireChapters)
    .where(eq(repertoireChapters.repertoireId, repertoireId))
    .orderBy(asc(repertoireChapters.sortOrder));

  return { ...repertoire, chapters };
}

/** Oldest first — deterministic: "the oldest chaptered repertoire of a
 * color judges" depends on this order. */
export async function listRepertoiresByUser(db: Database, userId: string) {
  return db
    .select()
    .from(repertoires)
    .where(eq(repertoires.userId, userId))
    .orderBy(asc(repertoires.createdAt));
}

/**
 * The book of a color, which is the extraction target.
 *
 * Identity is (user, color), never the name: the name is display copy a
 * person may change, and looking one up by title meant renaming the
 * heading grew a second book. Confirmed preparation wins over a derived
 * candidate so the caller can refuse to overwrite it; among equals the
 * oldest wins, which keeps the choice deterministic.
 */
export async function findRepertoireOfColor(
  db: Database,
  userId: string,
  color: "white" | "black",
) {
  const books = await db
    .select()
    .from(repertoires)
    .where(and(eq(repertoires.userId, userId), eq(repertoires.color, color)))
    .orderBy(asc(repertoires.createdAt));

  return books.find((book) => book.source === "manual") ?? books[0] ?? null;
}

/** The title is display copy — extraction keeps it current when the
 * product's wording changes under an existing candidate. */
export async function renameRepertoire(db: Database, repertoireId: string, name: string) {
  await db.update(repertoires).set({ name }).where(eq(repertoires.id, repertoireId));
}

/** Full chapter swap — re-extraction replaces the book. Caller wraps in a
 * transaction together with whatever else must be atomic. */
export async function replaceChapters(
  db: Database,
  repertoireId: string,
  chapters: { name: string; pgn: string }[],
) {
  await db
    .delete(repertoireChapters)
    .where(eq(repertoireChapters.repertoireId, repertoireId));
  if (chapters.length === 0) return [];
  return db
    .insert(repertoireChapters)
    .values(
      chapters.map((chapter, index) => ({ repertoireId, ...chapter, sortOrder: index })),
    )
    .returning();
}

/** Judgment history survives by design: deviations.repertoire_id is
 * ON DELETE SET NULL and name snapshots are NOT NULL. */
export async function deleteRepertoire(
  db: Database,
  userId: string,
  repertoireId: string,
) {
  const [deleted] = await db
    .delete(repertoires)
    .where(and(eq(repertoires.id, repertoireId), eq(repertoires.userId, userId)))
    .returning();
  return deleted ?? null;
}
