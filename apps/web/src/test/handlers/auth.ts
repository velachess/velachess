import { http, HttpResponse } from "msw";

const BASE = "/api/auth";

export interface TestSessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  onboardedAt?: string | null;
}

export const TEST_USER: TestSessionUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "user@velachess.local",
  name: "VelaChess User",
};

let signInMethods = { password: true, google: false, passwordReset: false };

let avatarVersion = 1;

export function signInMethodsAre(methods: {
  password?: boolean;
  google?: boolean;
  passwordReset?: boolean;
}): void {
  signInMethods = { ...signInMethods, ...methods };
}

let linkedProviders: string[] = ["credential"];

export function linkedProvidersAre(providers: string[]): void {
  linkedProviders = providers;
}

export const TEST_PASSWORD = "dev-password";

export const RESET_TOKEN = "valid-reset-token";

let emailVerified = true;

export function emailIsUnverified(): void {
  emailVerified = false;
}

type AuthScenario =
  | { kind: "signed-out" }
  | { kind: "signed-in"; user: TestSessionUser }
  | { kind: "unavailable" };

let scenario: AuthScenario = { kind: "signed-in", user: TEST_USER };

export function sessionActive(user: TestSessionUser = TEST_USER): TestSessionUser {
  scenario = { kind: "signed-in", user };
  return user;
}

export function sessionInactive(): void {
  scenario = { kind: "signed-out" };
}

export function sessionUnavailable(): void {
  scenario = { kind: "unavailable" };
}

export function resetAuthScenario(): void {
  scenario = { kind: "signed-in", user: TEST_USER };
  signInMethods = { password: true, google: false, passwordReset: false };
  linkedProviders = ["credential"];
  emailVerified = true;
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

  http.post<never, { email?: string; password?: string }>(
    `${BASE}/sign-in/email`,
    async ({ request }) => {
      const body = await request.json();

      if (body.email !== TEST_USER.email || body.password !== TEST_PASSWORD) {
        return HttpResponse.json(
          { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
          { status: 401 },
        );
      }

      if (!emailVerified) {
        return HttpResponse.json(
          { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
          { status: 403 },
        );
      }

      sessionActive();
      return HttpResponse.json({
        redirect: false,
        token: "session-token",
        user: sessionBody(TEST_USER).user,
      });
    },
  ),

  http.post<never, { email?: string }>(
    `${BASE}/request-password-reset`,
    async ({ request }) => {
      const body = await request.json();
      if (!body.email?.includes("@") || request.headers.get("accept-language") !== "en") {
        return HttpResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
      }
      return HttpResponse.json({
        status: true,
        message:
          "If this email exists in our system, check your email for the reset link",
      });
    },
  ),

  http.post<never, { newPassword?: string; token?: string }>(
    `${BASE}/reset-password`,
    async ({ request }) => {
      const body = await request.json();
      if (body.token !== RESET_TOKEN) {
        return HttpResponse.json(
          { code: "INVALID_TOKEN", message: "Invalid token" },
          { status: 400 },
        );
      }
      if (!body.newPassword || body.newPassword.length < 8) {
        return HttpResponse.json(
          { code: "PASSWORD_TOO_SHORT", message: "Password too short" },
          { status: 400 },
        );
      }
      return HttpResponse.json({ status: true });
    },
  ),

  http.post(`${BASE}/sign-out`, () => {
    sessionInactive();
    return HttpResponse.json({ success: true });
  }),

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

  http.post<never, { name?: string }>(`${BASE}/update-user`, async ({ request }) => {
    const body = await request.json();
    if (scenario.kind === "signed-in" && body.name) {
      scenario = { kind: "signed-in", user: { ...scenario.user, name: body.name } };
    }
    return HttpResponse.json({ status: true });
  }),

  http.post<never, { image?: string }>("/api/me/avatar", async ({ request }) => {
    const body = await request.json();
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
