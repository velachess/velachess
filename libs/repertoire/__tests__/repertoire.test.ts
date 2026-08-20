import { ILLEGAL_REPERTOIRE_PGN, RUY_LOPEZ_REPERTOIRE_PGN } from "@velachess/fixtures";
import { type Game, type PgnNodeData, parsePgn } from "@velachess/chess";
import { describe, expect, it } from "vitest";

import { buildRepertoire } from "../repertoire.ts";

function firstGame(pgn: string): Game<PgnNodeData> {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error("expected at least one game");
  return game;
}

describe("buildRepertoire", () => {
  it("bundles a tree with its own position index, always in sync", () => {
    const repertoire = buildRepertoire(firstGame(RUY_LOPEZ_REPERTOIRE_PGN)).unwrap();

    const afterE4 = repertoire.tree.children[0];
    expect(repertoire.index.get(afterE4?.data.positionKey ?? "")).toEqual([afterE4]);
    expect(repertoire.illegalMoves).toEqual([]);
  });

  it("surfaces illegal branches alongside the tree and index", () => {
    const repertoire = buildRepertoire(firstGame(ILLEGAL_REPERTOIRE_PGN)).unwrap();

    expect(repertoire.illegalMoves).toHaveLength(1);
    expect(repertoire.illegalMoves[0]?.san).toBe("Ra6");
  });
});
