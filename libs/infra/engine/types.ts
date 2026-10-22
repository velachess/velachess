/**
 * UCI protocol vocabulary — how long to search, what a position evaluation
 * looks like, what the engine settles on. No I/O, no process, no browser
 * globals — just shapes.
 */

export type GoMode =
  | { kind: "depth"; depth: number }
  | { kind: "movetime"; movetimeMs: number }
  | { kind: "nodes"; nodes: number }
  | { kind: "infinite" };

export interface EngineScore {
  cp?: number;
  mate?: number;
}

/** One parsed `info` line — a snapshot of the engine's thinking so far. */
export interface EngineUpdate {
  depth: number;
  multipv: number;
  score: EngineScore;
  pv: string[];
  nodes?: number;
  nps?: number;
  time?: number;
}

/** A parsed `bestmove` line. `move` is `"(none)"` when there's no legal
 * move. The engine's `ponder` suggestion is not kept: nothing here sends
 * `ponderhit`, and `Ponder` is never set. */
export interface BestMove {
  move: string;
}

export interface EngineOption {
  name: string;
  value: string | number | boolean;
}

/** What one completed search settled on. `bestMove` is null when the
 * transport's line stream ended before the engine answered — a dead
 * process or worker. */
export interface SearchOutcome {
  /** Last `info` line at `multipv 1`, absent when the engine said nothing. */
  lastInfo?: EngineUpdate;
  bestMove: BestMove | null;
}
