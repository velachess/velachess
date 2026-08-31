/**
 * The reference 0–100 win% scale, alongside `winchance.ts`'s [-1, 1]
 * `winChance`.
 */
import { winChance } from "./winchance.ts";

export function winPercent(cpWhite: number): number {
  return 50 + 50 * winChance(cpWhite);
}
