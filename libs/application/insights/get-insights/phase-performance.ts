/**
 * Which stretch of the game costs you — coarse sibling of `recurring-mistake`: error categories folded per phase, vs. your own overall rate.
 * At most one phase becomes a finding; the three phase rates are complements, so emitting two would say the same thing twice.
 */

import { gamePhaseOf, PHASE_ORDER, type GamePhase } from "@velachess/analysis";

import { ownPlies, type GameSample } from "./sample.ts";

export interface PhaseBreakdown {
  phase: GamePhase;
  /** inaccuracy + mistake + blunder on your own moves. */
  errors: number;
  ownMoves: number;
  /** errors / ownMoves; null under the exposure floor. */
  rate: number | null;
}

export interface PhasePerformanceEvidence {
  /** The phase the finding is about. */
  phase: GamePhase;
  errorRate: number;
  overallErrorRate: number;
  ownMovesInPhase: number;
  totalOwnMoves: number;
  gamesAnalysed: number;
  /** All three phases, floors applied — the comparison in full. */
  byPhase: PhaseBreakdown[];
}

export interface PhasePerformanceFinding {
  id: string;
  kind: "phase-performance";
  section: "phases";
  evidence: PhasePerformanceEvidence;
  /** |rate − overall|, in moves — a per-move unit (see finding.ts). */
  weight: number;
}

const ERROR_CATEGORIES = new Set(["inaccuracy", "mistake", "blunder"]);
/** Exposure floor per phase before its rate may speak. */
const MIN_OWN_MOVES_IN_PHASE = 80;
/** Three points of moves off your own baseline before it is a finding. */
const MIN_RATE_DELTA = 0.03;

export function phasePerformanceFinding(
  games: readonly GameSample[],
): PhasePerformanceFinding | null {
  const analysed = games.filter((game) => game.plies !== null && game.perspective);
  if (analysed.length === 0) return null;

  const perPhase = new Map<GamePhase, { errors: number; moves: number }>();
  let totalErrors = 0;
  let totalOwnMoves = 0;

  for (const game of analysed) {
    for (const ply of ownPlies(game)) {
      const phase = gamePhaseOf(ply.fen);
      const entry = perPhase.get(phase) ?? { errors: 0, moves: 0 };
      entry.moves++;
      totalOwnMoves++;
      if (ERROR_CATEGORIES.has(ply.category)) {
        entry.errors++;
        totalErrors++;
      }
      perPhase.set(phase, entry);
    }
  }

  if (totalOwnMoves === 0) return null;
  const overallErrorRate = totalErrors / totalOwnMoves;

  const byPhase: PhaseBreakdown[] = PHASE_ORDER.map((phase) => {
    const entry = perPhase.get(phase) ?? { errors: 0, moves: 0 };
    return {
      phase,
      errors: entry.errors,
      ownMoves: entry.moves,
      rate: entry.moves >= MIN_OWN_MOVES_IN_PHASE ? entry.errors / entry.moves : null,
    };
  });

  let worst: PhaseBreakdown | null = null;
  let worstDelta = 0;
  for (const breakdown of byPhase) {
    if (breakdown.rate === null) continue;
    const delta = Math.abs(breakdown.rate - overallErrorRate);
    if (delta > worstDelta) {
      worst = breakdown;
      worstDelta = delta;
    }
  }

  if (!worst || worst.rate === null || worstDelta < MIN_RATE_DELTA) return null;

  return {
    id: `phase-performance:${worst.phase}`,
    kind: "phase-performance",
    section: "phases",
    evidence: {
      phase: worst.phase,
      errorRate: worst.rate,
      overallErrorRate,
      ownMovesInPhase: worst.ownMoves,
      totalOwnMoves,
      gamesAnalysed: analysed.length,
      byPhase,
    },
    weight: worstDelta,
  };
}
