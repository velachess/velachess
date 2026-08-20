/**
 * The seed an exercise upsert needs.
 *
 * Exercise identity is (userId, positionKey) — the same position reached
 * in two games is one exercise with two provenances, not two exercises.
 * That already held across games and now holds across *origins*: deviate
 * from your preparation in a position, blunder in the same position
 * months later, and it stays one exercise with two records of where it
 * came from.
 */

import { positionKeyOf } from "@velachess/chess";
import { makeSan, makeUci, parseSan, parseUci, positionFromFen } from "@velachess/chess";

/** The variants match the `drill_origin` enum exactly. If they drift,
 * someone ends up mapping strings by hand at the persistence boundary. */
export type DrillOrigin =
  | { kind: "repertoire-deviation"; deviationId: string }
  | { kind: "engine-blunder"; gameId: string; ply: number }
  | { kind: "repertoire-line"; chapterId: string };

export interface ExerciseSeed {
  positionKey: string;
  /** What counts as the right answer. Which is a different thing per
   * origin: your own preparation, or the engine's preference. */
  expectedSans: string[];
  origin: DrillOrigin;
}

export interface DeviationSeed {
  id: string;
  positionKey: string | null;
  expectedSans: string[] | null;
}

/** Null when the deviation lacks the fields an exercise requires. */
export function seedFromDeviation(deviation: DeviationSeed): ExerciseSeed | null {
  if (
    !deviation.positionKey ||
    !deviation.expectedSans ||
    deviation.expectedSans.length === 0
  )
    return null;
  return {
    positionKey: deviation.positionKey,
    expectedSans: deviation.expectedSans,
    origin: { kind: "repertoire-deviation", deviationId: deviation.id },
  };
}

export interface GradedPlySeed {
  gameId: string;
  ply: number;
  /** Position before the move was played — the one to solve. */
  fen: string;
  /** The engine's preference there, in UCI. */
  bestMove: string;
}

/**
 * Engines answer in UCI (`g1f3`); an exercise stores SAN (`Nf3`), because
 * SAN is what a person types and what `checkAnswer` compares. Converting
 * needs the position, which the ply carries.
 *
 * Suspicious on purpose: `parseUci` only reads squares, so a record that
 * drifted from its FEN would otherwise produce an exercise whose "correct"
 * answer is a move nobody could play. Nothing is better than that.
 */
export function seedFromGradedPly(ply: GradedPlySeed): ExerciseSeed | null {
  const san = bestMoveAsSan(ply.fen, ply.bestMove);
  if (!san) return null;
  return {
    // Derived here, not taken from the caller: the repertoire origin keys
    // by EPD, and a caller passing the raw FEN would seed the same
    // position a second time. One function, one answer.
    positionKey: positionKeyOf(ply.fen),
    expectedSans: [san],
    origin: { kind: "engine-blunder", gameId: ply.gameId, ply: ply.ply },
  };
}

/**
 * UCI to SAN in a given position, or nothing.
 *
 * This lived in two places before — `apps/web`'s analysis slice and the
 * `parseUci`/`makeSan` pair in `@velachess/chess`. It belongs wherever
 * both the drill seed and the screen can reach it, which is here.
 */
export function bestMoveAsSan(fen: string, uci: string): string | null {
  try {
    const position = positionFromFen(fen).unwrap();
    const move = parseUci(uci);
    if (!move || !position.isLegal(move)) return null;
    return makeSan(position, move);
  } catch {
    return null;
  }
}

/** SAN to UCI, for callers holding a played move rather than an engine's. */
export function sanAsUci(fen: string, san: string): string | null {
  try {
    const position = positionFromFen(fen).unwrap();
    const move = parseSan(position, san);
    return move ? makeUci(move) : null;
  } catch {
    return null;
  }
}

export interface DecisionPositionSeed {
  positionKey: string;
  expectedSans: string[];
}

/**
 * A chapter's decision position, as an exercise. Nothing to validate —
 * `decisionPositionsOf` already derived the key and the answers from the
 * built tree, and re-deriving here would be the duplicated chess
 * knowledge the domain rule forbids.
 */
export function seedFromDecisionPosition(
  chapterId: string,
  position: DecisionPositionSeed,
): ExerciseSeed {
  return {
    positionKey: position.positionKey,
    expectedSans: position.expectedSans,
    origin: { kind: "repertoire-line", chapterId },
  };
}
