// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createUser, schema, upsertTrackedAccount } from "@velachess/db";
import type { StoredGradedPly } from "@velachess/db";
import { createLoopHarness, type LoopHarness } from "@velachess/test-utils";

import { listInsights } from "../get-insights.ts";

/**
 * The merge, over a real database: sources with nothing in common —
 * per-game results, per-move grades — land in one list, ranked by one
 * rule. The sources' own arithmetic is pinned in sources.test.ts; what
 * this owns is that heterogeneous findings actually coexist and that
 * the order is the global one.
 */

let harness: LoopHarness;
let userId: string;

/** Two phases the classifier will separate, so per-phase rates exist. */
const MIDDLEGAME_FEN = "r1bqkb1r/pppppppp/8/8/8/8/PPPPPPPP/R1BQKB1R w - - 0 1";
const ENDGAME_FEN = "4k3/1r6/8/8/8/8/6R1/4K3 w - - 0 1";

/** 15 middlegame own plies (2 blunders) + 10 clean endgame ones: the
 * blunders concentrate in one phase instead of tracking exposure. */
function gradedPlies(blunders: number): StoredGradedPly[] {
  return Array.from({ length: 25 }, (_, index) => ({
    ply: index * 2 + 1,
    fen: index < 15 ? MIDDLEGAME_FEN : ENDGAME_FEN,
    san: "Nf3",
    evalBefore: { cp: 250 },
    evalAfter: { cp: index < blunders ? -50 : 250 },
    bestMove: "g1f3",
    category: index < blunders ? ("blunder" as const) : ("good" as const),
    winChanceLoss: index < blunders ? 0.35 : 0,
  }));
}

beforeAll(async () => {
  harness = await createLoopHarness();
  userId = (await createUser(harness.db)).id;
  const account = await upsertTrackedAccount(harness.db, userId, "chess_com", "looper");

  // Forty dated games: the older twenty lost, the newer twenty won —
  // the trend source's exact trigger. Five of the losses share an
  // opening, which is the weakness source's trigger against a baseline
  // the wins lift. Stored the way chess.com actually arrives — no
  // `Opening` header, only an ECOUrl, and no perspective either: synced
  // games never write one, "you" comes from the tracked username at
  // read time. A fixture that declared these would let both read-path
  // derivations silently break (no openings; every game a loss).
  for (let index = 0; index < 40; index++) {
    const losing = index < 20;
    const sicilian = losing && index < 5;
    const [game] = await harness.db
      .insert(schema.games)
      .values({
        userId,
        accountId: account.id,
        source: "chess_com",
        perspective: null,
        whiteName: "Looper",
        blackName: "rival",
        result: losing ? "0-1" : "1-0",
        playedAt: new Date(Date.UTC(2026, 0, 1) + index * 86_400_000),
        whiteRating: 1500 + index,
        blackRating: 1500,
        openingName: null,
        openingUrl: sicilian
          ? "https://www.chess.com/openings/Sicilian-Defense-Bowdler-Attack-2.Bc4-e6"
          : "https://www.chess.com/openings/Italian-Game-3.Bc4",
        openingEco: sicilian ? "B20" : "C50",
        hasClocks: false,
        rawPgn: "1. e4 *",
        movetextHash: `insights-${index}`,
      })
      .returning();

    // Analyse a handful: enough own moves in one phase for the per-move
    // sources to clear their floors.
    if (index % 4 === 0) {
      await harness.db.insert(schema.gameAnalyses).values({
        gameId: game!.id,
        engineVersion: "test",
        depth: 8,
        positions: gradedPlies(2),
      });
    }
  }
});

afterAll(() => harness.close());

describe("listInsights over every source", () => {
  it("returns heterogeneous findings, globally ranked", async () => {
    const report = await listInsights(harness.db, userId);
    const { findings } = report;

    // The envelope answers even before any finding does: the dataset's
    // coverage is response-level, stated once.
    expect(report.coverage).toEqual({
      gamesConsidered: 40,
      deeplyAnalysedGames: 10,
      coverage: 0.25,
    });

    const kinds = new Set(findings.map((finding) => finding.kind));
    expect(kinds).toContain("performance-trend");
    expect(kinds).toContain("opening-weakness");
    expect(kinds).toContain("winning-position-blunders");
    expect(kinds).toContain("recurring-mistake");

    // Every finding carries its section, its evidence tier and its own
    // sample sizes — the global coverage is deliberately NOT repeated on
    // each one; it describes the dataset, not the claim.
    for (const finding of findings) {
      expect(finding.section).toBeTruthy();
      expect(finding.weight).toBeGreaterThan(0);
      expect(Object.keys(finding.evidence).length).toBeGreaterThan(2);
      expect("coverage" in finding).toBe(false);
    }

    // Baseline findings stand on every imported game; engine findings
    // only on the analysed subset — and each says which.
    const byKind = new Map(findings.map((finding) => [finding.kind, finding]));
    expect(byKind.get("performance-trend")?.scope).toBe("all-games");
    expect(byKind.get("opening-weakness")?.scope).toBe("all-games");

    // The weakness names the family derived from the ECOUrl — the games
    // were stored with no opening name at all, as chess.com sends them.
    const weakness = byKind.get("opening-weakness");
    expect(weakness?.kind === "opening-weakness" && weakness.evidence.openingName).toBe(
      "Sicilian Defense",
    );
    expect(byKind.get("recurring-mistake")?.scope).toBe("analysed-games");
    expect(byKind.get("winning-position-blunders")?.scope).toBe("analysed-games");

    // The order is the global ranking, not insertion or section order.
    const weights = findings.map((finding) => finding.weight);
    expect(weights).toEqual(weights.toSorted((a, b) => b - a));
  });
});
