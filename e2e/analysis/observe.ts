/**
 * What these suites read instead of reaching into the app: Playwright's own
 * Worker list, the browser's own IndexedDB, and the meter's attribute
 * history. Nothing here is exported from production code.
 */
import type { Page, Worker } from "@playwright/test";

const DB_NAME = "velachess-analysis";
const STORE = "report";

export interface StoredReport {
  gameId: string;
  engineBuild: string;
  depth: number;
  policyVersion: number;
  graded: readonly unknown[];
}

declare global {
  interface Window {
    meterHistory?: string[];
  }
}

/** Every Worker the page ever opened, in creation order, plus how many are
 * still alive. A session's Worker closing is how disposal is observable. */
export function trackWorkers(page: Page) {
  const created: Worker[] = [];
  page.on("worker", (worker) => created.push(worker));

  return {
    created,
    live: () => page.workers().length,
  };
}

export function databaseNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    return databases.map((database) => database.name ?? "");
  });
}

/**
 * Opened by name only when it already exists: a bare `indexedDB.open` would
 * create an empty database, and the app's own open would then find its
 * version current and its store missing.
 */
export async function storedReports(page: Page): Promise<StoredReport[]> {
  const names = await databaseNames(page);
  if (!names.includes(DB_NAME)) return [];

  return page.evaluate(
    ([name, store]) =>
      new Promise<StoredReport[]>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("success", () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(store)) {
            db.close();
            resolve([]);
            return;
          }
          const all = db.transaction(store, "readonly").objectStore(store).getAll();
          all.addEventListener("error", () => {
            db.close();
            reject(all.error);
          });
          all.addEventListener("success", () => {
            db.close();
            resolve(all.result);
          });
        });
      }),
    [DB_NAME, STORE] as const,
  );
}

/** The store as `analysis-db.ts` creates it, so the app finds its own
 * version and keyPath rather than an upgrade it did not ask for. */
export function seedReport(page: Page, report: StoredReport): Promise<void> {
  return page.evaluate(
    ([name, store, seeded]) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("upgradeneeded", () => {
          request.result.createObjectStore(store, { keyPath: "gameId" });
        });
        request.addEventListener("success", () => {
          const db = request.result;
          const write = db.transaction(store, "readwrite").objectStore(store).put(seeded);
          write.addEventListener("error", () => {
            db.close();
            reject(write.error);
          });
          write.addEventListener("success", () => {
            db.close();
            resolve();
          });
        });
      }),
    [DB_NAME, STORE, report] as const,
  );
}

/**
 * Every distinct reading the bar announced, in order. A superseded search
 * reaching the bar late shows up here as a value after the current one,
 * which a snapshot assertion cannot see.
 */
export async function recordMeter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const history: string[] = [];
    const meter = document.querySelector('[role="meter"]');
    if (meter) history.push(meter.getAttribute("aria-valuetext") ?? "");
    window.meterHistory = history;

    new MutationObserver((records) => {
      for (const record of records) {
        if (!(record.target instanceof Element)) continue;
        if (record.target.getAttribute("role") !== "meter") continue;
        const reading = record.target.getAttribute("aria-valuetext") ?? "";
        if (history.at(-1) !== reading) history.push(reading);
      }
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-valuetext"],
    });
  });
}

export function meterHistory(page: Page): Promise<string[]> {
  return page.evaluate(() => window.meterHistory ?? []);
}
