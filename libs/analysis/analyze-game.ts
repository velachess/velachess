/**
 * Sequences a game's evaluations and turns them into graded plies, one at
 * a time. The engine arrives as a `PositionEvaluator` — this module
 * decides *which* positions to evaluate and what the answers mean, and
 * never owns a session, a worker, a watchdog or a cache.
 */

import type { Game, PgnNodeData, Position, ReplayedMove } from "@velachess/chess";
import { replayMainline } from "@velachess/chess";
import type { Operation } from "effection";

import { classifyPly, terminalScoreOf, type GradedPly } from "./grade-game.ts";
import type { RawEval } from "./score.ts";

/**
 * Called synchronously the moment a ply is decided, before the next
 * position is searched. A caller that wants the whole report collects
 * what arrives; this module keeps no buffer of its own.
 */
export type PublishPly = (position: GradedPly) => void;

/**
 * The narrow dependency this module declares for reaching an engine. A
 * caller composes whatever satisfies it — today an IndexedDB-backed cache
 * in front of Stockfish WASM — so caching, retries and session lifetime
 * are all decided outside this module, and the same FEN is never evaluated
 * twice here.
 */
export interface PositionEvaluator {
  evaluate(fen: string): Operation<RawEval>;
}

/**
 * The FENs a replayed game needs evaluated, in search order: the position
 * before the first move, then the position after every move — except the
 * very last one when the game ended there, since a terminal position's
 * score comes from the rules, not a search.
 */
export function fensToEvaluate(replay: {
  moves: ReplayedMove[];
  finalPosition: Position;
}): string[] {
  const firstMove = replay.moves[0];
  if (!firstMove) return [];

  const fens = [firstMove.fenBefore, ...replay.moves.map((move) => move.fenAfter)];
  if (replay.finalPosition.isEnd()) fens.pop();
  return fens;
}

/**
 * Grades every ply, publishing each one as it is decided. Nothing is
 * buffered and nothing is returned: with one search standing between
 * consecutive plies, a queue between here and the consumer would only
 * hold a value that is already available synchronously.
 */
export function* analyzeGame(
  game: Game<PgnNodeData>,
  evaluator: PositionEvaluator,
  publish: PublishPly,
): Operation<void> {
  const replay = replayMainline(game).unwrap();
  if (!replay.legal) throw new Error("Game mainline contains an illegal move");

  const firstMove = replay.moves[0];
  if (!firstMove) return;

  const total = replay.moves.length;
  let current = yield* evaluator.evaluate(firstMove.fenBefore);

  for (let i = 0; i < total; i++) {
    const played = replay.moves[i]!;
    const isLast = i === total - 1;

    let next: RawEval;
    if (isLast && replay.finalPosition.isEnd()) {
      next = { score: terminalScoreOf(replay.finalPosition), bestMove: null };
    } else {
      next = yield* evaluator.evaluate(played.fenAfter);
    }

    publish(classifyPly(i + 1, played, current, next));
    current = next;
  }
}
