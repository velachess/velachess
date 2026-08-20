import { FOOLS_MATE_PGN, ILLEGAL_MOVE_PGN, MULTI_GAME_PGN } from "@velachess/fixtures";
import { describe, expect, it } from "vitest";

import {
  type Game,
  type PgnNodeData,
  parseComment,
  parsePgn,
  replayMainline,
  startingPosition,
} from "@velachess/chess";

function firstGame(pgn: string): Game<PgnNodeData> {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error("expected at least one game");
  return game;
}

describe("parsePgn", () => {
  it("parses headers and the mainline", () => {
    const game = firstGame(FOOLS_MATE_PGN);
    expect(game.headers.get("Result")).toBe("0-1");
    expect([...game.moves.mainline()].map((n) => n.san)).toEqual([
      "f3",
      "e5",
      "g4",
      "Qh4#",
    ]);
  });

  it("parses a multi-game PGN into separate games", () => {
    const games = parsePgn(MULTI_GAME_PGN);
    expect(games).toHaveLength(2);
    expect(games[0]?.headers.get("Event")).toBe("Fool's Mate");
    expect(games[1]?.headers.get("Event")).toBe("Unfinished");
  });
});

describe("startingPosition", () => {
  it("defaults to the standard starting position when there's no FEN header", () => {
    const game = firstGame(FOOLS_MATE_PGN);
    const pos = startingPosition(game.headers).unwrap();
    expect(pos.turn).toBe("white");
  });
});

describe("replayMainline", () => {
  it("validates a fully legal game and reaches checkmate", () => {
    const game = firstGame(FOOLS_MATE_PGN);
    const replay = replayMainline(game).unwrap();

    expect(replay.legal).toBe(true);
    expect(replay.moves).toHaveLength(4);
    expect(replay.finalPosition.isCheckmate()).toBe(true);
  });

  it("stops at the first illegal move", () => {
    const game = firstGame(ILLEGAL_MOVE_PGN);
    const replay = replayMainline(game).unwrap();

    expect(replay.legal).toBe(false);
    expect(replay.moves).toHaveLength(2); // e4, e5 — Ra3 never gets played
    expect(replay.moves.map((m) => m.san)).toEqual(["e4", "e5"]);
  });

  it("records each move's FEN before and after", () => {
    const game = firstGame(FOOLS_MATE_PGN);
    const replay = replayMainline(game).unwrap();

    expect(replay.moves[0]?.fenBefore).toContain(" w ");
    expect(replay.moves[0]?.fenAfter).toContain(" b ");
  });
});

describe("parseComment", () => {
  // Takes comment *content*, braces already stripped — same as what the PGN
  // parser hands to it (game.moves.mainline()[i].comments), not raw "{ ... }".

  it("extracts a clock annotation", () => {
    const comment = parseComment("[%clk 0:09:56.3]");
    expect(comment.clock).toBeCloseTo(596.3, 1);
  });

  it("leaves plain text untouched", () => {
    const comment = parseComment("Great move!");
    expect(comment.text).toBe("Great move!");
    expect(comment.clock).toBeUndefined();
  });

  it("extracts a clock annotation parsed from a real game's comment", () => {
    const game = firstGame('[Result "*"]\n\n1. e4 { [%clk 0:09:56.3] } *');
    const [node] = [...game.moves.mainline()];
    const comment = parseComment(node?.comments?.[0] ?? "");
    expect(comment.clock).toBeCloseTo(596.3, 1);
  });
});
