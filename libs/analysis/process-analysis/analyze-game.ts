/**
 * Evaluates every mainline position with one engine session (one search per
 * ply), classifying each move and yielding a "position" event per ply, then
 * "done". A watchdog timeout retries once on a fresh session; a second
 * failure throws.
 */

import type { Game, PgnNodeData } from "@velachess/chess";
import { replayMainline } from "@velachess/chess";
import type { EngineSession, EngineUpdate } from "@velachess/infra-engine";

import type { MoveCategory } from "../engine-category.ts";
import { classifyMove } from "./classify-move.ts";
import type { WhitePovScore } from "../score.ts";
import { toWhitePov } from "../score.ts";
import { uciOf } from "./uci.ts";

export interface GradedPly {
  /** 1-indexed. */
  ply: number;
  /** FEN before the move. */
  fen: string;
  san: string;
  evalBefore: WhitePovScore;
  evalAfter: WhitePovScore;
  /** Engine's preferred move at `fen`, UCI. */
  bestMove: string;
  category: MoveCategory;
  winChanceLoss: number;
}

export type AnalysisEvent =
  /** `index` is 0-based; `position.ply` is 1-based. They are not the same number. */
  | { type: "position"; index: number; total: number; position: GradedPly }
  | { type: "done"; positions: GradedPly[] };

export interface AnalyzeOptions {
  depth?: number;
  searchTimeoutMs?: number;
}

interface Evaluation {
  score: WhitePovScore;
  bestMove: string | null;
}

function sideToMove(fen: string): "white" | "black" {
  return fen.includes(" w ") ? "white" : "black";
}

function watchdogMs(depth: number, override?: number): number {
  if (override !== undefined) return override;
  return Math.min(30_000, Math.max(5000, 3000 + depth * 400));
}

async function searchOnce(
  session: EngineSession,
  fen: string,
  depth: number,
  timeoutMs: number,
): Promise<Evaluation | null> {
  session.setPosition(fen);
  const { updates, bestMove } = session.go({ kind: "depth", depth });

  let last: EngineUpdate | undefined;
  const drain = (async () => {
    for await (const update of updates) {
      if (update.multipv === 1) last = update;
    }
    return bestMove;
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  const outcome = await Promise.race([drain.then(() => "done" as const), timedOut]);
  if (outcome === "timeout") {
    session.stop();
    const graced = await Promise.race([
      drain.then(() => "done" as const),
      new Promise<"dead">((resolve) => setTimeout(() => resolve("dead"), 2000)),
    ]);
    if (graced === "dead") {
      clearTimeout(timer);
      return null;
    }
  }
  clearTimeout(timer);

  const best = await bestMove;
  if (best === null) return null;

  const pov = sideToMove(fen);
  const score: WhitePovScore = last ? toWhitePov(last.score, pov) : {};
  const move = best.move === "(none)" ? null : best.move;
  return { score, bestMove: move };
}

export async function* analyzeGame(
  game: Game<PgnNodeData>,
  makeSession: () => Promise<EngineSession>,
  opts: AnalyzeOptions = {},
): AsyncGenerator<AnalysisEvent, void, undefined> {
  const depth = opts.depth ?? 14;
  const timeoutMs = watchdogMs(depth, opts.searchTimeoutMs);

  const replay = replayMainline(game).unwrap();
  if (!replay.legal) throw new Error("Game mainline contains an illegal move");
  const total = replay.moves.length;

  let session = await makeSession();
  let retried = false;

  const evaluate = async (fen: string): Promise<Evaluation> => {
    const first = await searchOnce(session, fen, depth, timeoutMs);
    if (first) return first;
    if (retried) {
      session.quit();
      throw new Error(`Engine failed twice evaluating ${fen}`);
    }
    retried = true;
    session.quit();
    session = await makeSession();
    const second = await searchOnce(session, fen, depth, timeoutMs);
    if (!second) {
      session.quit();
      throw new Error(`Engine failed twice evaluating ${fen}`);
    }
    return second;
  };

  const terminalScore = (): WhitePovScore => {
    const outcome = replay.finalPosition.outcome();
    if (outcome?.winner) return { mate: outcome.winner === "white" ? 1 : -1 };
    return { cp: 0 };
  };

  try {
    const positions: GradedPly[] = [];
    const firstMove = replay.moves[0];
    if (!firstMove) {
      yield { type: "done", positions };
      return;
    }

    let current = await evaluate(firstMove.fenBefore);

    for (let i = 0; i < total; i++) {
      const played = replay.moves[i]!;
      const isLast = i === total - 1;

      let next: Evaluation;
      if (isLast && replay.finalPosition.isEnd()) {
        next = { score: terminalScore(), bestMove: null };
      } else {
        // Single engine session, evaluated move by move — each position
        // depends on the previous one having been replayed.
        // oxlint-disable-next-line eslint/no-await-in-loop
        next = await evaluate(played.fenAfter);
      }

      const mover = sideToMove(played.fenBefore);
      const { category, winChanceLoss } = classifyMove({
        before: current.score,
        after: next.score,
        mover,
        wasEngineBest:
          current.bestMove !== null && current.bestMove === uciOf(played.move),
      });

      const position: GradedPly = {
        ply: i + 1,
        fen: played.fenBefore,
        san: played.san,
        evalBefore: current.score,
        evalAfter: next.score,
        bestMove: current.bestMove ?? "",
        category,
        winChanceLoss,
      };
      positions.push(position);
      yield { type: "position", index: i, total, position };

      current = next;
    }

    yield { type: "done", positions };
  } finally {
    session.quit();
  }
}
