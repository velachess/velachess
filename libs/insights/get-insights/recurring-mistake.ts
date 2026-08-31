/**
 * The mistake that keeps recurring in the same place: buckets own mistakes/blunders by (category × phase), measured as
 * a rate against exposure — not raw count, since most moves (and mistakes) happen in the middlegame anyway.
 * One finding at most: competing buckets share attention and drilling time, so only the larger lift speaks.
 */

import { gamePhaseOf, type GamePhase } from "./phase.ts";

import { ownPlies, type GameSample } from "./sample.ts";

type MistakeCategory = "mistake" | "blunder";

interface RecurringMistakeEvidence {
  phase: GamePhase;
  category: MistakeCategory;
  /** Mistakes of this category, in this phase, on your own moves. */
  mistakes: number;
  /** Your own moves played in this phase — the exposure. */
  ownMovesInPhase: number;
  /** mistakes / ownMovesInPhase. */
  rate: number;
  /** This category's rate over all your own moves — the baseline. */
  overallRate: number;
  /** Analysed games the sample was drawn from. */
  gamesAnalysed: number;
  /** Where the bucket's mistakes cluster, when they cluster: supporting
   * evidence, never the grouping. Null when no opening repeats. */
  topOpening: { name: string; mistakes: number } | null;
}

export interface RecurringMistakeFinding {
  id: string;
  kind: "recurring-mistake";
  section: "training";
  evidence: RecurringMistakeEvidence;
  /** Rate lift over baseline, in moves — a per-move unit (see finding.ts). */
  weight: number;
}

/** Exposure floor: a rate over fewer moves than this is noise. */
const MIN_OWN_MOVES_IN_PHASE = 50;
/** Occurrence floor: a pattern needs repetitions to be one. */
const MIN_MISTAKES_IN_BUCKET = 8;
/** Two points of moves above your own baseline before it may speak. */
const MIN_RATE_LIFT = 0.02;

const CATEGORIES: readonly MistakeCategory[] = ["mistake", "blunder"];

export function recurringMistakeFinding(
  games: readonly GameSample[],
): RecurringMistakeFinding | null {
  const analysed = games.filter((game) => game.plies !== null && game.perspective);
  if (analysed.length === 0) return null;

  const movesByPhase = new Map<GamePhase, number>();
  const bucket = new Map<string, { count: number; openings: Map<string, number> }>();
  const categoryTotals = new Map<MistakeCategory, number>();
  let totalOwnMoves = 0;

  for (const game of analysed) {
    for (const ply of ownPlies(game)) {
      const phase = gamePhaseOf(ply.fen);
      totalOwnMoves++;
      movesByPhase.set(phase, (movesByPhase.get(phase) ?? 0) + 1);

      if (ply.category !== "mistake" && ply.category !== "blunder") continue;
      categoryTotals.set(ply.category, (categoryTotals.get(ply.category) ?? 0) + 1);

      const key = `${ply.category}:${phase}`;
      const entry = bucket.get(key) ?? { count: 0, openings: new Map() };
      entry.count++;
      if (game.openingName) {
        entry.openings.set(
          game.openingName,
          (entry.openings.get(game.openingName) ?? 0) + 1,
        );
      }
      bucket.set(key, entry);
    }
  }

  if (totalOwnMoves === 0) return null;

  let best: RecurringMistakeFinding | null = null;
  for (const category of CATEGORIES) {
    const overallRate = (categoryTotals.get(category) ?? 0) / totalOwnMoves;
    for (const [phase, moves] of movesByPhase) {
      if (moves < MIN_OWN_MOVES_IN_PHASE) continue;
      const entry = bucket.get(`${category}:${phase}`);
      if (!entry || entry.count < MIN_MISTAKES_IN_BUCKET) continue;

      const rate = entry.count / moves;
      const lift = rate - overallRate;
      if (lift < MIN_RATE_LIFT) continue;
      if (best && lift <= best.weight) continue;

      best = {
        id: `recurring-mistake:${category}:${phase}`,
        kind: "recurring-mistake",
        section: "training",
        evidence: {
          phase,
          category,
          mistakes: entry.count,
          ownMovesInPhase: moves,
          rate,
          overallRate,
          gamesAnalysed: analysed.length,
          topOpening: topOpening(entry.openings),
        },
        weight: lift,
      };
    }
  }

  return best;
}

function topOpening(openings: Map<string, number>) {
  let best: { name: string; mistakes: number } | null = null;
  for (const [name, mistakes] of openings) {
    if (!best || mistakes > best.mistakes) best = { name, mistakes };
  }
  // One occurrence is not clustering — it is where a mistake happened once.
  return best && best.mistakes >= 2 ? best : null;
}
