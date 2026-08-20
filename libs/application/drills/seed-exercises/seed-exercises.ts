import { toEngineCategory } from "@velachess/analysis";
import type { Database } from "@velachess/db";
import {
  listEngineDrillCandidates,
  pullCardDueNow,
  setDrillable,
  upsertExercise,
  type EngineDrillCandidate,
} from "@velachess/db";

import { listTriageCandidates } from "./queries.ts";
import { eligibleForDrill } from "./eligibility.ts";
import { selectDrillCandidates } from "./selection.ts";
import { seedFromDeviation, seedFromGradedPly, type ExerciseSeed } from "./exercise.ts";

export interface TriageOutcome {
  reviewed: number;
  seeded: number;
  /** Split because one number hides which half is working. A run that
   * seeds nothing looks the same whether the repertoire path is empty or
   * the engine path is broken. */
  byOrigin: { deviation: number; engine: number };
}

export interface TriageScope {
  /** Narrow to one game — what the worker passes after an analysis
   * lands. Absent means every pending candidate the user has. */
  gameId?: string;
}

/**
 * Turns judged mistakes into exercises, from both origins.
 *
 * Idempotent by construction: candidates are the rows that have no
 * exercise yet, and the upsert conflicts away anything that slipped
 * through. Running it twice is not a bug and reprocessing is safe.
 */
export async function triageAndSeed(
  db: Database,
  userId: string,
  scope: TriageScope = {},
): Promise<TriageOutcome> {
  const deviation = await triageDeviations(db, userId);
  const engine = await triageEngineBlunders(db, userId, scope);

  return {
    reviewed: deviation.reviewed + engine.reviewed,
    seeded: deviation.seeded + engine.seeded,
    byOrigin: { deviation: deviation.seeded, engine: engine.seeded },
  };
}

/** The repertoire path: a move that broke your own preparation. */
async function triageDeviations(db: Database, userId: string) {
  const candidates = await listTriageCandidates(db, userId);

  let seeded = 0;
  for (const candidate of candidates) {
    const eligible = eligibleForDrill({
      type: candidate.type,
      expectedSans: candidate.expectedSans,
    });
    // Small batch, sequential writes — not a hot path worth parallelizing.
    // oxlint-disable-next-line eslint/no-await-in-loop
    await setDrillable(db, candidate.id, eligible);
    if (!eligible) continue;

    const seed = seedFromDeviation(candidate);
    if (!seed) continue;
    // oxlint-disable-next-line eslint/no-await-in-loop
    const exercise = await upsertExercise(db, userId, seed);
    // A real-game failure in a position that is already scheduled is the
    // strongest evidence its interval was too long — pull its review to
    // now (never later). A fresh exercise has no card and needs nothing.
    // oxlint-disable-next-line eslint/no-await-in-loop
    await pullCardDueNow(db, exercise.id, new Date());
    seeded++;
  }

  return { reviewed: candidates.length, seeded };
}

/** The engine path: a move that cost you, anywhere in the game. */
async function triageEngineBlunders(db: Database, userId: string, scope: TriageScope) {
  const analyses = await listEngineDrillCandidates(db, userId, scope);

  let reviewed = 0;
  let seeded = 0;
  for (const analysis of analyses) {
    const seeds = seedsFor(analysis);
    reviewed += analysis.plies.length;
    for (const seed of seeds) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      await upsertExercise(db, userId, seed);
      seeded++;
    }
  }

  return { reviewed, seeded };
}

/**
 * The pure part, kept together so it reads as one decision: whose moves,
 * which are worth drilling, and what the answer is.
 *
 * Exported because that is where the two guarantees live — only the
 * user's own mistakes, and never the same ply twice — and both are
 * invisible to a database test that happens to have one blunder on the
 * right side.
 */
export function seedsFor(analysis: EngineDrillCandidate): ExerciseSeed[] {
  // No side means no "you" — there is nobody to attribute the mistake to.
  if (!analysis.perspective) return [];

  const mine = analysis.plies.filter(
    (ply) => sideOfPly(ply.ply) === analysis.perspective,
  );

  const chosen = selectDrillCandidates(
    mine
      .filter((ply) => !analysis.alreadySeeded.has(ply.ply))
      .map((ply) => ({
        ply: ply.ply,
        category: toEngineCategory(ply.category),
        winChanceLoss: ply.winChanceLoss,
        source: ply,
      })),
  );

  return chosen.flatMap((candidate) => {
    const seed = seedFromGradedPly({
      gameId: analysis.gameId,
      ply: candidate.ply,
      fen: candidate.source.fen,
      bestMove: candidate.source.bestMove,
    });
    return seed ? [seed] : [];
  });
}

/** Ply 1 is White's first move, so odd plies are White's. */
function sideOfPly(ply: number): "white" | "black" {
  return ply % 2 === 1 ? "white" : "black";
}
