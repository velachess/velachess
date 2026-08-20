/**
 * Move and game accuracy on the 0–100 scale, ported faithfully from the
 * reference implementation this module is validated against (sources in
 * docs/explanation/modules/analysis.md). The acceptance test mirrors the
 * reference's own public test suite, same inputs and expected values.
 */

import { winPercent } from "./winchance.ts";

const INITIAL_CP = 15;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function standardDeviation(values: number[]): number | null {
  const m = mean(values);
  if (m === null) return null;
  return Math.sqrt(values.reduce((sum, x) => sum + (x - m) ** 2, 0) / values.length);
}

function harmonicMean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.length / values.reduce((acc, v) => acc + 1 / Math.max(1, v), 0);
}

function weightedMean(pairs: [value: number, weight: number][]): number | null {
  if (pairs.length === 0) return null;
  const [sum, weights] = pairs.reduce(([av, aw], [v, w]) => [av + v * w, aw + w], [0, 0]);
  return weights === 0 ? null : sum / weights;
}

/**
 * Accuracy of one move from the win% before and after it (mover's POV,
 * 0–100). 100 when the move didn't lose anything; otherwise an exponential
 * decay on the win% drop, plus a +1 uncertainty bonus, clamped to [0, 100].
 */
export function moveAccuracy(winPercentBefore: number, winPercentAfter: number): number {
  if (winPercentAfter >= winPercentBefore) return 100;
  const winDiff = winPercentBefore - winPercentAfter;
  const raw =
    103.1668100711649 * Math.exp(-0.04354415386753951 * winDiff) + -3.166924740191411;
  return clamp(raw + 1, 0, 100);
}

export interface GameAccuracy {
  white: number;
  black: number;
}

/**
 * Accuracy of a whole game per color: the average of a volatility-weighted
 * mean (windows weighted by win% standard deviation) and a harmonic mean
 * of per-move accuracies. `cps` are white-POV evals after each ply, in
 * order; null entries (unanalyzed plies) drop the affected pairs.
 */
export function gameAccuracy(
  startColor: "white" | "black",
  cps: (number | null)[],
): GameAccuracy | null {
  const allWinPercents = [INITIAL_CP, ...cps].map((cp) =>
    cp === null ? null : winPercent(cp),
  );
  const windowSize = clamp(Math.floor(cps.length / 10), 2, 8);

  const windows: (number[] | null)[] = [];
  const fillCount = Math.min(windowSize, allWinPercents.length) - 2;
  const firstWindow = allWinPercents.slice(0, windowSize);
  for (let i = 0; i < fillCount; i++)
    windows.push(firstWindow.every((v) => v !== null) ? (firstWindow as number[]) : null);
  if (allWinPercents.length <= windowSize) {
    windows.push(
      allWinPercents.every((v) => v !== null) ? (allWinPercents as number[]) : null,
    );
  } else {
    for (let i = 0; i + windowSize <= allWinPercents.length; i++) {
      const window = allWinPercents.slice(i, i + windowSize);
      windows.push(window.every((v) => v !== null) ? (window as number[]) : null);
    }
  }

  const weights = windows.map((window) => {
    if (window === null) return null;
    const sd = standardDeviation(window);
    return sd === null ? null : clamp(sd, 0.5, 12);
  });

  const perColor: Record<
    "white" | "black",
    { weighted: [number, number][]; accuracies: number[] }
  > = {
    white: { weighted: [], accuracies: [] },
    black: { weighted: [], accuracies: [] },
  };

  for (let i = 0; i + 1 < allWinPercents.length; i++) {
    const prev = allWinPercents[i];
    const next = allWinPercents[i + 1];
    const weight = weights[i] ?? null;
    const color: "white" | "black" =
      (i % 2 === 0) === (startColor === "white") ? "white" : "black";
    // A ply can be null (no eval) and an indexed read can be undefined —
    // `== null` covers both, which is what reaches moveAccuracy below.
    if (prev == null || next == null) continue;
    if (weight === null) continue;
    const accuracy =
      color === "white" ? moveAccuracy(prev, next) : moveAccuracy(100 - prev, 100 - next);
    perColor[color].accuracies.push(accuracy);
    perColor[color].weighted.push([accuracy, weight]);
  }

  const finish = (color: "white" | "black"): number | null => {
    const weighted = weightedMean(perColor[color].weighted);
    const harmonic = harmonicMean(perColor[color].accuracies);
    if (weighted === null || harmonic === null) return null;
    return (weighted + harmonic) / 2;
  };

  const white = finish("white");
  const black = finish("black");
  if (white === null || black === null) return null;
  return { white, black };
}
