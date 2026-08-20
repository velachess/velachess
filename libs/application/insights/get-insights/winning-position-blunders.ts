/**
 * Won positions that didn't stay won: conversion rate of moves played from a clearly winning position (≥2 pawns, or mate)
 * that gave back a significant win-chance share. Answers "when" you err, not just "how often" — a raw blunder count can't say that.
 */

import { moverEval, ownPlies, type GameSample } from "./sample.ts";

export interface WinningPositionBlundersEvidence {
  /** Moves that gave back ≥ the significant-loss floor from a winning position. */
  throws: number;
  /** Own moves played from a winning position — the exposure. */
  winningPositions: number;
  /** throws / winningPositions. */
  rate: number;
  gamesAffected: number;
  gamesAnalysed: number;
  /** The single worst give-back, for the screen to open. */
  worst: { gameId: string; ply: number; winChanceLoss: number } | null;
}

export interface WinningPositionBlundersFinding {
  id: string;
  kind: "winning-position-blunders";
  section: "training";
  evidence: WinningPositionBlundersEvidence;
  /** The conversion-failure rate itself, 0..1 (see finding.ts on units). */
  weight: number;
}

/** Winning: two pawns up from the mover's side, or any mate score. */
const WINNING_CP = 200;
/** classify.ts's MISTAKE floor — the same ruler the move grades use. */
const SIGNIFICANT_LOSS = 0.2;
/** Exposure floor: conversion over fewer chances than this is noise. */
const MIN_WINNING_POSITIONS = 20;
/** Occurrence floor: a pattern needs repetitions to be one. */
const MIN_THROWS = 3;

function isWinning(score: { cp?: number; mate?: number }): boolean {
  if (score.mate !== undefined) return score.mate > 0;
  return score.cp !== undefined && score.cp >= WINNING_CP;
}

export function winningPositionBlundersFinding(
  games: readonly GameSample[],
): WinningPositionBlundersFinding | null {
  const analysed = games.filter((game) => game.plies !== null && game.perspective);
  if (analysed.length === 0) return null;

  let throws = 0;
  let winningPositions = 0;
  const affected = new Set<string>();
  let worst: WinningPositionBlundersEvidence["worst"] = null;

  for (const game of analysed) {
    const mover = game.perspective!;
    for (const ply of ownPlies(game)) {
      if (!isWinning(moverEval(ply.evalBefore, mover))) continue;
      winningPositions++;

      if (ply.winChanceLoss < SIGNIFICANT_LOSS) continue;
      throws++;
      affected.add(game.id);
      if (!worst || ply.winChanceLoss > worst.winChanceLoss) {
        worst = { gameId: game.id, ply: ply.ply, winChanceLoss: ply.winChanceLoss };
      }
    }
  }

  if (winningPositions < MIN_WINNING_POSITIONS || throws < MIN_THROWS) return null;

  return {
    id: "winning-position-blunders",
    kind: "winning-position-blunders",
    section: "training",
    evidence: {
      throws,
      winningPositions,
      rate: throws / winningPositions,
      gamesAffected: affected.size,
      gamesAnalysed: analysed.length,
      worst,
    },
    weight: throws / winningPositions,
  };
}
