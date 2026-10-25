/**
 * What only a browser can answer about deleting an account: that this
 * device's IndexedDB and localStorage no longer hold the account's reports
 * and handles. The API is staged; the session ending is the server suite's.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

import { databaseNames, seedReport } from "../analysis/observe.ts";
import { stageProduct } from "../staged-product.fixture.ts";

const PASSWORD = "correct-horse";
const ANALYSIS_DB = "velachess-analysis";
const SESSION_COOKIE = "better-auth.session_token";

/** Better Auth's side of the deletion: the cookie it clears, and the
 * session that stops resolving once it has. */
async function stageAccountDeletion(page: Page) {
  await page
    .context()
    .addCookies([
      { name: SESSION_COOKIE, value: "staged", url: "http://127.0.0.1:4173" },
    ]);

  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        signInMethods: {
          password: true,
          passwordReset: false,
          google: false,
          magicLink: false,
        },
      },
    }),
  );
  await page.route("**/api/auth/list-accounts", (route) =>
    route.fulfill({
      json: [{ id: "credential-1", providerId: "credential", createdAt: "2026-01-01" }],
    }),
  );
  await page.route("**/api/auth/delete-user", async (route: Route) => {
    const body: { password?: string } = route.request().postDataJSON();
    if (body.password !== PASSWORD) {
      await route.fulfill({
        status: 400,
        json: { code: "INVALID_PASSWORD", message: "Invalid password" },
      });
      return;
    }
    await route.fulfill({
      json: { success: true, message: "User deleted" },
      headers: { "set-cookie": `${SESSION_COOKIE}=; Max-Age=0; Path=/` },
    });
  });
  await page.route("**/api/auth/get-session", async (route) => {
    const cookies = await page.context().cookies();
    if (cookies.some((cookie) => cookie.name === SESSION_COOKIE)) {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: null });
  });
}

async function openDeleteDialog(page: Page) {
  await page.goto("/settings/account");
  const zone = page.getByRole("heading", { name: "Danger zone" });
  await expect(zone).toBeVisible();
  await zone.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("danger-zone.png") });

  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete your account?" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await stageProduct(page);
  await stageAccountDeletion(page);
});

test("deletes the account, signs out and forgets this browser's copy of it", async ({
  page,
}) => {
  await page.goto("/settings/account");
  await seedReport(page, {
    gameId: "landing-game",
    engineBuild: "stockfish-19-lite-single",
    depth: 14,
    policyVersion: 1,
    graded: [],
  });
  expect(await databaseNames(page)).toContain(ANALYSIS_DB);

  const dialog = await openDeleteDialog(page);
  await page.screenshot({ path: test.info().outputPath("confirm-dialog.png") });
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.screenshot({ path: test.info().outputPath("confirm-dialog-filled.png") });
  await dialog.getByRole("button", { name: "Delete account" }).click();

  await expect(page).toHaveURL(/\/login$/);
  expect(await databaseNames(page)).not.toContain(ANALYSIS_DB);
  const remembered = await page.evaluate(() =>
    window.localStorage.getItem("velachess.my-accounts"),
  );
  expect(JSON.parse(remembered ?? "{}")).toMatchObject({ state: { accounts: [] } });
});

test("the danger zone is reachable by scrolling the account screen", async ({ page }) => {
  await page.goto("/settings/account");
  const deleteButton = page.getByRole("button", { name: "Delete account" });
  await expect(deleteButton).toBeVisible();
  await expect(deleteButton).not.toBeInViewport();

  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 2000);

  await expect(deleteButton).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("scrolled-to-danger-zone.png") });
});

test("a wrong password keeps the dialog open with the reason", async ({ page }) => {
  const dialog = await openDeleteDialog(page);

  await dialog.getByLabel("Password").fill("not-it");
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete account" }).click();

  await expect(dialog.getByText("That password isn't right.")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("wrong-password.png") });
  await expect(page).toHaveURL(/\/settings\/account$/);
});
