import path from "node:path";

import { LANDING_GAME_ID } from "../../apps/web/src/games/review/tests/fixtures/landing-game.ts";
import { expect, settle, test } from "./staged-product.fixture.ts";

const output = path.resolve(
  import.meta.dirname,
  "../../apps/site/public/product/game-analysis.webp",
);

/** Stockfish searches four positions in the page before the grade lands. */
const ANALYSIS_TIMEOUT = 60_000;

test("captures the game analysis blunder", async ({ productPage: page }) => {
  await page.goto(`/games/${LANDING_GAME_ID}`);

  const blunder = page.getByRole("button", { name: /g4.*\?\?/ });
  await expect(blunder).toBeVisible({ timeout: ANALYSIS_TIMEOUT });
  await blunder.click();
  await expect(page.getByText("is a blunder")).toBeVisible();
  await expect(page.getByText("Best was")).toBeVisible();
  await settle(page);

  await page.screenshot({ path: output, type: "webp", quality: 92, scale: "css" });
});
