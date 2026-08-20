/** API harness: the shared loop harness + the real app. Only what is
 * api-specific lives here — everything else comes from test-utils. */

import { createAuth, type Auth } from "@velachess/auth";
import { makeScheduler } from "@velachess/scheduler";
import {
  chessComFixtureFetch,
  createLoopHarness,
  makeStockfishSession,
  type LoopHarness,
} from "@velachess/test-utils";

import type { AnalyzeDeps } from "@velachess/application/analysis/process-analysis/process-analysis";

/** What a signed-in browser sees — the harness app with a cookie attached. */
export interface AuthedApp {
  request: (input: string, init?: RequestInit) => Promise<Response>;
}

import { createApp } from "../src/server.ts";
import { createWatchers } from "@velachess/application/analysis/watch-analysis/watchers";
import type { ApiDeps } from "../src/deps.ts";

export interface ApiHarness extends LoopHarness {
  app: ReturnType<typeof createApp>;
  deps: ApiDeps;
  auth: Auth;
  /** The signup-enabled twin production's main.ts builds for bootstrap —
   * never mounted on HTTP. `bootstrapUser` and `signUp` go through it;
   * the mounted `auth` keeps its sign-up surface closed, like prod. */
  bootstrapAuth: Auth;
  /** The worker's dependencies. Not the API's — it runs no engine. */
  analyze: AnalyzeDeps;
  /** Sign this email in and return the Cookie header for later requests. */
  signIn: (email: string, password: string) => Promise<string>;
  /** Sign a fresh user up and hand back their id + a ready Cookie header. */
  signUp: (
    email: string,
    password?: string,
  ) => Promise<{ userId: string; cookie: string; app: AuthedApp }>;
}

export async function createApiHarness(
  /** The archive GET /games reads through to. Defaults to the looper one. */
  sync: ApiDeps["sync"] = { fetch: chessComFixtureFetch() },
): Promise<ApiHarness> {
  const harness = await createLoopHarness();

  // The real Better Auth, over the harness database — the suite logs in
  // the way production does, not through a bypass. HTTP here, secure
  // cookies off: the test server has no TLS to be secure on.
  const authConfig = {
    db: harness.db,
    baseUrl: "http://localhost",
    secret: "test-secret-at-least-32-characters-long",
    secureCookies: false,
  };
  const auth = createAuth(authConfig);
  // Same split as production: user creation happens server-side through
  // this twin; the mounted instance rejects POST /auth/sign-up/email.
  const bootstrapAuth = createAuth({ ...authConfig, allowSignUp: true });

  const deps: ApiDeps = {
    db: harness.db,
    auth,
    analysisQueue: harness.analysisQueue,
    // A short interval: the suite should not wait out a production poll.
    watchers: createWatchers({
      db: harness.db,
      analysisQueue: harness.analysisQueue,
      intervalMs: 50,
    }),
    syncQueue: harness.syncQueue,
    scheduler: makeScheduler(),
    lock: harness.lock,
    // GET /games fills read-through; the suite must not reach the network.
    sync,
  };

  const analyze: AnalyzeDeps = {
    makeSession: makeStockfishSession,
    lock: harness.lock,
    depth: 8,
  };

  const app = createApp(deps);

  const signIn = async (email: string, password: string): Promise<string> => {
    const response = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error(`sign-in failed: ${response.status}`);
    const cookie = response.headers.get("set-cookie");
    if (!cookie) throw new Error("sign-in set no cookie");
    // The Cookie header wants `name=value`; Set-Cookie carries attributes.
    return cookie.split(";")[0]!;
  };

  /** The app as seen by a signed-in browser: same routes, cookie attached. */
  const asUser = (cookie: string) => ({
    request: async (input: string, init?: RequestInit) =>
      app.request(input, {
        ...init,
        headers: { ...(init?.headers as Record<string, string>), cookie },
      }),
  });

  const signUp = async (email: string, password = "test-password-123") => {
    const created = await bootstrapAuth.api.signUpEmail({
      body: { name: email.split("@")[0]!, email, password },
    });
    const cookie = await signIn(email, password);
    return { userId: created.user.id, cookie, app: asUser(cookie) };
  };

  return {
    ...harness,
    app,
    deps,
    auth,
    bootstrapAuth,
    signIn,
    signUp,
    analyze,
    // Wrap the loop harness's close so the shared watch loops stop with
    // it — one outliving the database is an unhandled rejection.
    close: async () => {
      deps.watchers.close();
      await harness.close();
    },
  };
}
