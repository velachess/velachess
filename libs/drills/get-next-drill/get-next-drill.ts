/**
 * GetNextDrill — the next thing to drill: oldest due card, else a
 * never-scheduled exercise. Null = nothing to do.
 */
import { epdToFen } from "@velachess/chess";
import type { DrillContext, DrillScope } from "@velachess/infra-db";
import type { CardState, Grade } from "@velachess/scheduler";

interface DueExerciseRow {
  exerciseId: string;
  positionKey: string;
}

interface FreshExerciseRow {
  id: string;
  positionKey: string;
}

type ListDueExercises = (
  userId: string,
  now: Date,
  scope: DrillScope,
) => Promise<DueExerciseRow[]>;
type GetCard = (exerciseId: string) => Promise<CardState | null>;
type DrillContextOf = (exerciseId: string) => Promise<DrillContext | null>;
/** The never-scheduled pile: exercises with no card yet. */
type GetNewExercise = (
  userId: string,
  scope: DrillScope,
) => Promise<FreshExerciseRow | null>;
type PreviewIntervals = (
  card: CardState,
  now: Date,
) => Record<Grade, { due: Date; intervalDays: number }>;
type NewCard = (now: Date) => CardState;

export interface GetNextDrillDeps {
  listDueExercises: ListDueExercises;
  getCard: GetCard;
  drillContextOf: DrillContextOf;
  getNewExercise: GetNewExercise;
  previewIntervals: PreviewIntervals;
  newCard: NewCard;
}

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
export async function getNextDrillForUser(
  deps: GetNextDrillDeps,
  userId: string,
  now: Date = new Date(),
  scope: DrillScope = {},
): Promise<ReviewItem | null> {
  const [due] = await deps.listDueExercises(userId, now, scope);
  if (due) {
    const card = (await deps.getCard(due.exerciseId))!;
    return {
      exerciseId: due.exerciseId,
      fen: epdToFen(due.positionKey),
      previews: deps.previewIntervals(card, now),
      phase: "due",
      context: await deps.drillContextOf(due.exerciseId),
    };
  }

  const fresh = await deps.getNewExercise(userId, scope);
  if (!fresh) return null;
  return {
    exerciseId: fresh.id,
    fen: epdToFen(fresh.positionKey),
    previews: deps.previewIntervals(deps.newCard(now), now),
    phase: "new",
    context: await deps.drillContextOf(fresh.id),
  };
}
