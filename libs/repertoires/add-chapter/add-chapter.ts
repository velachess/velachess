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
import type { Database, RepertoireChapter } from "@velachess/infra-db";

import { buildRepertoire } from "../repertoire.ts";

/** Database and a Drizzle transaction share this type in this codebase
 * (see libs/infra/db/client.ts) — named locally so this slice's own
 * transactional dependencies read in its vocabulary instead of taking
 * `Database` itself. */
type Tx = Database;

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

type GetRepertoireWithChapters = (
  userId: string,
  repertoireId: string,
) => Promise<{ source: "manual" | "extracted" } | null>;
type InsertChapter = (
  tx: Tx,
  data: { repertoireId: string; name: string; pgn: string; sortOrder: number },
) => Promise<RepertoireChapter>;
type MarkRepertoireManual = (tx: Tx, repertoireId: string) => Promise<void>;
type ReopenNonPlayerJudgments = (
  tx: Tx,
  repertoireId: string,
) => Promise<{ id: string }[]>;
type WithTransaction = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
/** Re-declared identically in extract-repertoire.ts — duplicating the
 * type is fine, the implementation (drills' seed-lines.ts) is singular. */
type SeedRepertoireLines = (
  userId: string,
  repertoireId: string,
) => Promise<{ seeded: number }>;

export interface AddChapterDeps {
  getRepertoireWithChapters: GetRepertoireWithChapters;
  insertChapter: InsertChapter;
  markRepertoireManual: MarkRepertoireManual;
  reopenNonPlayerJudgments: ReopenNonPlayerJudgments;
  withTransaction: WithTransaction;
  seedRepertoireLines: SeedRepertoireLines;
}

export async function addChapter(
  deps: AddChapterDeps,
  userId: string,
  repertoireId: string,
  input: { name: string; pgn: string; sortOrder: number },
): Promise<AddChapterOutcome> {
  const repertoire = await deps.getRepertoireWithChapters(userId, repertoireId);
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

  const { chapter, reopened } = await deps.withTransaction(async (tx) => {
    const inserted = await deps.insertChapter(tx, { repertoireId, ...input });
    if (repertoire.source === "extracted") {
      await deps.markRepertoireManual(tx, repertoireId);
    }
    const rows = await deps.reopenNonPlayerJudgments(tx, repertoireId);
    return { chapter: inserted, reopened: rows.length };
  });

  const { seeded } = await deps.seedRepertoireLines(userId, repertoireId);

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
