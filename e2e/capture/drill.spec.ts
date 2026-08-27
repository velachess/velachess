import path from "node:path";

import { expect, settle, test } from "./staged-product.fixture.ts";

const output = path.resolve(
  import.meta.dirname,
  "../../apps/site/public/product/drill.webp",
);

test("captures the drill feedback loop", async ({ productPage: page }) => {
  await page.goto("/drill");
  await page.getByRole("button", { name: "Start drilling" }).click();

  await page.locator("#chessboard-square-g2").click();
  await page.locator("#chessboard-square-g4").click();

  await expect(page.getByText("Not the move.")).toBeVisible();
  await expect(page.getByText("Next review")).toBeVisible();
  await expect(page.getByText("e4", { exact: true })).toBeVisible();
  await settle(page);

  await page.screenshot({ path: output, type: "webp", quality: 92, scale: "css" });
});
