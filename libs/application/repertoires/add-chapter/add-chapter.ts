/**
 * Adding a chapter is more than an insert — it is the moment a book
 * grows, and three things follow from that in one place:
 *
 * - the repertoire is confirmed: a manual edit to an extracted candidate
 *   is the user declaring intent, and extraction must refuse to
 *   overwrite it from now on;
 * - non-player judgments reopen: a game where the opponent left first,
 *   where preparation ran out, or that nothing matched might be answered
 *   by the new chapter — deleting those rows is what re-queues the games
 *   for the next judge run. Player-left rows stay: a drill may reference
 *   them, and the player's failure does not un-happen;
 * - the chapter's decision positions seed the training queue, so the
 *   line is trainable the moment it exists.
 */

import { parsePgn } from "@velachess/chess";
import type { Database } from "@velachess/db";
import {
  addChapter as insertChapter,
  getRepertoireWithChapters,
  markRepertoireManual,
  reopenNonPlayerJudgments,
} from "@velachess/db";
import { buildRepertoire } from "@velachess/repertoire";

import { seedRepertoireLines } from "../../drills/seed-exercises/seed-lines.ts";

export type AddChapterOutcome =
  | {
      status: "added";
      chapter: {
        id: string;
        repertoireId: string;
        name: string;
        sortOrder: number;
        pgn: string;
      };
      /** Judgments reopened for re-judging against the grown book. */
      reopened: number;
      /** Decision positions seeded into the training queue. */
      seeded: number;
    }
  | { status: "not-found" }
  /** The PGN does not parse into a buildable tree — rejected before any
   * write, so a typo never becomes a chapter the judge chokes on. */
  | { status: "invalid-pgn" };

export async function addChapterToRepertoire(
  db: Database,
  userId: string,
  repertoireId: string,
  input: { name: string; pgn: string; sortOrder: number },
): Promise<AddChapterOutcome> {
  const repertoire = await getRepertoireWithChapters(db, userId, repertoireId);
  if (!repertoire) return { status: "not-found" };

  // The PGN parser is lenient — "1. e9 zz" parses and simply loses every
  // branch to the illegal-move cut. A chapter whose tree builds EMPTY is
  // therefore the real invalid case: nothing to judge against, nothing
  // to train, and a judge run would call every game book-ended at ply 1.
  const parsed = parsePgn(input.pgn)[0];
  if (!parsed) return { status: "invalid-pgn" };
  const built = buildRepertoire(parsed);
  if (built.isErr || built.unwrap().tree.children.length === 0) {
    return { status: "invalid-pgn" };
  }

  const { chapter, reopened } = await db.transaction(async (tx) => {
    const inserted = await insertChapter(tx, { repertoireId, ...input });
    if (repertoire.source === "extracted") await markRepertoireManual(tx, repertoireId);
    const rows = await reopenNonPlayerJudgments(tx, repertoireId);
    return { chapter: inserted, reopened: rows.length };
  });

  const { seeded } = await seedRepertoireLines(db, userId, repertoireId);

  return {
    status: "added",
    chapter: {
      id: chapter.id,
      repertoireId: chapter.repertoireId,
      name: chapter.name,
      sortOrder: chapter.sortOrder,
      pgn: chapter.pgn,
    },
    reopened,
    seeded,
  };
}
