/**
 * The repertoire opened: header, chapters in order, and the statistics
 * the shared deviation model can derive — outcome counts in the product
 * vocabulary, per-chapter adherence, and what the book never even spoke
 * to.
 *
 * All of it is read from judgment rows; nothing here replays a game or
 * re-derives a comparison. `/insights` interprets the same rows — the
 * one comparison, judged once by the judge, read twice.
 */

import type { Database } from "@velachess/db";
import {
  countJudgmentsByChapter,
  countJudgmentsByType,
  countTrainingByChapter,
  getJudgmentRows,
  getRepertoireWithChapters,
  listUnmatchedGames,
} from "@velachess/db";
import { openingFamily } from "@velachess/platforms";
import type { AdherenceMetrics } from "@velachess/repertoire";
import { adherenceMetrics } from "@velachess/repertoire";

/**
 * One judgment per (game, repertoire), one of five mutually exclusive
 * outcomes — the product vocabulary over the storage enum:
 * held=completed, playerLeft=deviation, opponentLeft=gap,
 * repertoireEnded=book-ended, unmatched=unmatched.
 */
export interface OutcomeCounts {
  held: number;
  playerLeft: number;
  opponentLeft: number;
  repertoireEnded: number;
  unmatched: number;
}

const EMPTY_OUTCOMES: OutcomeCounts = {
  held: 0,
  playerLeft: 0,
  opponentLeft: 0,
  repertoireEnded: 0,
  unmatched: 0,
};

const OUTCOME_OF_TYPE: Record<string, keyof OutcomeCounts> = {
  completed: "held",
  deviation: "playerLeft",
  gap: "opponentLeft",
  "book-ended": "repertoireEnded",
  unmatched: "unmatched",
};

/**
 * A chapter row as the detail screen lists it — everything a row renders
 * and nothing it doesn't: no PGN (the tree ships on the chapter detail
 * route, per chapter, when it is opened).
 */
export interface ChapterListEntry {
  id: string;
  name: string;
  sortOrder: number;
  outcomes: OutcomeCounts;
  /** held / (held + playerLeft); null below one judged game — a chapter
   * nobody tested has no faithfulness to report. */
  adherenceRate: number | null;
  /** Real-game recall failures: the owner left this chapter's line. */
  recallFailures: number;
  /** Opponent moves this chapter has no answer to. */
  gaps: number;
  training: { due: number; fresh: number };
}

export interface UncoveredOpening {
  /** Family name derived the same way every other reader derives it. */
  opening: string;
  games: number;
}

export interface RepertoireStats {
  /** Judged at all (any outcome but unmatched) vs unmatched. */
  matchedGames: number;
  unmatchedGames: number;
  outcomes: OutcomeCounts;
  adherence: AdherenceMetrics | null;
  /** What the unmatched games opened as — the coverage worth adding next. */
  uncoveredOpenings: UncoveredOpening[];
}

function outcomesOf(rows: { type: string; n: number }[]): OutcomeCounts {
  const counts = { ...EMPTY_OUTCOMES };
  for (const row of rows) {
    const key = OUTCOME_OF_TYPE[row.type];
    if (key) counts[key] += row.n;
  }
  return counts;
}

export async function getRepertoireDetail(
  db: Database,
  userId: string,
  repertoireId: string,
) {
  const repertoire = await getRepertoireWithChapters(db, userId, repertoireId);
  if (!repertoire) return null;

  const [byType, byChapterRows, unmatched, judgmentRows, trainingRows] =
    await Promise.all([
      countJudgmentsByType(db, repertoireId),
      countJudgmentsByChapter(db, repertoireId),
      listUnmatchedGames(db, repertoireId),
      getJudgmentRows(db, repertoireId),
      countTrainingByChapter(db, userId, repertoireId),
    ]);

  const outcomes = outcomesOf(byType);

  // Judgment rows arrive one per (chapter, type); fold them per chapter.
  const outcomesByChapter = new Map<string, OutcomeCounts>();
  for (const row of byChapterRows) {
    if (row.type === "unmatched" || !row.chapterId) continue;
    const entry = outcomesByChapter.get(row.chapterId) ?? { ...EMPTY_OUTCOMES };
    const outcome = OUTCOME_OF_TYPE[row.type];
    if (outcome) entry[outcome] += row.n;
    outcomesByChapter.set(row.chapterId, entry);
  }
  const trainingByChapter = new Map(trainingRows.map((row) => [row.chapterId, row]));

  // The list a row renders from: live chapters, in order, each with its
  // judgments and its slice of the training queue — and no PGN. The tree
  // is the chapter detail route's payload, served when a chapter opens.
  const chapters: ChapterListEntry[] = repertoire.chapters.map((chapter) => {
    const chapterOutcomes = outcomesByChapter.get(chapter.id) ?? { ...EMPTY_OUTCOMES };
    const tested = chapterOutcomes.held + chapterOutcomes.playerLeft;
    const training = trainingByChapter.get(chapter.id);
    return {
      id: chapter.id,
      name: chapter.name,
      sortOrder: chapter.sortOrder,
      outcomes: chapterOutcomes,
      adherenceRate: tested === 0 ? null : chapterOutcomes.held / tested,
      recallFailures: chapterOutcomes.playerLeft,
      gaps: chapterOutcomes.opponentLeft,
      training: { due: training?.due ?? 0, fresh: training?.fresh ?? 0 },
    };
  });

  // Unmatched games grouped by opening family — the same derivation the
  // insights read applies, so "you have no Caro-Kann coverage" and the
  // opening-weakness finding speak of the same opening.
  const familyCounts = new Map<string, number>();
  for (const game of unmatched) {
    const family = openingFamily(game.openingName, game.openingUrl);
    if (!family) continue;
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
  }
  const uncoveredOpenings = [...familyCounts.entries()]
    .map(([opening, games]) => ({ opening, games }))
    .toSorted((a, b) => b.games - a.games || a.opening.localeCompare(b.opening));

  const matchedGames =
    outcomes.held +
    outcomes.playerLeft +
    outcomes.opponentLeft +
    outcomes.repertoireEnded;

  const { chapters: _raw, ...header } = repertoire;

  return {
    ...header,
    chapters,
    stats: {
      matchedGames,
      unmatchedGames: outcomes.unmatched,
      outcomes,
      adherence: judgmentRows.length === 0 ? null : adherenceMetrics(judgmentRows),
      uncoveredOpenings,
    },
  };
}
