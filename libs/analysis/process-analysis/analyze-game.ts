/**
 * Evaluates every mainline position with one engine session (one search per
 * ply), classifying each move and yielding a "position" event per ply, then
 * "done". A watchdog timeout retries once on a fresh session; a second
 * failure throws.
 *
 * `evaluatePositions()` (I/O, through `EngineSession` only) and
 * `gradeGame()` (pure) are the same algorithm split into its two halves —
 * paving the way for a transport that isn't a browser Worker without
 * touching the classification policy at all. `analyzeGame()` still exists
 * as its own streaming generator, sharing `RetryingEvaluator`,
 * `classifyPly`, and `terminalScoreOf` with the split pair rather than
 * duplicating the retry or classification logic.
 */

import type { Game, PgnNodeData, Position, ReplayedMove } from "@velachess/chess";
import { replayMainline } from "@velachess/chess";
import type { EngineSession, EngineUpdate } from "@velachess/infra-engine";

import type { MoveCategory } from "../move-category.ts";
import { classifyMove } from "../classify-move.ts";
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

/** One position's engine output, nothing about the move it preceded. */
export interface RawEval {
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
): Promise<RawEval | null> {
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

/**
 * One engine session, evaluating whatever FEN it's asked for next. A
 * search that comes back empty (dead Worker, crashed WASM module) gets one
 * retry on a fresh session — budgeted per call, not per instance, so one
 * failing position never spends the whole game's only retry.
 */
class RetryingEvaluator {
  private session: EngineSession;

  private constructor(
    session: EngineSession,
    private readonly makeSession: () => Promise<EngineSession>,
    private readonly depth: number,
    private readonly timeoutMs: number,
  ) {
    this.session = session;
  }

  static async create(
    makeSession: () => Promise<EngineSession>,
    depth: number,
    timeoutMs: number,
  ): Promise<RetryingEvaluator> {
    return new RetryingEvaluator(await makeSession(), makeSession, depth, timeoutMs);
  }

  async evaluate(fen: string): Promise<RawEval> {
    const first = await searchOnce(this.session, fen, this.depth, this.timeoutMs);
    if (first) return first;

    this.session.quit();
    this.session = await this.makeSession();
    const second = await searchOnce(this.session, fen, this.depth, this.timeoutMs);
    if (!second) {
      this.session.quit();
      throw new Error(`Engine failed twice evaluating ${fen}`);
    }
    return second;
  }

  quit(): void {
    this.session.quit();
  }
}

function terminalScoreOf(finalPosition: Position): WhitePovScore {
  const outcome = finalPosition.outcome();
  if (outcome?.winner) return { mate: outcome.winner === "white" ? 1 : -1 };
  return { cp: 0 };
}

function classifyPly(
  ply: number,
  played: ReplayedMove,
  current: RawEval,
  next: RawEval,
): GradedPly {
  const mover = sideToMove(played.fenBefore);
  const { category, winChanceLoss } = classifyMove({
    before: current.score,
    after: next.score,
    mover,
    wasEngineBest: current.bestMove !== null && current.bestMove === uciOf(played.move),
  });

  return {
    ply,
    fen: played.fenBefore,
    san: played.san,
    evalBefore: current.score,
    evalAfter: next.score,
    bestMove: current.bestMove ?? "",
    category,
    winChanceLoss,
  };
}

/**
 * The FENs `evaluatePositions()` needs for a replayed game, in search
 * order: the position before the first move, then the position after
 * every move — except the very last one when the game ended there, since
 * a terminal position's score comes from the rules, not a search.
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
 * Evaluates every FEN `fensToEvaluate()` produced, through `EngineSession`
 * alone — no Worker, no `postMessage`, nothing specific to the browser.
 * Whatever satisfies `EngineSession` today (a Worker) or tomorrow (a
 * child process, a server round-trip) is this function's whole I/O
 * boundary.
 */
export async function evaluatePositions(
  fens: readonly string[],
  makeSession: () => Promise<EngineSession>,
  opts: AnalyzeOptions = {},
): Promise<RawEval[]> {
  const depth = opts.depth ?? 14;
  const timeoutMs = watchdogMs(depth, opts.searchTimeoutMs);

  const evaluator = await RetryingEvaluator.create(makeSession, depth, timeoutMs);
  try {
    const evals: RawEval[] = [];
    for (const fen of fens) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one engine session; each position depends on the last one having been replayed
      evals.push(await evaluator.evaluate(fen));
    }
    return evals;
  } finally {
    evaluator.quit();
  }
}

/**
 * Pure: classifies every ply from `evaluatePositions()`'s own output, no
 * I/O of its own. `evals` must align with `fensToEvaluate(...)` for the
 * same `moves`/`finalPosition` — one entry per FEN, in the same order,
 * omitting the terminal position when the game ended on the last move.
 */
export function gradeGame(
  moves: ReplayedMove[],
  finalPosition: Position,
  evals: readonly RawEval[],
): GradedPly[] {
  const total = moves.length;
  if (total === 0) return [];

  const positions: GradedPly[] = [];
  let current = evals[0]!;

  for (let i = 0; i < total; i++) {
    const played = moves[i]!;
    const isLast = i === total - 1;
    const next: RawEval =
      isLast && finalPosition.isEnd()
        ? { score: terminalScoreOf(finalPosition), bestMove: null }
        : evals[i + 1]!;

    positions.push(classifyPly(i + 1, played, current, next));
    current = next;
  }

  return positions;
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

  const firstMove = replay.moves[0];
  if (!firstMove) {
    yield { type: "done", positions: [] };
    return;
  }

  const evaluator = await RetryingEvaluator.create(makeSession, depth, timeoutMs);
  try {
    const positions: GradedPly[] = [];
    let current = await evaluator.evaluate(firstMove.fenBefore);

    for (let i = 0; i < total; i++) {
      const played = replay.moves[i]!;
      const isLast = i === total - 1;

      let next: RawEval;
      if (isLast && replay.finalPosition.isEnd()) {
        next = { score: terminalScoreOf(replay.finalPosition), bestMove: null };
      } else {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one engine session; each position depends on the last one having been replayed
        next = await evaluator.evaluate(played.fenAfter);
      }

      const position = classifyPly(i + 1, played, current, next);
      positions.push(position);
      yield { type: "position", index: i, total, position };

      current = next;
    }

    yield { type: "done", positions };
  } finally {
    evaluator.quit();
  }
}
