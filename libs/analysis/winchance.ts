/**
 * Centipawns (white POV) → win chance for white in [-1, 1]. Constants and
 * behavior match the reference implementation this module is validated
 * against (sources in docs/explanation/modules/analysis.md): cp is ceiled
 * to ±1000 before the curve, and a mate score maps to ±1000 cp — not to a
 * saturated ±1.
 */

const K = -0.00368208;
const CP_CEILING = 1000;

export function winChance(cpWhite: number): number {
  const ceiled = Math.min(CP_CEILING, Math.max(-CP_CEILING, cpWhite));
  const chances = 2 / (1 + Math.exp(K * ceiled)) - 1;
  return Math.min(1, Math.max(-1, chances));
}

export function scoreToWinChance(score: {
  cp?: number | undefined;
  mate?: number | undefined;
}): number {
  if (score.mate !== undefined)
    return winChance(score.mate > 0 ? CP_CEILING : -CP_CEILING);
  return winChance(score.cp ?? 0);
}

/** Same value on the reference 0–100 scale. */
export function winPercent(cpWhite: number): number {
  return 50 + 50 * winChance(cpWhite);
}
