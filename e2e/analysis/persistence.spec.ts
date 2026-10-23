/**
 * The stored report, in the browser's own IndexedDB. Leaving the screen and
 * reloading are not the same thing: the first keeps the pass alive (see
 * `analysis-lifecycle.spec.ts`), the second throws the JS context away, so
 * only a report that was already finished and written can come back.
 */
import { expect, test, type Page } from "@playwright/test";

import { stageProduct } from "../staged-product.fixture.ts";
import {
  LANDING_GAME_ID,
  MID_GAME_ID,
  MID_GAME_PLIES,
  midGame,
  shortGame,
  SHORT_GAME_PLIES,
} from "./fixtures/games.ts";
import { databaseNames, seedReport, storedReports, trackWorkers } from "./observe.ts";

const PASS = { timeout: 90_000 };
const ANALYSIS_DB = "velachess-analysis";
const BLUNDER = /g4.*\?\?/;

const graded = (page: Page) => page.getByRole("button", { name: BLUNDER });

test.beforeEach(async ({ page }) => {
  await stageProduct(page, [shortGame, midGame]);
});

test("stores the finished report, and serves it after a reload without searching again", async ({
  page,
}) => {
  const workers = trackWorkers(page);

  await page.goto(`/games/${LANDING_GAME_ID}`);
  await expect(graded(page)).toBeVisible(PASS);
  await expect(page.getByRole("progressbar")).toBeHidden(PASS);

  const [report] = await storedReports(page);
  expect(report).toMatchObject({
    gameId: LANDING_GAME_ID,
    engineBuild: "stockfish-19-lite-single",
    depth: 14,
    policyVersion: 1,
  });
  expect(report?.graded).toHaveLength(SHORT_GAME_PLIES);

  const searched = workers.created.length;
  await page.reload();

  await expect(graded(page)).toBeVisible(PASS);
  expect(workers.created).toHaveLength(searched);
});

test("stores nothing when a reload interrupts the pass, and starts a new one", async ({
  page,
}) => {
  const workers = trackWorkers(page);

  await page.goto(`/games/${MID_GAME_ID}`);
  const progress = page.getByRole("progressbar");
  await expect
    .poll(async () => Number(await progress.getAttribute("aria-valuenow")), PASS)
    .toBeGreaterThanOrEqual(10);

  // The reload has to land mid-pass, or the test proves nothing.
  expect(Number(await progress.getAttribute("aria-valuenow"))).toBeLessThan(100);
  const interrupted = workers.created.length;

  await page.reload();

  // A half-graded game is never written: the report is saved once, at the
  // end, and the reload took the context with it.
  expect(await storedReports(page)).toEqual([]);

  await expect(page.getByRole("progressbar")).toBeVisible(PASS);
  await expect.poll(() => workers.created.length, PASS).toBeGreaterThan(interrupted);
  await expect
    .poll(async () => (await storedReports(page))[0]?.graded.length ?? 0, PASS)
    .toBe(MID_GAME_PLIES);
});

test("analyses the game anyway when its database cannot be opened", async ({ page }) => {
  // Faulted by name, so nothing else that may reach for IndexedDB is
  // collateral.
  await page.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name: string, version?: number | undefined) => {
      if (name === "velachess-analysis") throw new DOMException("storage unavailable");
      return open(name, version);
    };
  });

  await page.goto(`/games/${LANDING_GAME_ID}`);

  await expect(graded(page)).toBeVisible(PASS);
  await expect(page.getByRole("progressbar")).toBeHidden(PASS);

  // Not `storedReports`: with `open` faulted the database cannot be read at
  // all, and unreadable must not be mistaken for absent.
  expect(await databaseNames(page)).not.toContain(ANALYSIS_DB);
});

test("refuses a report this build did not produce", async ({ page }) => {
  const workers = trackWorkers(page);

  await page.goto("/games");
  await seedReport(page, {
    gameId: LANDING_GAME_ID,
    engineBuild: "stockfish-19-lite-single",
    depth: 12,
    policyVersion: 1,
    graded: [],
  });

  await page.getByRole("link", { name: /night_shift/ }).click();

  // Searched again rather than served: the stored rows were produced at
  // another depth.
  await expect(graded(page)).toBeVisible(PASS);
  expect(workers.created.length).toBeGreaterThan(0);

  const [report] = await storedReports(page);
  expect(report).toMatchObject({ gameId: LANDING_GAME_ID, depth: 14 });
  expect(report?.graded).toHaveLength(SHORT_GAME_PLIES);
});

test("keeps two games' reports apart", async ({ page }) => {
  await page.goto(`/games/${LANDING_GAME_ID}`);
  await expect(graded(page)).toBeVisible(PASS);
  await expect(page.getByRole("progressbar")).toBeHidden(PASS);

  await page.goto(`/games/${MID_GAME_ID}`);
  await expect.poll(async () => (await storedReports(page)).length, PASS).toBe(2);

  const reports = await storedReports(page);
  const plies = new Map(reports.map((stored) => [stored.gameId, stored.graded.length]));
  expect(plies.get(LANDING_GAME_ID)).toBe(SHORT_GAME_PLIES);
  expect(plies.get(MID_GAME_ID)).toBe(MID_GAME_PLIES);

  await page.goto(`/games/${LANDING_GAME_ID}`);
  await expect(graded(page)).toBeVisible(PASS);
});
