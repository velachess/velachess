/**
 * Last twenty games vs. the twenty before — one fixed window pair, since "improving" needs two same-shaped samples.
 * Trigger is the result delta alone; rating/mistakes/blunders ride as evidence but don't fire their own findings (one story, not four).
 */

import { isDecided, isWin, ownPlies, ownRating, type GameSample } from "./sample.ts";

interface TrendWindow {
  games: number;
  decided: number;
  winRate: number;
  /** Mean of the account holder's rating over rated games; null when
   * fewer than the floor carried one. */
  averageRating: number | null;
  analysedGames: number;
  /** Own mistakes+blunders per analysed game; null under the floor. */
  mistakesPerGame: number | null;
  /** Own blunders per analysed game; null under the floor. */
  blundersPerGame: number | null;
}

interface PerformanceTrendEvidence {
  windowSize: number;
  latest: TrendWindow;
  previous: TrendWindow;
}

export interface PerformanceTrendFinding {
  id: string;
  kind: "performance-trend";
  section: "performance";
  evidence: PerformanceTrendEvidence;
  /** |win-rate delta| between the windows — the per-game unit. */
  weight: number;
}

const WINDOW = 20;
/** Decided games each window needs before its rate may speak. */
const MIN_DECIDED_PER_WINDOW = 10;
/** Same delta floor as every other per-game comparison in this slice. */
const MIN_WIN_RATE_DELTA = 0.1;
/** Games a sub-metric (rating, mistakes) needs inside a window. */
const MIN_METRIC_SAMPLE = 8;

export function performanceTrendFinding(
  games: readonly GameSample[],
): PerformanceTrendFinding | null {
  // Only games that can be placed in time and attributed to a side.
  const dated = games
    .filter((game) => game.playedAt !== null && game.perspective !== null)
    .toSorted((a, b) => a.playedAt!.getTime() - b.playedAt!.getTime());

  if (dated.length < WINDOW * 2) return null;

  const latest = summarize(dated.slice(-WINDOW));
  const previous = summarize(dated.slice(-WINDOW * 2, -WINDOW));
  if (latest === null || previous === null) return null;

  const delta = latest.winRate - previous.winRate;
  if (Math.abs(delta) < MIN_WIN_RATE_DELTA) return null;

  return {
    id: "performance-trend",
    kind: "performance-trend",
    section: "performance",
    evidence: { windowSize: WINDOW, latest, previous },
    weight: Math.abs(delta),
  };
}

/** Null when the window cannot even answer its headline question. */
function summarize(window: readonly GameSample[]): TrendWindow | null {
  const decided = window.filter(isDecided);
  if (decided.length < MIN_DECIDED_PER_WINDOW) return null;

  const rated = window
    .map(ownRating)
    .filter((rating): rating is number => rating !== null);
  const analysed = window.filter((game) => game.plies !== null);

  let mistakes = 0;
  let blunders = 0;
  for (const game of analysed) {
    for (const ply of ownPlies(game)) {
      if (ply.category === "blunder") blunders++;
      if (ply.category === "mistake" || ply.category === "blunder") mistakes++;
    }
  }

  return {
    games: window.length,
    decided: decided.length,
    winRate: decided.filter(isWin).length / decided.length,
    averageRating:
      rated.length >= MIN_METRIC_SAMPLE
        ? rated.reduce((sum, rating) => sum + rating, 0) / rated.length
        : null,
    analysedGames: analysed.length,
    mistakesPerGame:
      analysed.length >= MIN_METRIC_SAMPLE ? mistakes / analysed.length : null,
    blundersPerGame:
      analysed.length >= MIN_METRIC_SAMPLE ? blunders / analysed.length : null,
  };
}
