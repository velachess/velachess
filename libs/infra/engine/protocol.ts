/**
 * UCI wire format — building commands and reading the engine's replies.
 * Pure string in, parsed value (or null for lines that aren't one of ours)
 * out. No process, no transport, testable with plain strings.
 */

import type { BestMove, EngineUpdate, GoMode } from "./types.ts";

export function buildGoCommand(mode: GoMode): string {
  switch (mode.kind) {
    case "depth":
      return `go depth ${mode.depth}`;
    case "movetime":
      return `go movetime ${mode.movetimeMs}`;
    case "nodes":
      return `go nodes ${mode.nodes}`;
    case "infinite":
      return "go infinite";
  }
}

export function buildPositionCommand(fen: string, moves: string[] = []): string {
  return moves.length === 0
    ? `position fen ${fen}`
    : `position fen ${fen} moves ${moves.join(" ")}`;
}

export function buildSetOptionCommand(
  name: string,
  value: string | number | boolean,
): string {
  return `setoption name ${name} value ${value}`;
}

/**
 * Parses an `info` line into an EngineUpdate. Null for anything not a
 * settled scored line — `info string`, missing depth/score/pv, or an
 * `upperbound`/`lowerbound` (an aspiration-window re-search bound, not
 * a real evaluation).
 */
export function parseInfoLine(line: string): EngineUpdate | null {
  if (!line.startsWith("info ") || line.includes(" string ")) return null;
  if (line.includes(" upperbound") || line.includes(" lowerbound")) return null;

  const depth = line.match(/(?:^| )depth (?<depth>\d+)/)?.groups?.["depth"];
  const multipv = line.match(/ multipv (?<multipv>\d+)/)?.groups?.["multipv"];
  const cp = line.match(/ score cp (?<cp>-?\d+)/)?.groups?.["cp"];
  const mate = line.match(/ score mate (?<mate>-?\d+)/)?.groups?.["mate"];
  const pv = line.match(/ pv (?<pv>.+)$/)?.groups?.["pv"];
  const nodes = line.match(/ nodes (?<nodes>\d+)/)?.groups?.["nodes"];
  const nps = line.match(/ nps (?<nps>\d+)/)?.groups?.["nps"];
  const time = line.match(/ time (?<time>\d+)/)?.groups?.["time"];

  if (!depth || !pv || (!cp && !mate)) return null;

  const update: EngineUpdate = {
    depth: Number(depth),
    multipv: multipv ? Number(multipv) : 1,
    score: mate ? { mate: Number(mate) } : { cp: Number(cp) },
    pv: pv.trim().split(" "),
  };
  if (nodes) update.nodes = Number(nodes);
  if (nps) update.nps = Number(nps);
  if (time) update.time = Number(time);
  return update;
}

export function parseBestMoveLine(line: string): BestMove | null {
  const groups = line.match(/^bestmove (?<move>\S+)(?: ponder (?<ponder>\S+))?/)?.groups;
  const move = groups?.["move"];
  if (!move) return null;

  const ponder = groups["ponder"];
  return ponder ? { move, ponder } : { move };
}
