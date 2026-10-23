import { serve } from "@hono/node-server";
import postgres from "postgres";

import { createAuth } from "@velachess/infra-auth";
import { createAuthEmailSender } from "@velachess/infra-email";
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
import { buildReadinessChecks } from "./composition/health.ts";

const apiLogger = logger.child({ component: "api" });

// Validated before anything below opens a connection, so a bad environment
// refuses to boot with a message naming the variable and never its value.
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

// postgres.js keeps its own connection for LISTEN and re-listens by itself.
// Awaited, so an API that cannot hear the worker refuses to boot rather than
// going quiet.
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
  // Follows the actual transport, localhost having no TLS, and is never
  // weakened for production.
  secureCookies: authEnv.secureCookies,
  trustedOrigins: authEnv.trustedOrigins,
  // Spread rather than passed as `undefined`: an absent Google config means
  // the provider is not offered, and an absent proxy list means the socket
  // address is already the client's.
  ...(authEnv.google ? { google: authEnv.google } : {}),
  ...(authEnv.trustedProxies ? { trustedProxies: authEnv.trustedProxies } : {}),
};

// Sign-up closed: a self-hosted instance on a network must not accept
// account creation from anyone who finds it. Email exists only when Resend
// is configured.
const auth = createAuth({
  ...authConfig,
  ...(env.email ? { sendEmail: createAuthEmailSender(env.email) } : {}),
});

// Out of band, and only into an empty user table: there is no HTTP setup
// endpoint, a design with four CVEs to its name elsewhere. Creation goes
// through Better Auth's sign-up path, so it needs a signup-enabled instance,
// and this one exists for the call below and is never mounted. No sender:
// the first user is marked verified, so there is nothing to email.
const bootstrapAuth = createAuth({ ...authConfig, allowSignUp: true });
const bootstrap = await bootstrapUser(
  buildBootstrapUserDeps(db, bootstrapAuth, lock),
  env.bootstrapCredentials,
);
// The outcome carries only status, userId and reason, never credentials,
// which is what makes this log safe.
apiLogger.info({ bootstrap }, "first-user bootstrap");

const app = createApp({
  db,
  auth,
  trustedOrigins: authEnv.trustedOrigins,
  // Derived from the same resolved env the auth instance is built from, so
  // the screen and the server cannot disagree about what exists.
  signInMethods: {
    password: true,
    google: Boolean(authEnv.google),
    passwordReset: Boolean(env.email),
  },
  syncNotifications,
  syncQueue: makeSyncQueue(boss),
  lock,
  files: createFileStore(env.storage.root),
  redis,
  readinessChecks: buildReadinessChecks(db, boss),
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
