/**
 * A line played on the board. The bar must answer for the position in front
 * of whoever is looking at it — never the game's number for a position the
 * game never reached, and never a slide to even while it waits.
 *
 * The line is `b3`, `d5`, `g4` from ply 2: it leaves `d2` blocked by White's
 * own pawn and `f2` empty, so the last position is mate in one for Black and
 * reads `M1` — a number none of the earlier positions could produce.
 */
import { expect, test, type Page } from "@playwright/test";

import { stageProduct } from "../staged-product.fixture.ts";
import { midGame, shortGame } from "./fixtures/games.ts";
import { meterHistory, recordMeter, trackWorkers } from "./observe.ts";

const PASS = { timeout: 90_000 };
const SEARCH = { timeout: 60_000 };

const meter = (page: Page) => page.getByRole("meter", { name: "Evaluation" });
const fill = (page: Page) => page.locator('[data-slot="eval-bar-fill"]');

const fillHeight = (page: Page) => fill(page).evaluate((element) => element.style.height);

async function playMove(page: Page, from: string, to: string) {
  await page.locator(`[data-square="${from}"]`).click();
  await page.locator(`[data-square="${to}"]`).click();
}

/** The analysed game at ply 2, where the bar reads the report's own number
 * and a line can be played from. */
async function openAnalysedGameAtPly2(page: Page) {
  await page.goto("/games");
  await page.getByRole("link", { name: /night_shift/ }).click();

  await expect(page.getByRole("button", { name: /g4.*\?\?/ })).toBeVisible(PASS);
  await expect(page.getByRole("progressbar")).toBeHidden(PASS);

  await page.getByRole("button", { name: /^e5/ }).click();
  await expect(meter(page)).toHaveAttribute("aria-valuenow", /\d/);
}

test.beforeEach(async ({ page }) => {
  await stageProduct(page, [shortGame, midGame]);
});

test("answers the position on the board, never the game's, while a line is searched", async ({
  page,
}) => {
  await openAnalysedGameAtPly2(page);
  const gameReading = await meter(page).getAttribute("aria-valuetext");
  await recordMeter(page);

  await playMove(page, "b2", "b3");
  await playMove(page, "d7", "d5");
  await playMove(page, "g2", "g4");

  // Mate in one for Black, which only the last position can read.
  await expect(meter(page)).toHaveAttribute("aria-valuetext", "M1", SEARCH);

  // Read from the recording rather than from the bar: a search can answer
  // faster than an assertion arrives, and what matters is every reading the
  // bar announced on the way.
  const history = await meterHistory(page);
  expect(history[0]).toBe(gameReading);
  expect(history).toContain("—");
  expect(history.at(-1)).toBe("M1");
  // The game's own number never came back while the line was on the board.
  expect(history.slice(1)).not.toContain(gameReading);
});

test("holds the bar's fill while the line is being searched", async ({ page }) => {
  await openAnalysedGameAtPly2(page);
  const gameFill = await fillHeight(page);

  await playMove(page, "b2", "b3");

  // One snapshot of the pending bar, so the share and the fill cannot be
  // read either side of the answer landing.
  const pending = await page
    .waitForFunction(
      () => {
        const bar = document.querySelector('[role="meter"]');
        if (!bar || bar.getAttribute("aria-valuetext") !== "—") return null;
        const drawn = bar.querySelector('[data-slot="eval-bar-fill"]');
        return {
          share: bar.getAttribute("aria-valuenow"),
          height: drawn instanceof HTMLElement ? drawn.style.height : null,
        };
      },
      undefined,
      SEARCH,
    )
    .then((handle) => handle.jsonValue());

  // `waitForFunction` only resolves on a truthy value, which the types do
  // not carry.
  if (!pending) throw new Error("the bar never read as unavailable");

  // No share is reported for a position nothing answered about, and the
  // fill is held: a slide to even and back would animate a reading nobody
  // produced.
  expect(pending.share).toBeNull();
  expect(pending.height).toBe(gameFill);

  await expect(meter(page)).toHaveAttribute("aria-valuenow", /\d/, SEARCH);
  expect(await fillHeight(page)).not.toBe(gameFill);
});

test("reuses one session for the whole line, and disposes it when the review is left", async ({
  page,
}) => {
  const workers = trackWorkers(page);
  await openAnalysedGameAtPly2(page);

  // The pass is over, so its Worker is gone and the next one is the line's.
  await expect.poll(workers.live, PASS).toBe(0);
  expect(workers.created).toHaveLength(1);

  await playMove(page, "b2", "b3");
  await playMove(page, "d7", "d5");
  await playMove(page, "g2", "g4");

  await expect.poll(workers.live, SEARCH).toBe(1);
  expect(workers.created).toHaveLength(2);

  await page.goBack();
  await expect.poll(workers.live, SEARCH).toBe(0);
});

test("restores the game's own evaluation when the line is left", async ({ page }) => {
  await openAnalysedGameAtPly2(page);
  const gameReading = await meter(page).getAttribute("aria-valuetext");

  // Left while the line's search is in flight or just settled, either of
  // which the bar must not carry back to the game's own position.
  await playMove(page, "b2", "b3");
  await page.getByRole("button", { name: /^e5/ }).click();

  await expect(meter(page)).toHaveAttribute("aria-valuetext", gameReading ?? "");
  await expect(meter(page)).toHaveAttribute("aria-valuenow", /\d/);
});
