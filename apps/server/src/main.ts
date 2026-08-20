/**
 * Production entrypoint: postgres-backed deps + Node server. Everything
 * here is wiring — behavior lives in application, HTTP in server.ts.
 */

import { serve } from "@hono/node-server";
import postgres from "postgres";

import { sessionAdvisoryLock } from "@velachess/db";
import { createAuth, resolveAuthEnv } from "@velachess/auth";
import {
  bootstrapCredentialsFromEnv,
  bootstrapUser,
} from "@velachess/application/auth/bootstrap-user/bootstrap-user";
import { createDb } from "@velachess/db";
import { logger } from "@velachess/logger";
import {
  createBoss,
  ensureQueues,
  makeAnalysisQueue,
  makeSyncQueue,
} from "@velachess/queue";
import { makeScheduler } from "@velachess/scheduler";

import { createApp } from "./server.ts";
import { createWatchers } from "@velachess/application/analysis/watch-analysis/watchers";

const apiLogger = logger.child({ component: "api" });

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const db = createDb(databaseUrl);
const boss = createBoss(databaseUrl);
boss.on("error", (error) => apiLogger.error({ error }, "pg-boss error"));
await boss.start();
await ensureQueues(boss);

// Dedicated session for advisory locks — session locks must outlive
// individual queries, so the connection is pinned (max: 1).
const lockSql = postgres(databaseUrl, { max: 1 });
const lock = sessionAdvisoryLock({
  query: async <T>(sql: string, params?: unknown[]) => {
    const rows = await lockSql.unsafe(sql, (params ?? []) as never[]);
    return { rows: rows as unknown as T[] };
  },
});

const analysisQueue = makeAnalysisQueue(boss, db);

// Validated up front — a bad auth environment refuses to boot with a
// message naming the variable, and the secret's value appears nowhere
// (not in errors, not in this log). All rules live and are unit-tested
// in libs/infra/auth/env.ts; this file only wires the result.
const authEnv = resolveAuthEnv(process.env);
if (authEnv.insecureProductionTransport) {
  apiLogger.warn(
    { baseUrl: authEnv.baseUrl },
    "production is served over plain http — session cookies ride " +
      "unencrypted; put TLS in front and set an https VELACHESS_BASE_URL",
  );
}

const authConfig = {
  db,
  baseUrl: authEnv.baseUrl,
  secret: authEnv.secret,
  // Secure follows the actual transport (derived in resolveAuthEnv).
  // Never weakened for production; localhost simply has no TLS.
  secureCookies: authEnv.secureCookies,
  trustedOrigins: authEnv.trustedOrigins,
};

// The instance the HTTP server mounts: sign-up closed. A self-hosted
// instance on a network must not accept account creation from anyone
// who finds it.
const auth = createAuth(authConfig);

// First-run provisioning, out of band: env vars in, first user out, and
// only into an empty user table. There is no HTTP setup endpoint — that
// design has four CVEs to its name in other projects. Creation still
// goes through Better Auth's own sign-up path, so it needs a
// signup-enabled instance — this one, which handles no HTTP request,
// ever: it exists for the single call below and is never mounted.
const bootstrapAuth = createAuth({ ...authConfig, allowSignUp: true });
const bootstrap = await bootstrapUser(
  db,
  bootstrapAuth,
  lock,
  bootstrapCredentialsFromEnv(process.env),
);
// The outcome carries only status/userId/reason by construction —
// never credentials — which is what makes this log safe.
apiLogger.info({ bootstrap }, "first-user bootstrap");

const app = createApp({
  db,
  auth,
  analysisQueue,
  watchers: createWatchers({ db, analysisQueue }),
  syncQueue: makeSyncQueue(boss, db),
  scheduler: makeScheduler(),
  lock,
});

const port = Number(process.env["PORT"] ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  apiLogger.info({ port: info.port }, "api listening");
});

async function shutdown() {
  await boss.stop({ graceful: true });
  await lockSql.end({ timeout: 5 });
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown());
}
