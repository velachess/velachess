/**
 * The one file that touches ts-fsrs. Everything else in the repo speaks
 * CardState and Grade — swapping the underlying implementation (or a
 * breaking major of it) costs this file, nothing more.
 */

import {
  type Card,
  createEmptyCard,
  fsrs,
  type Grade as FsrsGrade,
  Rating,
  State,
} from "ts-fsrs";

import type { CardPhase, CardState, Grade } from "./card.ts";

/**
 * ts-fsrs separates `Grade` (a real answer) from `Rating` (which also has
 * `Manual`). Our four grades are all real answers, so the map is typed as
 * Grade — `next()` and the preview index both refuse plain Rating.
 */
const RATING: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const PHASE_FROM_STATE: Record<State, CardPhase> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

const STATE_FROM_PHASE: Record<CardPhase, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

function fromCard(card: Card): CardState {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    phase: PHASE_FROM_STATE[card.state],
    lastReview: card.last_review ?? null,
  };
}

function toCard(state: CardState): Card {
  return {
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: STATE_FROM_PHASE[state.phase],
    ...(state.lastReview ? { last_review: state.lastReview } : {}),
  };
}

export interface SchedulerOptions {
  /** Target recall probability, 0–1. */
  requestRetention?: number;
  /** Cap on how far ahead a card can be scheduled, in days. */
  maximumIntervalDays?: number;
}

export interface Scheduler {
  newCard(now?: Date): CardState;
  review(card: CardState, grade: Grade, now?: Date): CardState;
  /** All four outcomes before the user answers. */
  previewIntervals(
    card: CardState,
    now?: Date,
  ): Record<Grade, { due: Date; intervalDays: number }>;
}

export function makeScheduler(opts: SchedulerOptions = {}): Scheduler {
  const engine = fsrs({
    ...(opts.requestRetention !== undefined
      ? { request_retention: opts.requestRetention }
      : {}),
    ...(opts.maximumIntervalDays !== undefined
      ? { maximum_interval: opts.maximumIntervalDays }
      : {}),
  });

  return {
    newCard(now: Date = new Date()): CardState {
      return fromCard(createEmptyCard(now));
    },

    review(card: CardState, grade: Grade, now: Date = new Date()): CardState {
      return fromCard(engine.next(toCard(card), now, RATING[grade]).card);
    },

    previewIntervals(card: CardState, now: Date = new Date()) {
      const preview = engine.repeat(toCard(card), now);
      const entry = (grade: Grade) => {
        const due = preview[RATING[grade]].card.due;
        return { due, intervalDays: (due.getTime() - now.getTime()) / 86_400_000 };
      };
      return {
        again: entry("again"),
        hard: entry("hard"),
        good: entry("good"),
        easy: entry("easy"),
      };
    },
  };
}
