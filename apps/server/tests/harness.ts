import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { hc } from "hono/client";
import { Redis } from "ioredis";

import { createAuth, type Auth } from "@velachess/infra-auth";
import type { AuthEmail } from "@velachess/infra-email";
import { createFileStore } from "@velachess/infra-storage";
import { syncAccount } from "@velachess/accounts";
import { deleteAccount } from "@velachess/user";
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
import { buildDeleteAccountDeps } from "../src/composition/user.ts";
import { createApp } from "../src/server.ts";
import { createRedisClient } from "../src/redis.ts";
import type { ApiDeps } from "../src/deps.ts";
import type { AppType } from "../src/server.ts";

export interface AuthedApp {
  request: (input: string, init?: RequestInit) => Promise<Response>;
  api: ReturnType<typeof hc<AppType>>;
}

export interface ApiHarness extends LoopHarness {
  app: ReturnType<typeof createApp>;
  deps: ApiDeps;
  filesRoot: string;
  auth: Auth;
  bootstrapAuth: Auth;
  runSync: (syncId: string, fetchOverride?: typeof fetch) => Promise<void>;
  signIn: (email: string, password: string) => Promise<string>;
  signUp: (
    email: string,
    password?: string,
  ) => Promise<{ userId: string; cookie: string; app: AuthedApp }>;
}

export const ORIGIN = "http://localhost";

function harnessRedis(): Redis {
  const url = process.env["REDIS_URL"];
  if (url) return createRedisClient(url);
  return unreachableRedis();
}

export function unreachableRedis(): Redis {
  const redis = new Redis("redis://127.0.0.1:1", {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  redis.on("error", () => {});
  return redis;
}

export async function createApiHarness(
  sync: ApiDeps["sync"] = { fetch: chessComFixtureFetch() },
  { sendEmail }: { sendEmail?: (email: AuthEmail) => Promise<void> } = {},
): Promise<ApiHarness> {
  const harness = await createLoopHarness();

  const authConfig = {
    db: harness.db,
    baseUrl: ORIGIN,
    secret: "test-secret-at-least-32-characters-long",
    secureCookies: false,
  };
  const filesRoot = await mkdtemp(path.join(tmpdir(), "velachess-api-files-"));
  const files = createFileStore(filesRoot);

  const auth = createAuth({
    ...authConfig,
    ...(sendEmail ? { sendEmail } : {}),
    deleteAccount: (userId) =>
      deleteAccount(buildDeleteAccountDeps(harness.db, files), userId),
  });
  const bootstrapAuth = createAuth({ ...authConfig, allowSignUp: true });

  const redis = harnessRedis();

  const deps: ApiDeps = {
    db: harness.db,
    auth,
    trustedOrigins: [ORIGIN],
    signInMethods: { password: true, google: false, passwordReset: Boolean(sendEmail) },
    syncNotifications: createSyncNotifications((channel, onNotify) =>
      harness.pglite.listen(channel, onNotify),
    ),
    syncQueue: harness.syncQueue,
    lock: harness.lock,
    files,
    sync,
    redis,
    readinessChecks: buildReadinessChecks(harness.db, harness.boss),
  };

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

  type AppRequest = typeof app.request;
  // Browsers send `Origin` on unsafe requests and `app.request` does not, so
  // the CSRF check would refuse every bodyless POST a real client never sees.
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
    return cookie.split(";")[0]!;
  };

  const asUser = (cookie: string): AuthedApp => {
    const authedFetch: typeof fetch = async (input, init) => {
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
    filesRoot,
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
