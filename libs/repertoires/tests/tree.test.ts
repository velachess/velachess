import {
  ILLEGAL_REPERTOIRE_PGN,
  RUY_LOPEZ_REPERTOIRE_PGN,
  SICILIAN_REPERTOIRE_PGN,
} from "@velachess/fixtures";
import { type Game, type PgnNodeData, parsePgn } from "@velachess/chess";
import { describe, expect, it } from "vitest";

import { buildRepertoireTree } from "../tree.ts";

function firstGame(pgn: string): Game<PgnNodeData> {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error("expected at least one game");
  return game;
}

describe("buildRepertoireTree", () => {
  it("gives the opponent's reply node one child per prepared variation", () => {
    const { tree } = buildRepertoireTree(firstGame(RUY_LOPEZ_REPERTOIRE_PGN)).unwrap();

    expect(tree.children).toHaveLength(1); // 1. e4
    const afterE4 = tree.children[0];
    expect(afterE4?.data.san).toBe("e4");
    expect(afterE4?.children.map((c) => c.data.san)).toEqual(["e5", "c5"]); // mainline + sideline
  });

  it("gives White's own moves exactly one child, by repertoire convention", () => {
    const { tree } = buildRepertoireTree(firstGame(RUY_LOPEZ_REPERTOIRE_PGN)).unwrap();

    const afterE4 = tree.children[0];
    const afterE5 = afterE4?.children.find((c) => c.data.san === "e5");
    expect(afterE5?.children).toHaveLength(1); // 2. Nf3
    expect(afterE5?.children[0]?.data.san).toBe("Nf3");
  });

  it("stamps each node with an EPD position key (no halfmove/fullmove counters)", () => {
    const { tree } = buildRepertoireTree(firstGame(RUY_LOPEZ_REPERTOIRE_PGN)).unwrap();

    const positionKey = tree.children[0]?.data.positionKey;
    expect(positionKey).toBeDefined();
    expect(positionKey?.split(" ")).toHaveLength(4); // board turn castling ep — no halfmove/fullmove
  });

  it("respects a custom starting FEN header instead of assuming the standard start", () => {
    const { tree } = buildRepertoireTree(firstGame(SICILIAN_REPERTOIRE_PGN)).unwrap();

    expect(tree.children.map((c) => c.data.san)).toEqual(["c5"]);
  });

  it("preserves comments and NAGs from the PGN instead of discarding them", () => {
    const { tree } = buildRepertoireTree(
      firstGame('[Result "*"]\n\n1. e4 { the main try } $1 *'),
    ).unwrap();

    expect(tree.children[0]?.data.comments).toEqual(["the main try"]);
    expect(tree.children[0]?.data.nags).toEqual([1]);
  });

  it("reports an illegal branch instead of silently dropping it, without losing its legal sibling", () => {
    const { tree, illegalMoves } = buildRepertoireTree(
      firstGame(ILLEGAL_REPERTOIRE_PGN),
    ).unwrap();

    const afterE4 = tree.children[0];
    expect(afterE4?.children.map((c) => c.data.san)).toEqual(["e5"]); // Ra6 didn't make it into the tree

    expect(illegalMoves).toHaveLength(1);
    expect(illegalMoves[0]?.san).toBe("Ra6");
    expect(illegalMoves[0]?.path).toEqual(["e4"]);
  });
});
