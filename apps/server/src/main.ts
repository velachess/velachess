import { serve } from "@hono/node-server";
import postgres from "postgres";

import { createAuth } from "@velachess/infra-auth";
import { createAuthEmailSender } from "@velachess/infra-email";
import { createFileStore } from "@velachess/infra-storage";
import { bootstrapUser, deleteAccount } from "@velachess/user";
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
import { buildBootstrapUserDeps, buildDeleteAccountDeps } from "./composition/user.ts";
import { buildReadinessChecks } from "./composition/health.ts";

const apiLogger = logger.child({ component: "api" });

const env = resolveApiEnv(process.env);
const { databaseUrl } = env;
const { passwordSignIn, magicLink, insecureProductionTransport, ...authEnv } = env.auth;

const db = createDb(databaseUrl);
const redis = createRedisClient(env.redisUrl);
redis.on("error", (error: Error) => apiLogger.error({ error }, "redis error"));
const boss = createBoss(databaseUrl);
boss.on("error", (error) => apiLogger.error({ error }, "pg-boss error"));
await boss.start();
await ensureQueues(boss);

const { lock, close: closeLockSql } = postgresLockExecutor(databaseUrl);

const listenSql = postgres(databaseUrl, { max: 1 });
const syncNotifications = createSyncNotifications(async (channel, onNotify, onListen) => {
  const { unlisten } = await listenSql.listen(channel, onNotify, onListen);
  return unlisten;
});
await syncNotifications.ready;

if (insecureProductionTransport) {
  apiLogger.warn(
    { baseUrl: authEnv.baseUrl },
    "production is served over plain http — session cookies ride " +
      "unencrypted; put TLS in front and set an https VELACHESS_BASE_URL",
  );
}

const authConfig = { db, ...authEnv };

const files = createFileStore(env.storage.root);
const deleteAccountDeps = buildDeleteAccountDeps(db, files);

const auth = createAuth({
  ...authConfig,
  passwordSignIn,
  magicLink,
  ...(env.email ? { sendEmail: createAuthEmailSender(env.email) } : {}),
  deleteAccount: (userId) => deleteAccount(deleteAccountDeps, userId),
});

const bootstrapAuth = createAuth({ ...authConfig, allowSignUp: true });
const bootstrap = await bootstrapUser(
  buildBootstrapUserDeps(db, bootstrapAuth, lock),
  env.bootstrapCredentials,
);
apiLogger.info({ bootstrap }, "first-user bootstrap");

const app = createApp({
  db,
  auth,
  trustedOrigins: authEnv.trustedOrigins,
  syncNotifications,
  syncQueue: makeSyncQueue(boss),
  lock,
  files,
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
