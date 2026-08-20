import { TRANSPOSITION_REPERTOIRE_PGN } from "@velachess/fixtures";
import { type Game, type PgnNodeData, parsePgn } from "@velachess/chess";
import { describe, expect, it } from "vitest";

import { buildPositionIndex } from "../position-index.ts";
import { buildRepertoireTree } from "../tree.ts";

function firstGame(pgn: string): Game<PgnNodeData> {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error("expected at least one game");
  return game;
}

describe("buildPositionIndex", () => {
  it("groups nodes that transpose into the same position under one key", () => {
    const { tree } = buildRepertoireTree(
      firstGame(TRANSPOSITION_REPERTOIRE_PGN),
    ).unwrap();
    const index = buildPositionIndex(tree);

    // e4 e5 Nf3 (mainline) and Nf3 e5 e4 (sideline) reach the same position.
    const mainlineNf3 = tree.children[0]?.children[0]?.children[0]; // e4 -> e5 -> Nf3
    const sidelineE4 = tree.children[1]?.children[0]?.children[0]; // Nf3 -> e5 -> e4
    expect(mainlineNf3?.data.san).toBe("Nf3");
    expect(sidelineE4?.data.san).toBe("e4");
    expect(mainlineNf3?.data.positionKey).toBe(sidelineE4?.data.positionKey);

    const twins = index.get(mainlineNf3?.data.positionKey ?? "");
    expect(twins).toHaveLength(2);
    expect([...(twins ?? [])].map((t) => t.data.san).toSorted()).toEqual(["Nf3", "e4"]);
  });

  it("keeps distinct positions in separate buckets", () => {
    const { tree } = buildRepertoireTree(
      firstGame(TRANSPOSITION_REPERTOIRE_PGN),
    ).unwrap();
    const index = buildPositionIndex(tree);

    expect(index.size).toBeGreaterThan(1);
    for (const bucket of index.values()) {
      const keys = new Set(bucket.map((n) => n.data.positionKey));
      expect(keys.size).toBe(1); // every node in a bucket really does share one position
    }
  });
});
