import { http, HttpResponse } from "msw";

/** Shapes copied from real cURL responses, not invented. Cookies aren't simulated in jsdom; `sessionActive()`/`sessionInactive()` set state directly instead. */

const BASE = "/api/auth";

export interface TestSessionUser {
  id: string;
  email: string;
  name: string;
}

export const TEST_USER: TestSessionUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "user@velachess.local",
  name: "VelaChess User",
};

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
      image: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
  };
}

export const authHandlers = [
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
