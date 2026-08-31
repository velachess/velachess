import type { EngineDrillCandidate } from "@velachess/infra-db";

// Type-only: drills' seed-exercises.ts imports toEngineCategory from this
// module's own index.ts, so a runtime import of seedsFor here would be a
// real cross-module cycle. `import type` + `typeof` gets the exact
// function shape without one — dependency-cruiser's cycle check already
// excludes type-only edges.
import type { seedsFor } from "@velachess/drills";

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

type UserIdForGame = (gameId: string) => Promise<string | null>;
type ListEngineDrillCandidates = (
  userId: string,
  scope: { gameId: string },
) => Promise<EngineDrillCandidate[]>;

export interface DrillSummaryDeps {
  userIdForGame: UserIdForGame;
  listEngineDrillCandidates: ListEngineDrillCandidates;
  /** drills' own pure triage rule — declared here (not a direct import) to
   * avoid the real cross-module cycle explained above. Composed at
   * apps/server/src/composition/analysis.ts from the real `seedsFor`. */
  seedsFor: typeof seedsFor;
}

/**
 * What the report's CTA counts. Reuses triage's own `seedsFor` rather than a parallel count,
 * so the number on the button can never drift from what the button then does.
 */
export async function drillSummaryFor(
  deps: DrillSummaryDeps,
  gameId: string,
): Promise<DrillSummary> {
  const userId = await deps.userIdForGame(gameId);
  // A pasted PGN nobody claimed has no "you" so nothing is yours to drill.
  if (!userId) return NOTHING;

  const [analysis] = await deps.listEngineDrillCandidates(userId, { gameId });
  if (!analysis) return NOTHING;

  // Asked with the seeded set emptied, so this is what the rule *would*
  // pick — the total, not the remainder.
  const eligible = deps.seedsFor({ ...analysis, alreadySeeded: new Set() });
  const seeded = eligible.filter((seed) =>
    seed.origin.kind === "engine-blunder"
      ? analysis.alreadySeeded.has(seed.origin.ply)
      : false,
  ).length;

  return { eligible: eligible.length, seeded, triaged: seeded === eligible.length };
}
