import { expect, test as base, type Page, type Route } from "@playwright/test";

import {
  LANDING_GAME_ID,
  LANDING_PLAYER,
  landingGame,
} from "../../apps/web/src/games/review/tests/fixtures/landing-game.ts";

const FIXED_NOW = "2026-08-21T12:00:00.000Z";

const session = {
  session: {
    id: "landing-session",
    userId: "11111111-1111-4111-8111-111111111111",
    expiresAt: "2027-08-21T12:00:00.000Z",
    token: "landing-session-token",
  },
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "player@velachess.local",
    name: "Vela Player",
    emailVerified: true,
    image: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: FIXED_NOW,
  },
};

const account = {
  id: "landing-account",
  platform: "chess_com",
  username: LANDING_PLAYER,
  lastSyncedAt: "2026-08-20T18:00:00.000Z",
  syncStatus: "idle",
  activeSyncId: null,
  lastSyncError: null,
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ json: body, status });
}

async function handleApi(route: Route) {
  const request = route.request();
  const { pathname } = new URL(request.url());
  const method = request.method();

  if (method === "GET" && pathname === "/api/auth/get-session") {
    await fulfillJson(route, session);
    return;
  }
  if (method === "GET" && pathname === "/api/accounts") {
    await fulfillJson(route, [account]);
    return;
  }
  if (method === "GET" && pathname === "/api/games") {
    await fulfillJson(route, { games: [landingGame], total: 1, page: 1, pageSize: 25 });
    return;
  }
  if (method === "GET" && pathname === `/api/games/${LANDING_GAME_ID}`) {
    await fulfillJson(route, landingGame);
    return;
  }
  // The session's one SSE stream, opened by the `_app` layout. Nothing
  // settles during a capture, so an empty stream is the whole of it.
  //
  // There is no analysis endpoint to stage: Stockfish runs in the browser,
  // so this capture drives the real engine and the grades on screen are
  // the ones it searched.
  if (method === "GET" && pathname === "/api/syncs/events") {
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: "" });
    return;
  }

  throw new Error(`Unexpected capture request: ${method} ${pathname}`);
}

async function preparePage(page: Page) {
  await page.addInitScript(
    ({ now, player }) => {
      Date.now = () => new Date(now).valueOf();
      window.localStorage.setItem(
        "velachess.my-accounts",
        JSON.stringify({
          state: {
            accounts: [
              { accountId: "landing-account", platform: "chess_com", username: player },
            ],
          },
          version: 1,
        }),
      );
    },
    { now: FIXED_NOW, player: LANDING_PLAYER },
  );
  await page.route((url) => url.pathname.startsWith("/api/"), handleApi);
}

async function settle(page: Page) {
  await page.evaluate(async () => document.fonts.ready);
  await page.addStyleTag({
    content:
      "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }",
  });
}

export const test = base.extend<{ productPage: Page }>({
  productPage: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await preparePage(page);
    await use(page);
    expect(errors).toEqual([]);
  },
});

export { expect, settle };
