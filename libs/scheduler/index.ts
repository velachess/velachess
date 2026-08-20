/**
 * [SCHEDULER] — spaced-repetition scheduling over plain card state.
 * Domain-agnostic on purpose: nothing here knows what an exercise or a
 * chess move is, and the acceptance test schedules a vocabulary flashcard
 * to prove it.
 */

export * from "./card.ts";
export * from "./scheduler.ts";
