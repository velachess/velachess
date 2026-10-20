import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { POLICY_VERSION } from "@velachess/analysis";

import { openDB } from "../../../libs/idb.ts";
import { aGradedPly } from "../../../test/games.ts";
import { ENGINE_BUILD } from "../../../engine/index.ts";
import {
  getReport,
  resetAnalysisDbForTests,
  saveReport,
  type GameAnalysisReport,
} from "../analysis-db.ts";
import { ANALYSIS_DEPTH } from "../evaluate-position-in-browser.ts";

afterEach(async () => {
  vi.restoreAllMocks();
  await resetAnalysisDbForTests();
});

const DB_NAME = "velachess-analysis";
const GRADED = [aGradedPly(1), aGradedPly(2)];

/** Writes a record this build would not have produced, straight past
 * `saveReport` — which always stamps the current settings. */
async function seedRaw(report: GameAnalysisReport): Promise<void> {
  const db = await openDB(DB_NAME, 1, {
    // The module under test may not have opened the database yet, so this
    // is the open that has to create the store.
    upgrade(database) {
      database.createObjectStore("report", { keyPath: "gameId" });
    },
  });
  await db.put("report", report);
  db.close();
}

/** Every path into the database starts at `indexedDB.open`, so this is the
 * one place "IndexedDB is unavailable" has to be simulated. */
function breakStorage(): void {
  vi.spyOn(indexedDB, "open").mockImplementation(() => {
    throw new DOMException("denied", "SecurityError");
  });
}

function aReport(overrides: Partial<GameAnalysisReport> = {}): GameAnalysisReport {
  return {
    gameId: "game-1",
    engineBuild: ENGINE_BUILD,
    depth: ANALYSIS_DEPTH,
    policyVersion: POLICY_VERSION,
    graded: GRADED,
    ...overrides,
  };
}

describe("stored reports", () => {
  it("misses for a game never analyzed", async () => {
    await expect(getReport("game-1")).resolves.toBeNull();
  });

  it("round-trips the whole document, stamped with what produced it", async () => {
    await saveReport("game-1", GRADED);

    await expect(getReport("game-1")).resolves.toEqual({
      gameId: "game-1",
      engineBuild: ENGINE_BUILD,
      depth: ANALYSIS_DEPTH,
      policyVersion: POLICY_VERSION,
      graded: GRADED,
    });
  });

  it("keeps one report per game — re-analyzing replaces the last one", async () => {
    await saveReport("game-1", GRADED);
    const regraded = [aGradedPly(1, { category: "blunder" })];
    await saveReport("game-1", regraded);

    const stored = await getReport("game-1");
    expect(stored?.graded).toEqual(regraded);
  });

  it("answers for the game it was asked about and no other", async () => {
    await saveReport("game-1", GRADED);

    await expect(getReport("game-2")).resolves.toBeNull();
  });
});

describe("report invalidation", () => {
  it("misses a report graded by another engine build", async () => {
    await seedRaw(aReport({ engineBuild: "stockfish-18-lite" }));

    await expect(getReport("game-1")).resolves.toBeNull();
  });

  it("misses a report graded at another depth", async () => {
    await seedRaw(aReport({ depth: ANALYSIS_DEPTH + 2 }));

    await expect(getReport("game-1")).resolves.toBeNull();
  });

  it("misses a report graded under an older classification policy", async () => {
    await seedRaw(aReport({ policyVersion: POLICY_VERSION - 1 }));

    await expect(getReport("game-1")).resolves.toBeNull();
  });
});

describe("storage that refuses", () => {
  it("reads as a miss rather than throwing, so the analysis can run", async () => {
    breakStorage();

    await expect(getReport("game-1")).resolves.toBeNull();
  });

  it("completes a write it could not perform, so a finished analysis stands", async () => {
    breakStorage();

    await expect(saveReport("game-1", GRADED)).resolves.toBeUndefined();
  });

  it("stores again once the database is available, having cached no failure", async () => {
    breakStorage();
    await saveReport("game-1", GRADED);
    vi.restoreAllMocks();

    await saveReport("game-1", GRADED);
    await expect(getReport("game-1")).resolves.not.toBeNull();
  });
});
