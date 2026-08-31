/**
 * Private to judge-games: moved here from the old `@velachess/repertoire`
 * package (this slice was its only consumer, confirmed by repo-wide
 * grep).
 */
import type { ReplayedGame } from "@velachess/chess";
import { positionKeyOf } from "@velachess/chess";
import type { BuiltRepertoire } from "@velachess/repertoires";

import type { DeviationResult } from "./deviation.ts";
import { findDeviation } from "./deviation.ts";

export interface ChapterJudgment {
  /** Index into the `chapters` argument — the caller maps it back to its own ids. */
  chapterIndex: number;
  result: DeviationResult;
}

/**
 * Judges a game against each chapter whose root position matches; best
 * result wins ("completed" beats deepest inBookPlies, ties go to lowest
 * index). Null if no chapter applies.
 */
export function judgeAgainstChapters(
  chapters: BuiltRepertoire[],
  replay: ReplayedGame,
  color: "white" | "black",
): ChapterJudgment | null {
  const firstMove = replay.moves[0];
  if (!firstMove) return null;
  const gameRootKey = positionKeyOf(firstMove.fenBefore);

  let best: ChapterJudgment | null = null;

  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
    const chapter = chapters[chapterIndex]!;
    if (chapter.rootPositionKey !== gameRootKey) continue;

    const result = findDeviation(chapter, replay, color);
    const candidate: ChapterJudgment = { chapterIndex, result };

    if (result.event === null) return candidate;
    if (best === null || result.inBookPlies > best.result.inBookPlies) best = candidate;
  }

  return best;
}
