/**
 * A finished report per game, in the app's one IndexedDB. A report is an
 * optimization, so every operation here degrades to "no storage" rather
 * than failing the analysis that asked for it.
 */
import type { GradedPly } from "@velachess/analysis";

import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "../../libs/idb.ts";

import { ANALYSIS_IDENTITY, type GameAnalysisReport } from "./types.ts";

interface AnalysisDbSchema extends DBSchema {
  report: { key: string; value: GameAnalysisReport };
}

const DB_NAME = "velachess-analysis";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<AnalysisDbSchema>> | undefined;
let erased = false;

function openAnalysisDb(): Promise<IDBPDatabase<AnalysisDbSchema>> {
  if (erased) return Promise.reject(new Error("analysis storage was erased in this tab"));
  // Cleared on failure: a memoized rejection would keep storage off for
  // the life of the tab.
  dbPromise ??= openDB<AnalysisDbSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("report", { keyPath: "gameId" });
    },
    // Another tab deleting the database waits on every open connection.
    blocking() {
      void closeAnalysisDb();
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
    stored.engineBuild === ANALYSIS_IDENTITY.engineBuild &&
    stored.depth === ANALYSIS_IDENTITY.depth &&
    stored.policyVersion === ANALYSIS_IDENTITY.policyVersion;

  return producedByThisBuild ? stored : null;
}

export async function saveReport(
  gameId: string,
  graded: readonly GradedPly[],
): Promise<void> {
  const report: GameAnalysisReport = {
    gameId,
    ...ANALYSIS_IDENTITY,
    graded: [...graded],
  };

  try {
    await (await openAnalysisDb()).put("report", report);
  } catch (error) {
    // A refused write must not fail an analysis that already finished.
    console.warn("Failed to persist game analysis report", error);
  }
}

async function closeAnalysisDb(): Promise<void> {
  const opening = dbPromise;
  dbPromise = undefined;
  await opening?.then((db) => db.close()).catch(() => {});
}

/**
 * Every report on this device, for when the account they came from is gone.
 * Storage stays off in this tab afterwards: a pass still running would
 * otherwise write its report back.
 */
export async function eraseAnalysisReports(): Promise<void> {
  erased = true;
  await closeAnalysisDb();
  await new Promise<void>((resolve) => {
    // A tab that never closes its connection keeps the delete queued; the
    // caller stops waiting rather than hanging on it.
    deleteDB(DB_NAME, { blocked: () => resolve() }).then(resolve, (error: unknown) => {
      console.warn("Failed to delete stored game analysis reports", error);
      resolve();
    });
  });
}

export async function resetAnalysisDbForTests(): Promise<void> {
  erased = false;
  await closeAnalysisDb();
  await deleteDB(DB_NAME);
}
