/**
 * How a played move compares to the engine's choice.
 *
 * Severity order, best first — consumers render rows and legends in this
 * order, so the array is the source and the union is read off it. A sixth
 * category added here reaches the classifier, the stored report shape and
 * every screen at once instead of being retyped in each.
 */
export const MOVE_CATEGORIES = [
  "best",
  "good",
  "inaccuracy",
  "mistake",
  "blunder",
] as const;

export type MoveCategory = (typeof MOVE_CATEGORIES)[number];
