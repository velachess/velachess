import {
  RUY_LOPEZ_MULTI_CHOICE_PGN,
  RUY_LOPEZ_REPERTOIRE_PGN,
  TRANSPOSITION_REPERTOIRE_PGN,
} from "@velachess/fixtures";
import { type Game, type PgnNodeData, parsePgn } from "@velachess/chess";
import { describe, expect, it } from "vitest";

import { buildRepertoire } from "../../repertoire.ts";
import { chapterView } from "../chapter-view.ts";

function viewOf(pgn: string, color: "white" | "black" = "white") {
  const game = parsePgn(pgn)[0] as Game<PgnNodeData>;
  return chapterView(buildRepertoire(game).unwrap(), color);
}

describe("chapterView", () => {
  // 1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 Nc6 3. Bb5 a6 4. Ba4
  const ruyLopez = viewOf(RUY_LOPEZ_REPERTOIRE_PGN);

  it("renders the mainline flat, with PGN numbering already resolved", () => {
    const mainline = ruyLopez.lines[0]!;

    expect(mainline.depth).toBe(0);
    expect(mainline.branchesFrom).toBeNull();
    expect(mainline.moves.map((move) => move.label)).toEqual([
      "1. e4",
      "e5",
      "2. Nf3",
      "Nc6",
      "3. Bb5",
      "a6",
      "4. Ba4",
    ]);
  });

  it("gives a variation its own line, numbered from where it branches", () => {
    const variation = ruyLopez.lines[1]!;

    expect(variation.depth).toBe(1);
    // It replaces 1... e5, the second move of the mainline.
    expect(variation.branchesFrom).toEqual({ line: 0, move: 1 });
    expect(variation.moves.map((move) => move.label)).toEqual([
      "1... c5",
      "2. Nf3",
      "d6",
    ]);
    // The trail into it is ready to render: 1. e4 came before.
    expect(variation.prefix.map((entry) => entry.label)).toEqual(["1. e4"]);
  });

  it("ships each move board-ready: fen, squares and whose turn it is", () => {
    const [e4, e5] = ruyLopez.lines[0]!.moves;

    expect(e4!.from).toBe("e2");
    expect(e4!.to).toBe("e4");
    expect(e4!.fen).toContain(" b ");
    // After 1. e4 it is Black's move, so a White book is not on turn.
    expect(e4!.isOwnTurn).toBe(false);
    expect(e5!.isOwnTurn).toBe(true);
    expect(e5!.ply).toBe(2);
  });

  it("answers each position with what the book plays, and where it lands", () => {
    const start = ruyLopez.start;
    expect(start.isOwnTurn).toBe(true);
    expect(start.prepared.map((move) => move.san)).toEqual(["e4"]);
    expect(start.prepared[0]!.at).toEqual({ line: 0, move: 0 });

    // After 1. e4 the book prepares both replies — the mainline's and
    // the variation's — each pointing at its own line.
    const afterE4 = ruyLopez.lines[0]!.moves[0]!;
    expect(afterE4.prepared.map((move) => move.san)).toEqual(["e5", "c5"]);
    expect(afterE4.prepared.map((move) => move.at)).toEqual([
      { line: 0, move: 1 },
      { line: 1, move: 0 },
    ]);
  });

  it("says nothing is prepared where the line ends", () => {
    const mainline = ruyLopez.lines[0]!;
    expect(mainline.moves.at(-1)!.prepared).toEqual([]);
  });

  it("keeps alternatives at one position as one branch point", () => {
    // 1. e4 e5 2. Nf3 (2. Bc4)
    const view = viewOf(RUY_LOPEZ_MULTI_CHOICE_PGN);

    expect(view.lines).toHaveLength(2);
    expect(view.lines[0]!.moves.map((move) => move.label)).toEqual([
      "1. e4",
      "e5",
      "2. Nf3",
    ]);
    expect(view.lines[1]!.moves.map((move) => move.label)).toEqual(["2. Bc4"]);
    expect(view.lines[1]!.branchesFrom).toEqual({ line: 0, move: 2 });
  });

  it("shows a transposed position the continuations prepared elsewhere", () => {
    // 1. e4 (1. Nf3 e5 2. e4) e5 2. Nf3 Nc6 — the transposed branch
    // reaches the mainline's position and must offer Nc6 there too.
    const view = viewOf(TRANSPOSITION_REPERTOIRE_PGN, "black");
    const transposition = view.lines.find((line) => line.depth > 0)!;

    expect(transposition.moves.map((move) => move.san)).toContain("Nf3");
    const last = transposition.moves.at(-1)!;
    expect(last.prepared.map((move) => move.san)).toContain("Nc6");
  });
});
