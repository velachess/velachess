import {
  RUY_LOPEZ_MULTI_CHOICE_PGN,
  RUY_LOPEZ_REPERTOIRE_PGN,
  TRANSPOSITION_REPERTOIRE_PGN,
} from "@velachess/fixtures";
import { type Game, type PgnNodeData, parsePgn } from "@velachess/chess";
import { buildRepertoire } from "@velachess/repertoires";
import { describe, expect, it } from "vitest";

import { decisionPositionsOf } from "../decision-positions.ts";

function repertoireOf(pgn: string) {
  const game = parsePgn(pgn)[0] as Game<PgnNodeData>;
  return buildRepertoire(game).unwrap();
}

describe("decisionPositionsOf", () => {
  // 1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 Nc6 3. Bb5 a6 4. Ba4
  const ruyLopez = repertoireOf(RUY_LOPEZ_REPERTOIRE_PGN);

  it("finds every position where the owner has a prepared response", () => {
    const positions = decisionPositionsOf(ruyLopez, "white");

    // Start, after 1...e5, after 1...c5, after 2...Nc6, after 3...a6 —
    // and nothing after 2...d6, where the Sicilian line simply ends.
    expect(positions).toHaveLength(5);
    expect(positions.map((p) => p.expectedSans)).toEqual([
      ["e4"],
      ["Nf3"],
      ["Bb5"],
      ["Ba4"],
      ["Nf3"],
    ]);
  });

  it("keeps the path that reaches each decision, for replay onto a board", () => {
    const positions = decisionPositionsOf(ruyLopez, "white");
    const start = positions.find((p) => p.path.length === 0);
    const sicilian = positions.find((p) => p.path.join(" ") === "e4 c5");

    expect(start?.ply).toBe(1);
    expect(sicilian?.expectedSans).toEqual(["Nf3"]);
    expect(sicilian?.ply).toBe(3);
  });

  it("is a different set of decisions for the other side", () => {
    const positions = decisionPositionsOf(ruyLopez, "black");

    // After 1.e4 the tree prepares both 1...e5 and 1...c5 — one decision
    // with two acceptable answers, not two decisions.
    const afterE4 = positions.find((p) => p.path.join(" ") === "e4");
    expect(afterE4?.expectedSans).toEqual(["e5", "c5"]);
    expect(positions).toHaveLength(4);
  });

  it("merges alternative moves at one position into one decision", () => {
    // 1. e4 e5 2. Nf3 (2. Bc4)
    const positions = decisionPositionsOf(
      repertoireOf(RUY_LOPEZ_MULTI_CHOICE_PGN),
      "white",
    );

    const afterE5 = positions.find((p) => p.path.join(" ") === "e4 e5");
    expect(afterE5?.expectedSans).toEqual(["Nf3", "Bc4"]);
    expect(positions).toHaveLength(2);
  });

  it("collapses transpositions into a single decision position", () => {
    // 1. e4 (1. Nf3 e5 2. e4) e5 2. Nf3 Nc6 — both move orders reach the
    // same position after two white moves; the tree prepares Nc6 there
    // only under the mainline, and the transposed branch must see it too.
    const positions = decisionPositionsOf(
      repertoireOf(TRANSPOSITION_REPERTOIRE_PGN),
      "black",
    );

    const keys = positions.map((p) => p.positionKey);
    expect(new Set(keys).size).toBe(keys.length);

    const transposed = positions.find((p) => p.expectedSans.includes("Nc6"));
    expect(transposed).toBeDefined();
    expect(
      positions.filter((p) => p.positionKey === transposed!.positionKey),
    ).toHaveLength(1);
  });

  it("offers both first moves at the start when the tree branches there", () => {
    const positions = decisionPositionsOf(
      repertoireOf(TRANSPOSITION_REPERTOIRE_PGN),
      "white",
    );

    const start = positions.find((p) => p.path.length === 0);
    expect(start?.expectedSans).toEqual(["e4", "Nf3"]);
  });
});
