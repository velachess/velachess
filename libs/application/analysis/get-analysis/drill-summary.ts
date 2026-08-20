import type { Database } from "@velachess/db";
import { listEngineDrillCandidates, userIdForGame } from "@velachess/db";

import { seedsFor } from "../../drills/seed-exercises/seed-exercises.ts";

export interface DrillSummary {
  /** Your plies in this game the rule would drill, seeded or not. */
  eligible: number;
  /** Of those, the ones that already are an exercise. */
  seeded: number;
  /**
   * False while triage still owes this game something (derived, not stored).
   * Needed to tell "no mistakes to drill" apart from "triage still queued" — same zero count otherwise.
   */
  triaged: boolean;
}

const NOTHING: DrillSummary = { eligible: 0, seeded: 0, triaged: true };

/**
 * What the report's CTA counts. Reuses triage's own `seedsFor` rather than a parallel count,
 * so the number on the button can never drift from what the button then does.
 */
export async function drillSummaryFor(
  db: Database,
  gameId: string,
): Promise<DrillSummary> {
  const userId = await userIdForGame(db, gameId);
  // A pasted PGN nobody claimed has no "you", so nothing is yours to drill.
  if (!userId) return NOTHING;

  const [analysis] = await listEngineDrillCandidates(db, userId, { gameId });
  if (!analysis) return NOTHING;

  // Asked with the seeded set emptied, so this is what the rule *would*
  // pick — the total, not the remainder.
  const eligible = seedsFor({ ...analysis, alreadySeeded: new Set() });
  const seeded = eligible.filter((seed) =>
    seed.origin.kind === "engine-blunder"
      ? analysis.alreadySeeded.has(seed.origin.ply)
      : false,
  ).length;

  return { eligible: eligible.length, seeded, triaged: seeded === eligible.length };
}
