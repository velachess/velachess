/**
 * Centipawns (white POV) → win chance for white in [-1, 1]. Constants and
 * behavior match the reference implementation this module is validated
 * against (sources in docs/reference/analysis.md and this module's own
 * tests/lichess-reference.test.ts): cp is ceiled to ±1000 before the
 * curve, and a mate score maps to ±1000 cp — not to a saturated ±1.
 *
 * `winChance` is module-root-private (not exported from index.ts): its
 * consumers are `process-analysis/classify-move.ts`'s `scoreToWinChance`
 * and `win-percent.ts`'s reference 0–100 scale (no product caller yet).
 */

const K = -0.00368208;
export const CP_CEILING = 1000;

export function winChance(cpWhite: number): number {
  const ceiled = Math.min(CP_CEILING, Math.max(-CP_CEILING, cpWhite));
  const chances = 2 / (1 + Math.exp(K * ceiled)) - 1;
  return Math.min(1, Math.max(-1, chances));
}
