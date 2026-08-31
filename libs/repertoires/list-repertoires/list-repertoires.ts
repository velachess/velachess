/**
 * Read-model service for the UI: each repertoire with how faithfully it
 * was actually played. Thin composition — the math lives in this
 * module's own adherence.ts (adherenceMetrics); this file only loads and
 * shapes.
 *
 * Adherence is a property of a book, not a discovery about the player:
 * "you followed this one in 34 of 52 games, and your prep runs about
 * nine plies deep" describes the repertoire the way `name` and `color`
 * do. So it rides along with the repertoire rather than living on its
 * own endpoint — an interpretation of it is a finding, and that is
 * `listInsights`.
 */

import type { Repertoire } from "@velachess/infra-db";

import type { AdherenceMetrics, JudgmentRow } from "../adherence.ts";
import { adherenceMetrics } from "../adherence.ts";

export interface RepertoireWithAdherence extends Repertoire {
  /**
   * Null until at least one game has been judged against this book.
   *
   * Null rather than a zeroed shape on purpose: "no games judged yet" and
   * "judged, and you never once followed it" are different sentences, and
   * zeros cannot tell them apart.
   */
  adherence: AdherenceMetrics | null;
  /** What the landing card renders beside the name — counts, not rows. */
  chapterCount: number;
  /** Opponent moves this book has no answer to (opponent-left judgments). */
  gaps: number;
  /** The book's slice of the drill queue: due now, and never scheduled. */
  training: { due: number; fresh: number };
}

type ListRepertoiresByUser = (userId: string) => Promise<Repertoire[]>;
type GetJudgmentRows = (repertoireId: string) => Promise<JudgmentRow[]>;
type CountChaptersByRepertoire = (repertoireId: string) => Promise<number>;
type CountJudgmentsByType = (
  repertoireId: string,
) => Promise<{ type: string; n: number }[]>;
type CountDrillQueueForRepertoire = (
  userId: string,
  now: Date,
  scope: { repertoireId: string },
) => Promise<{ due: number; fresh: number }>;

export interface ListRepertoiresDeps {
  listRepertoiresByUser: ListRepertoiresByUser;
  getJudgmentRows: GetJudgmentRows;
  countChaptersByRepertoire: CountChaptersByRepertoire;
  countJudgmentsByType: CountJudgmentsByType;
  countDrillQueueForRepertoire: CountDrillQueueForRepertoire;
}

/** Every repertoire the user owns, judged or not — judgments accumulate
 * per (game, repertoire), so each book reads its own faithful/deviation
 * story. */
export async function listRepertoiresWithAdherence(
  deps: ListRepertoiresDeps,
  userId: string,
): Promise<RepertoireWithAdherence[]> {
  const results: RepertoireWithAdherence[] = [];
  for (const repertoire of await deps.listRepertoiresByUser(userId)) {
    // Small, per-user list — not a hot path worth parallelizing.
    // oxlint-disable-next-line eslint/no-await-in-loop
    const [rows, chapterCount, byType, queue] = await Promise.all([
      deps.getJudgmentRows(repertoire.id),
      deps.countChaptersByRepertoire(repertoire.id),
      deps.countJudgmentsByType(repertoire.id),
      deps.countDrillQueueForRepertoire(userId, new Date(), {
        repertoireId: repertoire.id,
      }),
    ]);
    results.push({
      ...repertoire,
      adherence: rows.length === 0 ? null : adherenceMetrics(rows),
      chapterCount,
      gaps: byType.find((row) => row.type === "gap")?.n ?? 0,
      training: { due: queue.due, fresh: queue.fresh },
    });
  }
  return results;
}
