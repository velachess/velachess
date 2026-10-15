/**
 * IndexedDB-backed cache for browser analysis, two stores: `rawEval`
 * (engine output per position, reused across games when an opening
 * repeats) and `report` (a whole game's graded plies, so reopening the
 * same game is an instant read, zero engine work). IndexedDB has no
 * native TTL, so both stores are pruned LRU by `lastAccessed` on write.
 *
 * Every key folds in `engineBuild` (and `report` also folds in
 * `policyVersion`) so swapping the wasm binary or changing the
 * classification policy invalidates the old entries instead of reading
 * a stale score or report back as current.
 */
import type { GradedPly, RawEval } from "@velachess/analysis";

import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "../../libs/idb.ts";

export interface CacheKeyParts {
  depth: number;
  multiPV: number;
  engineBuild: string;
}

interface RawEvalEntry {
  key: string;
  score: RawEval["score"];
  bestMove: string | null;
  lastAccessed: number;
}

interface ReportEntry {
  key: string;
  positions: GradedPly[];
  lastAccessed: number;
}

interface AnalysisCacheSchema extends DBSchema {
  rawEval: {
    key: string;
    value: RawEvalEntry;
    indexes: { lastAccessed: number };
  };
  report: {
    key: string;
    value: ReportEntry;
    indexes: { lastAccessed: number };
  };
}

const DB_NAME = "velachess-analysis-cache";
const DB_VERSION = 1;

const DEFAULT_RAW_EVAL_CAP = 20_000;
const DEFAULT_REPORT_CAP = 500;
let rawEvalCap = DEFAULT_RAW_EVAL_CAP;
let reportCap = DEFAULT_REPORT_CAP;

let dbPromise: Promise<IDBPDatabase<AnalysisCacheSchema>> | undefined;

function openAnalysisCache(): Promise<IDBPDatabase<AnalysisCacheSchema>> {
  dbPromise ??= openDB<AnalysisCacheSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("rawEval", { keyPath: "key" }).createIndex(
        "lastAccessed",
        "lastAccessed",
      );
      db.createObjectStore("report", { keyPath: "key" }).createIndex(
        "lastAccessed",
        "lastAccessed",
      );
    },
  });
  return dbPromise;
}

function rawEvalKey(fen: string, parts: CacheKeyParts): string {
  return `${fen}::${parts.depth}::${parts.multiPV}::${parts.engineBuild}`;
}

function reportKey(gameId: string, policyVersion: number, parts: CacheKeyParts): string {
  return `${gameId}::${policyVersion}::${parts.depth}::${parts.multiPV}::${parts.engineBuild}`;
}

/** Wall-clock, but strictly increasing even within the same millisecond —
 * `lastAccessed` is an LRU ordering key, and two entries touched in the
 * same tick must still sort deterministically by recency. */
let lastEmittedAccess = 0;
function nextLastAccessed(): number {
  lastEmittedAccess = Math.max(Date.now(), lastEmittedAccess + 1);
  return lastEmittedAccess;
}

async function pruneLru(
  db: IDBPDatabase<AnalysisCacheSchema>,
  storeName: "rawEval" | "report",
  cap: number,
): Promise<void> {
  const count = await db.count(storeName);
  if (count <= cap) return;

  const tx = db.transaction(storeName, "readwrite");
  let toDelete = count - cap;
  let cursor = await tx.store.index("lastAccessed").openCursor();
  while (cursor && toDelete > 0) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one transaction, deleting the oldest entries in LRU order
    await cursor.delete();
    toDelete--;
    // oxlint-disable-next-line eslint/no-await-in-loop -- see above
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function getCachedRawEval(
  fen: string,
  parts: CacheKeyParts,
): Promise<RawEval | null> {
  const db = await openAnalysisCache();
  const entry = await db.get("rawEval", rawEvalKey(fen, parts));
  if (!entry) return null;

  await db.put("rawEval", { ...entry, lastAccessed: nextLastAccessed() });
  return { score: entry.score, bestMove: entry.bestMove };
}

export async function putCachedRawEval(
  fen: string,
  parts: CacheKeyParts,
  raw: RawEval,
): Promise<void> {
  const db = await openAnalysisCache();
  await db.put("rawEval", {
    key: rawEvalKey(fen, parts),
    score: raw.score,
    bestMove: raw.bestMove,
    lastAccessed: nextLastAccessed(),
  });
  await pruneLru(db, "rawEval", rawEvalCap);
}

/**
 * One IndexedDB transaction covering every FEN a game needs, instead of
 * one transaction per position — the batch-read half of the
 * browser-analysis orchestrator in `analyze-game-in-browser.ts`. Writes
 * (`putCachedRawEval`) stay per-position: a single search result is
 * cheap to persist on its own, and nothing here batches engine calls,
 * only this one upfront cache read.
 */
export async function getCachedRawEvalsBatch(
  fens: readonly string[],
  parts: CacheKeyParts,
): Promise<Map<string, RawEval>> {
  const db = await openAnalysisCache();
  const tx = db.transaction("rawEval", "readwrite");
  const keys = fens.map((fen) => rawEvalKey(fen, parts));
  const entries = await Promise.all(keys.map((key) => tx.store.get(key)));

  const hits = new Map<string, RawEval>();
  const touches: Promise<string>[] = [];
  entries.forEach((entry, index) => {
    if (!entry) return;
    hits.set(fens[index]!, { score: entry.score, bestMove: entry.bestMove });
    touches.push(tx.store.put({ ...entry, lastAccessed: nextLastAccessed() }));
  });

  await Promise.all(touches);
  await tx.done;
  return hits;
}

export async function getCachedReport(
  gameId: string,
  policyVersion: number,
  parts: CacheKeyParts,
): Promise<GradedPly[] | null> {
  const db = await openAnalysisCache();
  const entry = await db.get("report", reportKey(gameId, policyVersion, parts));
  if (!entry) return null;

  await db.put("report", { ...entry, lastAccessed: nextLastAccessed() });
  return entry.positions;
}

export async function putCachedReport(
  gameId: string,
  policyVersion: number,
  parts: CacheKeyParts,
  positions: GradedPly[],
): Promise<void> {
  const db = await openAnalysisCache();
  await db.put("report", {
    key: reportKey(gameId, policyVersion, parts),
    positions,
    lastAccessed: nextLastAccessed(),
  });
  await pruneLru(db, "report", reportCap);
}

export function setRawEvalCacheCapForTests(cap: number): void {
  rawEvalCap = cap;
}

export function setReportCacheCapForTests(cap: number): void {
  reportCap = cap;
}

export async function resetAnalysisCacheForTests(): Promise<void> {
  const db = await openAnalysisCache();
  db.close();
  dbPromise = undefined;
  await deleteDB(DB_NAME);

  rawEvalCap = DEFAULT_RAW_EVAL_CAP;
  reportCap = DEFAULT_REPORT_CAP;
  lastEmittedAccess = 0;
}
