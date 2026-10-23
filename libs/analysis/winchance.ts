/**
 * Centipawns in white POV to a win chance in [-1, 1]. The constants match
 * the reference implementation this is validated against, in
 * docs/reference/analysis.md and tests/lichess-reference.test.ts: cp is
 * ceiled to ±1000 before the curve, and a mate maps to ±1000 cp rather
 * than a saturated ±1.
 */

const K = -0.00368208;
export const CP_CEILING = 1000;

export function winChance(cpWhite: number): number {
  const ceiled = Math.min(CP_CEILING, Math.max(-CP_CEILING, cpWhite));
  const chances = 2 / (1 + Math.exp(K * ceiled)) - 1;
  return Math.min(1, Math.max(-1, chances));
}
