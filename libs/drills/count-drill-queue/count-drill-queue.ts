/**
 * CountDrillQueue — what's waiting before anything is served: due vs
 * fresh, scoped the same way GetNextDrill is.
 */
import type { DrillQueueCounts, DrillScope } from "@velachess/infra-db";

type ReadDrillQueueCounts = (
  userId: string,
  now: Date,
  scope: DrillScope,
) => Promise<DrillQueueCounts>;

export interface CountDrillQueueDeps {
  readDrillQueueCounts: ReadDrillQueueCounts;
}

export async function countDrillQueue(
  deps: CountDrillQueueDeps,
  userId: string,
  now: Date = new Date(),
  scope: DrillScope = {},
): Promise<DrillQueueCounts> {
  return deps.readDrillQueueCounts(userId, now, scope);
}
