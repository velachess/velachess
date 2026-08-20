/**
 * The two guarantees of the engine drill path, checked directly.
 *
 * They were not covered before, and it mattered: breaking either of them
 * left the end-to-end test green, because that fixture happens to hold a
 * single blunder, on the right side, triaged once. Both mutations
 * survived — which is a test suite saying it does not care.
 */
import type { EngineDrillCandidate, StoredGradedPly } from "@velachess/db";
import { describe, expect, it } from "vitest";

import { seedsFor } from "../seed-exercises.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
/** Position after 1.e4, so it is Black to move and `d7d5` is legal. */
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function ply(overrides: Partial<StoredGradedPly> = {}): StoredGradedPly {
  return {
    ply: 1,
    fen: START,
    san: "a3",
    evalBefore: { cp: 0 },
    evalAfter: { cp: -300 },
    bestMove: "e2e4",
    category: "blunder",
    winChanceLoss: 0.4,
    ...overrides,
  };
}

function analysis(overrides: Partial<EngineDrillCandidate> = {}): EngineDrillCandidate {
  return {
    gameId: "game-1",
    perspective: "white",
    plies: [],
    alreadySeeded: new Set(),
    ...overrides,
  };
}

describe("seedsFor", () => {
  it("drills the user's own mistake", () => {
    const seeds = seedsFor(analysis({ perspective: "white", plies: [ply({ ply: 1 })] }));

    expect(seeds).toHaveLength(1);
    expect(seeds[0]!.origin).toEqual({
      kind: "engine-blunder",
      gameId: "game-1",
      ply: 1,
    });
    expect(seeds[0]!.expectedSans).toEqual(["e4"]);
  });

  it("leaves the opponent's mistakes alone", () => {
    // Ply 2 is Black's. Practising it would teach the user to play the
    // other side of their own game.
    const seeds = seedsFor(
      analysis({
        perspective: "white",
        plies: [ply({ ply: 2, fen: AFTER_E4, bestMove: "d7d5" })],
      }),
    );

    expect(seeds).toEqual([]);
  });

  it("keeps only the user's side when both blundered", () => {
    const seeds = seedsFor(
      analysis({
        perspective: "black",
        plies: [ply({ ply: 1 }), ply({ ply: 2, fen: AFTER_E4, bestMove: "d7d5" })],
      }),
    );

    expect(seeds.map((s) => s.origin)).toEqual([
      { kind: "engine-blunder", gameId: "game-1", ply: 2 },
    ]);
  });

  it("does not seed a ply that already became an exercise", () => {
    // Triage runs after every analysis and the same game is reachable
    // more than once; without this, one blunder becomes N provenances of
    // the same exercise, and the count beside the CTA drifts upward.
    const seeds = seedsFor(
      analysis({ plies: [ply({ ply: 1 })], alreadySeeded: new Set([1]) }),
    );

    expect(seeds).toEqual([]);
  });

  it("has nothing to attribute when the side is unknown", () => {
    expect(seedsFor(analysis({ perspective: null, plies: [ply({ ply: 1 })] }))).toEqual(
      [],
    );
  });

  it("ignores moves that were fine", () => {
    expect(
      seedsFor(
        analysis({
          plies: [
            ply({ ply: 1, category: "best", winChanceLoss: 0 }),
            ply({ ply: 3, category: "good", winChanceLoss: 0.01 }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("declines a ply whose best move does not fit its position", () => {
    // A record drifted from its FEN would otherwise become an exercise
    // whose correct answer is illegal on the board it shows.
    expect(seedsFor(analysis({ plies: [ply({ ply: 1, bestMove: "e7e5" })] }))).toEqual(
      [],
    );
  });
});
