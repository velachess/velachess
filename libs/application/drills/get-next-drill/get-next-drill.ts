/**
 * GetNextDrill — the next thing to drill: oldest due card, else a
 * never-scheduled exercise. Null = nothing to do.
 */
import { epdToFen } from "@velachess/chess";
import type { Database, DrillContext, DrillScope } from "@velachess/db";
import { drillContextOf, getCard, listDueExercises } from "@velachess/db";

import { getNewExercise } from "./queries.ts";
import type { Grade, Scheduler } from "@velachess/scheduler";

export interface ReviewItem {
  exerciseId: string;
  /** Playable position for the board. */
  fen: string;
  previews: Record<Grade, { due: Date; intervalDays: number }>;
  phase: "due" | "new";
  /**
   * Why this position is being asked, and what it can say about itself:
   * the move you played, and the chapter or game it came from.
   *
   * The origin decides the sentence — "your book said Nc3" is a claim
   * about a decision you made, "the engine preferred Nc3" is not — and
   * the rest is what keeps a drill attached to the game that produced
   * it instead of floating free as a puzzle.
   *
   * Null when the provenance is missing; the screen stays neutral rather
   * than guessing.
   */
  context: DrillContext | null;
}

/** The next thing to drill: oldest due card, else a never-scheduled
 * exercise. Null = nothing to do. `scope` narrows to a repertoire,
 * chapter or origin — the same queue, one slice of it, which is what
 * lets a chapter's Train button and an insight's CTA land on the drills
 * they are actually about. */
export async function getReviewItem(
  db: Database,
  scheduler: Scheduler,
  userId: string,
  now: Date = new Date(),
  scope: DrillScope = {},
): Promise<ReviewItem | null> {
  const [due] = await listDueExercises(db, userId, now, scope);
  if (due) {
    const card = (await getCard(db, due.exerciseId))!;
    return {
      exerciseId: due.exerciseId,
      fen: epdToFen(due.positionKey),
      previews: scheduler.previewIntervals(card, now),
      phase: "due",
      context: await drillContextOf(db, due.exerciseId),
    };
  }

  const fresh = await getNewExercise(db, userId, scope);
  if (!fresh) return null;
  return {
    exerciseId: fresh.id,
    fen: epdToFen(fresh.positionKey),
    previews: scheduler.previewIntervals(scheduler.newCard(now), now),
    phase: "new",
    context: await drillContextOf(db, fresh.id),
  };
}
