import { describe, expect, it } from "vitest";

import {
  buildGoCommand,
  buildPositionCommand,
  buildSetOptionCommand,
  parseBestMoveLine,
  parseInfoLine,
} from "@velachess/engine";

describe("buildGoCommand", () => {
  it("builds depth, movetime, nodes, and infinite", () => {
    expect(buildGoCommand({ kind: "depth", depth: 18 })).toBe("go depth 18");
    expect(buildGoCommand({ kind: "movetime", movetimeMs: 1000 })).toBe(
      "go movetime 1000",
    );
    expect(buildGoCommand({ kind: "nodes", nodes: 500_000 })).toBe("go nodes 500000");
    expect(buildGoCommand({ kind: "infinite" })).toBe("go infinite");
  });
});

describe("buildPositionCommand", () => {
  it("omits moves when there are none", () => {
    expect(buildPositionCommand("startpos-fen")).toBe("position fen startpos-fen");
  });

  it("appends moves when present", () => {
    expect(buildPositionCommand("startpos-fen", ["e2e4", "e7e5"])).toBe(
      "position fen startpos-fen moves e2e4 e7e5",
    );
  });
});

describe("buildSetOptionCommand", () => {
  it("formats name/value", () => {
    expect(buildSetOptionCommand("MultiPV", 3)).toBe("setoption name MultiPV value 3");
  });
});

describe("parseInfoLine", () => {
  // Real line captured from a running Stockfish 18 Lite process.
  const realLine =
    "info depth 8 seldepth 12 multipv 1 score cp 21 nodes 2937 nps 77289 hashfull 0 time 38 pv e2e4 e7e6 d2d4 d7d5 e4d5 e6d5 d1e2 f8e7";

  it("parses a real analysis line", () => {
    expect(parseInfoLine(realLine)).toEqual({
      depth: 8,
      multipv: 1,
      score: { cp: 21 },
      pv: ["e2e4", "e7e6", "d2d4", "d7d5", "e4d5", "e6d5", "d1e2", "f8e7"],
      nodes: 2937,
      nps: 77289,
      time: 38,
    });
  });

  it("parses mate scores", () => {
    const line = "info depth 3 multipv 1 score mate 2 nodes 100 pv h5f7 e8d7 f7d5";
    expect(parseInfoLine(line)?.score).toEqual({ mate: 2 });
  });

  it("defaults multipv to 1 when absent", () => {
    const line = "info depth 3 score cp 10 pv e2e4";
    expect(parseInfoLine(line)?.multipv).toBe(1);
  });

  it("ignores upperbound/lowerbound scores — a bound isn't a settled evaluation", () => {
    // Format per the UCI spec: emitted during aspiration-window re-search.
    const upper =
      "info depth 12 seldepth 18 multipv 1 score cp 34 upperbound nodes 50000 nps 500000 time 100 pv e2e4";
    const lower =
      "info depth 12 seldepth 18 multipv 1 score cp 34 lowerbound nodes 50000 nps 500000 time 100 pv e2e4";
    expect(parseInfoLine(upper)).toBeNull();
    expect(parseInfoLine(lower)).toBeNull();
  });

  it("ignores info string lines", () => {
    const line = "info string NNUE evaluation using nn-9067e33176e8.nnue (11MiB)";
    expect(parseInfoLine(line)).toBeNull();
  });

  it("ignores non-info lines", () => {
    expect(parseInfoLine("readyok")).toBeNull();
  });

  it("ignores info lines missing a score", () => {
    expect(parseInfoLine("info depth 3 pv e2e4")).toBeNull();
  });
});

describe("parseBestMoveLine", () => {
  it("parses a bestmove with ponder", () => {
    expect(parseBestMoveLine("bestmove e2e4 ponder e7e6")).toEqual({
      move: "e2e4",
      ponder: "e7e6",
    });
  });

  it("parses a bestmove without ponder", () => {
    expect(parseBestMoveLine("bestmove e2e4")).toEqual({ move: "e2e4" });
  });

  it("parses (none) — no legal move, e.g. checkmate/stalemate", () => {
    expect(parseBestMoveLine("bestmove (none)")).toEqual({ move: "(none)" });
  });

  it("returns null for non-bestmove lines", () => {
    expect(parseBestMoveLine("info depth 3 pv e2e4")).toBeNull();
  });
});
