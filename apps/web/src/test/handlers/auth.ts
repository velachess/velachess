import { http, HttpResponse } from "msw";

/** Shapes copied from real cURL responses, not invented. Cookies aren't simulated in jsdom; `sessionActive()`/`sessionInactive()` set state directly instead. */

const BASE = "/api/auth";

export interface TestSessionUser {
  id: string;
  email: string;
  name: string;
  /** Absent by default on purpose: a password account has no picture, so
   * the avatar's initials fallback is the path most of the suite runs. */
  image?: string | null;
}

export const TEST_USER: TestSessionUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "user@velachess.local",
  name: "VelaChess User",
};

/**
 * What `GET /api/config` reports. Google is off by default for the same
 * reason the real server defaults it off — an instance without
 * credentials does not offer it — so a test that wants the button says
 * so, and every other test proves its absence.
 */
let signInMethods = { password: true, google: false };

export function signInMethodsAre(methods: {
  password?: boolean;
  google?: boolean;
}): void {
  signInMethods = { ...signInMethods, ...methods };
}

/** Providers this account can sign in with, as `/list-accounts` reports. */
let linkedProviders: string[] = ["credential"];

export function linkedProvidersAre(providers: string[]): void {
  linkedProviders = providers;
}

export const TEST_PASSWORD = "dev-password";

type AuthScenario =
  | { kind: "signed-out" }
  | { kind: "signed-in"; user: TestSessionUser }
  | { kind: "unavailable" };

// Signed in is the default the rest of the suite runs under — a games or
// drill test shouldn't have to log in first to test games or drill.
let scenario: AuthScenario = { kind: "signed-in", user: TEST_USER };

export function sessionActive(user: TestSessionUser = TEST_USER): TestSessionUser {
  scenario = { kind: "signed-in", user };
  return user;
}

export function sessionInactive(): void {
  scenario = { kind: "signed-out" };
}

/** The session lookup itself fails: not "signed out", but "no answer". */
export function sessionUnavailable(): void {
  scenario = { kind: "unavailable" };
}

export function resetAuthScenario(): void {
  scenario = { kind: "signed-in", user: TEST_USER };
  signInMethods = { password: true, google: false };
  linkedProviders = ["credential"];
}

function sessionBody(user: TestSessionUser) {
  return {
    session: {
      id: "session-1",
      userId: user.id,
      expiresAt: new Date(Date.now() + 604_800_000).toISOString(),
      token: "session-token",
    },
    user: {
      ...user,
      emailVerified: false,
      image: user.image ?? null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
  };
}

export const authHandlers = [
  // Not under BASE: this one is our API, not Better Auth's — the sign-in
  // screen asks it what to render before there is anyone to authenticate.
  http.get("/api/config", () => HttpResponse.json({ signInMethods })),

  http.get(`${BASE}/get-session`, () => {
    if (scenario.kind === "unavailable") {
      return HttpResponse.json({ message: "boom" }, { status: 500 });
    }
    if (scenario.kind === "signed-out") {
      // What Better Auth answers with no cookie: 401, no body of note.
      return HttpResponse.json(null, { status: 401 });
    }
    return HttpResponse.json(sessionBody(scenario.user));
  }),

  http.post(`${BASE}/sign-in/email`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };

    if (body.email !== TEST_USER.email || body.password !== TEST_PASSWORD) {
      return HttpResponse.json(
        { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
        { status: 401 },
      );
    }

    sessionActive();
    return HttpResponse.json({
      redirect: false,
      token: "session-token",
      user: sessionBody(TEST_USER).user,
    });
  }),

  http.post(`${BASE}/sign-out`, () => {
    sessionInactive();
    return HttpResponse.json({ success: true });
  }),

  // What Better Auth answers a social sign-in with: the provider's
  // authorization URL, for the client to send the browser to. jsdom does
  // not navigate, which is exactly why the assertion is on the request
  // rather than on a redirect.
  http.post(`${BASE}/sign-in/social`, () =>
    HttpResponse.json({
      url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
      redirect: true,
    }),
  ),

  http.get(`${BASE}/list-accounts`, () =>
    HttpResponse.json(
      linkedProviders.map((providerId, index) => ({
        id: `account-${index}`,
        providerId,
        accountId: `${providerId}-account`,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      })),
    ),
  ),

  http.post(`${BASE}/update-user`, async ({ request }) => {
    const body = (await request.json()) as { name?: string };
    if (scenario.kind === "signed-in" && body.name) {
      // The session is where the app reads the name back from, so the
      // fake server has to actually change it or the test proves nothing.
      scenario = { kind: "signed-in", user: { ...scenario.user, name: body.name } };
    }
    return HttpResponse.json({ status: true });
  }),

  // Closed on the real server, closed here too — the frontend must never
  // grow a path that depends on it existing.
  http.post(`${BASE}/sign-up/email`, () =>
    HttpResponse.json(
      {
        code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
        message: "Email and password sign up is not enabled",
      },
      { status: 400 },
    ),
  ),
];
