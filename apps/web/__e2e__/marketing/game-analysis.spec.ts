import path from "node:path";

import { LANDING_GAME_ID } from "../../src/games/open-game/__fixtures__/landing-game-analysis.ts";
import { expect, settle, test } from "./marketing.fixture.ts";

const output = path.resolve(
  import.meta.dirname,
  "../../../site/public/product/game-analysis.webp",
);

test("captures the game analysis blunder", async ({ marketingPage: page }) => {
  await page.goto(`/games/${LANDING_GAME_ID}`);

  const blunder = page.getByRole("button", { name: /g4.*\?\?/ });
  await expect(blunder).toBeVisible();
  await blunder.click();
  await expect(page.getByText("is a blunder")).toBeVisible();
  await expect(page.getByText("Best was")).toBeVisible();
  await settle(page);

  await page.screenshot({ path: output, type: "webp", quality: 92, scale: "css" });
});
