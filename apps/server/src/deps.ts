import type { ExecutionLock } from "@velachess/infra-db";
import type { SyncDeps } from "@velachess/accounts";
import type { Auth } from "@velachess/infra-auth";
import type { Database, SyncNotifications } from "@velachess/infra-db";
import type { SyncQueue } from "@velachess/infra-queue";
import type { FileStore } from "@velachess/infra-storage";

import type { buildReadinessChecks } from "./composition/health.ts";
import type { Redis } from "./redis.ts";

/**
 * Capability flags only: the screen must know which methods exist before it
 * has a session, and a self-host with no Google credentials must not show a
 * button that can only error at the redirect.
 */
interface SignInMethods {
  password: boolean;
  google: boolean;
  /** Whether "Forgot password?" can deliver anything: email is configured. */
  passwordReset: boolean;
}

export interface ApiDeps {
  db: Database;
  auth: Auth;
  /** The same list the auth config resolves, so the session and the CSRF
   * check cannot disagree about who may call this API. */
  trustedOrigins: string[];
  /** Served publicly at GET /config. */
  signInMethods: SignInMethods;
  syncQueue: SyncQueue;
  /** Backs the inbound rate limiter, shared across every API instance. */
  redis: Redis;
  /** First-user bootstrap's race guard, and the API's only advisory
   * lock. */
  lock: ExecutionLock;
  /** One LISTEN on `sync_job_changed`, shared by every sync stream. */
  syncNotifications: SyncNotifications;
  /** Avatar bytes, the only binary this app stores. */
  files: FileStore;
  readinessChecks: ReturnType<typeof buildReadinessChecks>;
  /** Read-through fetching for GET /games; tests inject a fixture. */
  sync?: SyncDeps;
}
