import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { hc } from "hono/client";
import { Redis } from "ioredis";

import { createAuth, type Auth } from "@velachess/infra-auth";
import { createFileStore } from "@velachess/infra-storage";
import { syncAccount } from "@velachess/accounts";
import {
  claimSyncAttempt,
  createSyncNotifications,
  finishSyncJob,
  getTrackedAccount,
  markSyncRunning,
  markTrackedAccountSynced,
  saveGames,
  updateTrackedAccountCursor,
} from "@velachess/infra-db";
import { QUEUES } from "@velachess/infra-queue";
import {
  chessComFixtureFetch,
  createLoopHarness,
  deliverSyncJob,
  type LoopHarness,
} from "@velachess/test-utils";

import { buildReadinessChecks } from "../src/composition/health.ts";
import { createApp } from "../src/server.ts";
import { createRedisClient } from "../src/redis.ts";
import type { ApiDeps } from "../src/deps.ts";
import type { AppType } from "../src/server.ts";

/** `api` is the same `hc<AppType>` client `apps/web` builds, so a test gets
 * the route's real response type instead of casting the body. `request`
 * stays for SSE and anything else outside the RPC surface. */
export interface AuthedApp {
  request: (input: string, init?: RequestInit) => Promise<Response>;
  api: ReturnType<typeof hc<AppType>>;
}

export interface ApiHarness extends LoopHarness {
  app: ReturnType<typeof createApp>;
  deps: ApiDeps;
  auth: Auth;
  /** The signup-enabled twin main.ts builds for bootstrap, never mounted on
   * HTTP: the mounted `auth` keeps its sign-up closed, like production. */
  bootstrapAuth: Auth;
  /** The worker's part of a sync the API scheduled, run inline as its first
   * delivery. The override replaces the harness fetch for this delivery
   * alone, so a test can pause mid-sync without pausing the connect. */
  runSync: (syncId: string, fetchOverride?: typeof fetch) => Promise<void>;
  signIn: (email: string, password: string) => Promise<string>;
  signUp: (
    email: string,
    password?: string,
  ) => Promise<{ userId: string; cookie: string; app: AuthedApp }>;
}

/** The harness app's baseUrl, and so the one origin its CSRF check
 * trusts. */
export const ORIGIN = "http://localhost";

/** The real one when `REDIS_URL` is set, otherwise a port nothing answers
 * on, so every limiter check fails open at once. */
function harnessRedis(): Redis {
  const url = process.env["REDIS_URL"];
  if (url) return createRedisClient(url);
  return unreachableRedis();
}

/** No reconnects, so each command fails immediately rather than retrying
 * against a host that never answers. */
export function unreachableRedis(): Redis {
  const redis = new Redis("redis://127.0.0.1:1", {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  redis.on("error", () => {});
  return redis;
}

export async function createApiHarness(
  /** The archive GET /games reads through to. */
  sync: ApiDeps["sync"] = { fetch: chessComFixtureFetch() },
): Promise<ApiHarness> {
  const harness = await createLoopHarness();

  // The real Better Auth over the harness database, so the suite logs in
  // the way production does. Secure cookies off: no TLS here.
  const authConfig = {
    db: harness.db,
    baseUrl: ORIGIN,
    secret: "test-secret-at-least-32-characters-long",
    secureCookies: false,
  };
  const auth = createAuth(authConfig);
  // Like production: the mounted instance rejects POST
  // /auth/sign-up/email.
  const bootstrapAuth = createAuth({ ...authConfig, allowSignUp: true });

  const filesRoot = await mkdtemp(path.join(tmpdir(), "velachess-api-files-"));

  const redis = harnessRedis();

  const deps: ApiDeps = {
    db: harness.db,
    auth,
    trustedOrigins: [ORIGIN],
    // Unconfigured here: auth.test.ts builds its own instance where the
    // provider matters.
    signInMethods: { password: true, google: false },
    // PGlite listens on its one session, which is the session the worker
    // twin below commits on.
    syncNotifications: createSyncNotifications((channel, onNotify) =>
      harness.pglite.listen(channel, onNotify),
    ),
    syncQueue: harness.syncQueue,
    lock: harness.lock,
    // A real store over a temp dir, so a test proves the bytes
    // round-trip.
    files: createFileStore(filesRoot),
    sync,
    redis,
    readinessChecks: buildReadinessChecks(harness.db, harness.boss),
  };

  // apps/worker/src/composition/accounts.ts builds the equivalent for
  // production; apps never share a composition helper.
  const runSync = async (syncId: string, fetchOverride?: typeof fetch) => {
    const job = await deliverSyncJob(harness.boss, syncId);
    const deliveryFetch = fetchOverride ?? sync?.fetch;
    await syncAccount(
      {
        markSyncRunning: (id) => markSyncRunning(harness.db, id),
        getTrackedAccount: (accountId) => getTrackedAccount(harness.db, accountId),
        withTransaction: (fn) => harness.db.transaction(fn),
        claimSyncAttempt,
        finishSyncJob,
        saveGames,
        updateTrackedAccountCursor,
        markTrackedAccountSynced,
        ...(deliveryFetch ? { fetch: deliveryFetch } : {}),
      },
      job,
    );
    await harness.boss.complete(QUEUES.sync, job);
  };

  const app = createApp(deps);

  // A browser attaches `Origin` to every unsafe request and `app.request`
  // attaches nothing, while the CSRF middleware reads a missing
  // Content-Type as something a form could have sent — so every bodyless
  // POST would meet a 403 no real client sees. A test that wants to look
  // cross-site passes its own `origin`, which wins.
  type AppRequest = typeof app.request;
  const honoRequest: AppRequest = app.request.bind(app);
  app.request = ((...args: Parameters<AppRequest>) => {
    const [input, init, ...rest] = args;
    const headers = new Headers(init?.headers);
    if (!headers.has("origin")) headers.set("origin", ORIGIN);
    return honoRequest(input, { ...init, headers }, ...rest);
  }) as AppRequest;

  const signIn = async (email: string, password: string): Promise<string> => {
    const response = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error(`sign-in failed: ${response.status}`);
    const cookie = response.headers.get("set-cookie");
    if (!cookie) throw new Error("sign-in set no cookie");
    // The Cookie header wants `name=value`; Set-Cookie carries
    // attributes.
    return cookie.split(";")[0]!;
  };

  const asUser = (cookie: string): AuthedApp => {
    const authedFetch: typeof fetch = async (input, init) => {
      // `new Headers(...)` normalizes whatever shape the caller passed,
      // which an object spread would lose.
      const headers = new Headers(init?.headers);
      headers.set("cookie", cookie);
      return app.request(input, { ...init, headers });
    };
    return {
      request: authedFetch,
      api: hc<AppType>(ORIGIN, { fetch: authedFetch }),
    };
  };

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
    runSync,
    signIn,
    signUp,
    close: async () => {
      await deps.syncNotifications.close();
      await harness.close();
      redis.disconnect();
      await rm(filesRoot, { recursive: true, force: true });
    },
  };
}
