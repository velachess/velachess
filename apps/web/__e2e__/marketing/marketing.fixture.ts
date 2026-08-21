import { expect, test as base, type Page, type Route } from "@playwright/test";

import {
  landingDrill,
  landingDrillAnswer,
  landingDrillQueue,
} from "../../src/drill/__fixtures__/landing-drill.ts";
import {
  LANDING_GAME_ID,
  LANDING_PLAYER,
  landingCompletedAnalysis,
  landingGame,
} from "../../src/games/open-game/__fixtures__/landing-game-analysis.ts";

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
  syncState: "none",
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
  if (method === "GET" && pathname === "/api/health") {
    await fulfillJson(route, { ok: true });
    return;
  }
  if (method === "GET" && pathname === "/api/accounts") {
    await fulfillJson(route, [account]);
    return;
  }
  if (method === "GET" && pathname === "/api/overview") {
    await fulfillJson(route, { games: 48, deviations: 9, exercises: 8, dueCards: 6 });
    return;
  }
  if (method === "GET" && pathname === "/api/drill/queue") {
    await fulfillJson(route, landingDrillQueue);
    return;
  }
  if (method === "GET" && pathname === "/api/drill/next") {
    await fulfillJson(route, landingDrill);
    return;
  }
  if (method === "POST" && pathname === "/api/drill/answer") {
    await fulfillJson(route, landingDrillAnswer);
    return;
  }
  if (method === "GET" && pathname === `/api/games/${LANDING_GAME_ID}`) {
    await fulfillJson(route, landingGame);
    return;
  }
  if (method === "GET" && pathname === `/api/games/${LANDING_GAME_ID}/analysis`) {
    await fulfillJson(route, landingCompletedAnalysis);
    return;
  }
  if (method === "POST" && pathname === `/api/games/${LANDING_GAME_ID}/analyze`) {
    await fulfillJson(route, landingCompletedAnalysis);
    return;
  }

  throw new Error(`Unexpected marketing capture request: ${method} ${pathname}`);
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

export const test = base.extend<{ marketingPage: Page }>({
  marketingPage: async ({ page }, use) => {
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
