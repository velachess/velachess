import type { ExecutionLock } from "@velachess/infra-db";
import type { SyncDeps } from "@velachess/accounts";
import type { Auth } from "@velachess/infra-auth";
import type { Database, SyncNotifications } from "@velachess/infra-db";
import type { SyncQueue } from "@velachess/infra-queue";
import type { FileStore } from "@velachess/infra-storage";

import type { buildReadinessChecks } from "./composition/health.ts";
import type { Redis } from "./redis.ts";

export interface ApiDeps {
  db: Database;
  auth: Auth;
  trustedOrigins: string[];
  syncQueue: SyncQueue;
  redis: Redis;
  lock: ExecutionLock;
  syncNotifications: SyncNotifications;
  files: FileStore;
  readinessChecks: ReturnType<typeof buildReadinessChecks>;
  sync?: SyncDeps;
}
