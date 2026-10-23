/**
 * The pass itself: it starts on its own, it survives the screen, it is never
 * run twice for one game, and its Worker goes when its session does. The
 * engine is real; only the HTTP the screen reads is staged.
 */
import { expect, test } from "@playwright/test";

import { stageProduct } from "../staged-product.fixture.ts";
import { LANDING_GAME_ID, MID_GAME_PLIES, midGame, shortGame } from "./fixtures/games.ts";
import { storedReports, trackWorkers } from "./observe.ts";

/** A depth-14 pass over a staged game, with a CI runner's margin. */
const PASS = { timeout: 90_000 };

test.beforeEach(async ({ page }) => {
  await stageProduct(page, [shortGame, midGame]);
});

test("analyses the game on opening it, and stops the Worker when the pass ends", async ({
  page,
}) => {
  const workers = trackWorkers(page);

  await page.goto(`/games/${LANDING_GAME_ID}`);

  const progress = page.getByRole("progressbar");
  await expect(progress).toBeVisible(PASS);
  // No restart is offered over a running pass: nothing reads the stream's
  // abort signal, so resetting one would leave two filling one entry.
  await expect(page.getByRole("button", { name: "Try again" })).toBeHidden();

  await expect(page.getByRole("button", { name: /g4.*\?\?/ })).toBeVisible(PASS);
  await expect(progress).toBeHidden(PASS);

  await expect.poll(workers.live, PASS).toBe(0);
  expect(workers.created).toHaveLength(1);
});

test("keeps the pass running after the review is left, and never starts a second one", async ({
  page,
}) => {
  const workers = trackWorkers(page);

  await page.goto("/games");
  await page.getByRole("link", { name: /mid_rival/ }).click();

  // The first grade landed: ten plies, so one of them is 10%.
  const progress = page.getByRole("progressbar");
  await expect
    .poll(async () => Number(await progress.getAttribute("aria-valuenow")), PASS)
    .toBeGreaterThanOrEqual(10);

  // Leaving has to happen mid-pass or this test proves nothing, so a runner
  // fast enough to finish first fails here instead of passing vacuously.
  expect(Number(await progress.getAttribute("aria-valuenow"))).toBeLessThan(100);

  await page.goBack();
  await expect(page.getByRole("progressbar")).toBeHidden();

  // Nothing reads the stream's abort signal, so the pass is nobody's to
  // cancel: it is still searching with no screen to report to.
  expect(workers.live()).toBe(1);

  // And it ran to its end off-screen, which is what disposes the session.
  await expect.poll(workers.live, PASS).toBe(0);
  const [report] = await storedReports(page);
  expect(report?.graded).toHaveLength(MID_GAME_PLIES);

  await page.goForward();
  await expect(page.getByRole("progressbar")).toBeHidden();
  expect(workers.created).toHaveLength(1);
});

test("offers Try again when the engine cannot start, and the retry runs a clean pass", async ({
  page,
}) => {
  const workers = trackWorkers(page);

  // The asset, not the engine: the Worker script throws where it loads, so
  // the session fails for a reason the pipeline has to handle, with
  // Stockfish itself untouched.
  const engineScript = "**/engine/*.js";
  await page.route(engineScript, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "throw new Error('engine asset unavailable');",
    }),
  );

  await page.goto(`/games/${LANDING_GAME_ID}`);

  // By role: the same copy is also the game-load failure, which has no
  // alert and no action.
  const failure = page.getByRole("alert").filter({ hasText: "Couldn't load analysis." });
  await expect(failure).toBeVisible(PASS);
  const tryAgain = failure.getByRole("button", { name: "Try again" });
  await expect(tryAgain).toBeVisible();
  await expect.poll(workers.live, PASS).toBe(0);

  await page.unroute(engineScript);
  await tryAgain.click();

  await expect(page.getByRole("progressbar")).toBeVisible(PASS);
  await expect(page.getByRole("button", { name: /g4.*\?\?/ })).toBeVisible(PASS);
  await expect(failure).toBeHidden();
  await expect.poll(workers.live, PASS).toBe(0);
});
