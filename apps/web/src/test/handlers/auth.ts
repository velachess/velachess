import { http, HttpResponse } from "msw";

/** Shapes copied from real responses. jsdom simulates no cookies, so
 * `sessionActive()`/`sessionInactive()` set the state directly. */

const BASE = "/api/auth";

export interface TestSessionUser {
  id: string;
  email: string;
  name: string;
  /** Absent by default, so most of the suite runs the initials
   * fallback. */
  image?: string | null;
  /** Absent by default: most of the suite is somebody mid-first-run. */
  onboardedAt?: string | null;
}

export const TEST_USER: TestSessionUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "user@velachess.local",
  name: "VelaChess User",
};

/** Google off by default, like the real server, so a test that wants the
 * button says so and every other one proves its absence. */
let signInMethods = { password: true, google: false };

/** Bumped per upload, like the real cache buster, so a replacement
 * produces a different URL. */
let avatarVersion = 1;

export function signInMethodsAre(methods: {
  password?: boolean;
  google?: boolean;
}): void {
  signInMethods = { ...signInMethods, ...methods };
}

/** As `/list-accounts` reports them. */
let linkedProviders: string[] = ["credential"];

export function linkedProvidersAre(providers: string[]): void {
  linkedProviders = providers;
}

export const TEST_PASSWORD = "dev-password";

type AuthScenario =
  | { kind: "signed-out" }
  | { kind: "signed-in"; user: TestSessionUser }
  | { kind: "unavailable" };

// The default the rest of the suite runs under.
let scenario: AuthScenario = { kind: "signed-in", user: TEST_USER };

export function sessionActive(user: TestSessionUser = TEST_USER): TestSessionUser {
  scenario = { kind: "signed-in", user };
  return user;
}

export function sessionInactive(): void {
  scenario = { kind: "signed-out" };
}

/** The lookup itself fails: not signed out, but no answer. */
export function sessionUnavailable(): void {
  scenario = { kind: "unavailable" };
}

export function resetAuthScenario(): void {
  scenario = { kind: "signed-in", user: TEST_USER };
  signInMethods = { password: true, google: false };
  linkedProviders = ["credential"];
  avatarVersion = 1;
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
      onboardedAt: user.onboardedAt ?? null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
  };
}

export const authHandlers = [
  // Not under BASE: this one is our API, not Better Auth's.
  http.get("/api/config", () => HttpResponse.json({ signInMethods })),

  http.get(`${BASE}/get-session`, () => {
    if (scenario.kind === "unavailable") {
      return HttpResponse.json({ message: "boom" }, { status: 500 });
    }
    if (scenario.kind === "signed-out") {
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

  // Better Auth answers with the provider's authorization URL for the
  // client to navigate to. jsdom does not navigate, which is why the
  // assertions are on the request.
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
      // The app reads the name back from the session, so this has to
      // actually change it.
      scenario = { kind: "signed-in", user: { ...scenario.user, name: body.name } };
    }
    return HttpResponse.json({ status: true });
  }),

  /**
   * Avatar bytes go to our API, not Better Auth, but the URL lands on the
   * same session.
   *
   * The body is checked rather than accepted, like the real route, so a
   * screen test catches the client sending the wrong thing.
   */
  http.post("/api/me/avatar", async ({ request }) => {
    const body = (await request.json()) as { image?: string };
    if (!body.image || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.image)) {
      return HttpResponse.json({ error: "invalid body" }, { status: 400 });
    }

    const image = `/api/me/avatar?v=${avatarVersion++}`;
    if (scenario.kind === "signed-in") {
      scenario = { kind: "signed-in", user: { ...scenario.user, image } };
    }
    return HttpResponse.json({ image });
  }),

  http.delete("/api/me/avatar", () => {
    if (scenario.kind === "signed-in") {
      scenario = { kind: "signed-in", user: { ...scenario.user, image: null } };
    }
    return new HttpResponse(null, { status: 204 });
  }),

  // Closed on the real server too: no frontend path may depend on it.
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
