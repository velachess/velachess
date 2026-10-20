/**
 * A finished report per game, in the app's one IndexedDB. A report is an
 * optimization, so every operation here degrades to "no storage" rather
 * than failing the analysis that asked for it.
 */
import { POLICY_VERSION, type GradedPly } from "@velachess/analysis";

import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "../../libs/idb.ts";
import { ENGINE_BUILD } from "../../engine/index.ts";

import { ANALYSIS_DEPTH } from "./evaluate-position-in-browser.ts";

/** Plain JSON, self-describing: the same document a backend would be
 * handed later, which is why what produced it travels with it instead of
 * living in the key. */
export interface GameAnalysisReport {
  gameId: string;
  engineBuild: string;
  depth: number;
  policyVersion: number;
  graded: GradedPly[];
}

interface AnalysisDbSchema extends DBSchema {
  report: { key: string; value: GameAnalysisReport };
}

const DB_NAME = "velachess-analysis";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<AnalysisDbSchema>> | undefined;

function openAnalysisDb(): Promise<IDBPDatabase<AnalysisDbSchema>> {
  // Cleared on failure: a memoized rejection would keep storage off for
  // the life of the tab.
  dbPromise ??= openDB<AnalysisDbSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("report", { keyPath: "gameId" });
    },
  }).catch((error: unknown) => {
    dbPromise = undefined;
    throw error;
  });

  return dbPromise;
}

export async function getReport(gameId: string): Promise<GameAnalysisReport | null> {
  let stored: GameAnalysisReport | undefined;
  try {
    stored = await (await openAnalysisDb()).get("report", gameId);
  } catch {
    return null;
  }
  if (!stored) return null;

  const producedByThisBuild =
    stored.engineBuild === ENGINE_BUILD &&
    stored.depth === ANALYSIS_DEPTH &&
    stored.policyVersion === POLICY_VERSION;

  return producedByThisBuild ? stored : null;
}

export async function saveReport(gameId: string, graded: GradedPly[]): Promise<void> {
  const report: GameAnalysisReport = {
    gameId,
    engineBuild: ENGINE_BUILD,
    depth: ANALYSIS_DEPTH,
    policyVersion: POLICY_VERSION,
    graded,
  };

  try {
    await (await openAnalysisDb()).put("report", report);
  } catch (error) {
    // A refused write must not fail an analysis that already finished.
    console.warn("Failed to persist game analysis report", error);
  }
}

export async function resetAnalysisDbForTests(): Promise<void> {
  const opening = dbPromise;
  dbPromise = undefined;
  await opening?.then((db) => db.close()).catch(() => {});
  await deleteDB(DB_NAME);
}
