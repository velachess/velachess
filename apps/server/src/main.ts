/**
 * Production entrypoint: postgres-backed deps + Node server. Everything
 * here is wiring — behavior lives in application, HTTP in server.ts.
 */

import { serve } from "@hono/node-server";
import postgres from "postgres";

import { createAuth } from "@velachess/infra-auth";
import { createFileStore } from "@velachess/infra-storage";
import { bootstrapUser } from "@velachess/user";
import {
  createDb,
  createSyncNotifications,
  postgresLockExecutor,
} from "@velachess/infra-db";
import { logger } from "@velachess/infra-logger";
import { createBoss, ensureQueues, makeSyncQueue } from "@velachess/infra-queue";

import { createApp } from "./server.ts";
import { resolveApiEnv } from "./env.ts";
import { createRedisClient } from "./redis.ts";
import { buildBootstrapUserDeps } from "./composition/user.ts";

const apiLogger = logger.child({ component: "api" });

// Every variable is validated before anything below opens a connection; a
// bad environment refuses to boot with a message naming the variable and
// never its value. Rules live in env.ts and the resolvers it delegates to.
const env = resolveApiEnv(process.env);
const { databaseUrl, auth: authEnv } = env;

const db = createDb(databaseUrl);
const redis = createRedisClient(env.redis.url);
redis.on("error", (error: Error) => apiLogger.error({ error }, "redis error"));
const boss = createBoss(databaseUrl);
boss.on("error", (error) => apiLogger.error({ error }, "pg-boss error"));
await boss.start();
await ensureQueues(boss);

const { lock, close: closeLockSql } = postgresLockExecutor(databaseUrl);

// The ear on `sync_job_changed`. postgres.js keeps a connection of its
// own for LISTEN, reconnecting and re-listening by itself; awaited so an
// api that cannot hear the worker refuses to boot rather than going quiet.
const listenSql = postgres(databaseUrl, { max: 1 });
const syncNotifications = createSyncNotifications(async (channel, onNotify, onListen) => {
  const { unlisten } = await listenSql.listen(channel, onNotify, onListen);
  return unlisten;
});
await syncNotifications.ready;

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
  // Both optional and both spread rather than passed as `undefined`: an
  // absent Google config means the provider is not offered at all, and an
  // absent proxy list means the socket address is already the client's.
  ...(authEnv.google ? { google: authEnv.google } : {}),
  ...(authEnv.trustedProxies ? { trustedProxies: authEnv.trustedProxies } : {}),
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
  buildBootstrapUserDeps(db, bootstrapAuth, lock),
  env.bootstrapCredentials,
);
// The outcome carries only status/userId/reason by construction —
// never credentials — which is what makes this log safe.
apiLogger.info({ bootstrap }, "first-user bootstrap");

const app = createApp({
  db,
  auth,
  trustedOrigins: authEnv.trustedOrigins,
  // Password sign-in is always available; Google appears only where it is
  // configured. Derived from the same resolved env the auth instance is built
  // from, so the screen and the server cannot disagree about what exists.
  signInMethods: { password: true, google: Boolean(authEnv.google) },
  syncNotifications,
  syncQueue: makeSyncQueue(boss),
  lock,
  files: createFileStore(env.storage.root),
  redis,
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  apiLogger.info({ port: info.port }, "api listening");
});

async function shutdown() {
  await boss.stop({ graceful: true });
  await syncNotifications.close();
  await listenSql.end({ timeout: 5 });
  await closeLockSql();
  redis.disconnect();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown());
}
