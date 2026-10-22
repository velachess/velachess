/**
 * [API DEPS] — everything the routes need, injected. Tests build these over
 * PGlite; production builds them over postgres in index.ts. Routes never
 * construct infrastructure.
 */

import type { ExecutionLock } from "@velachess/infra-db";
import type { SyncDeps } from "@velachess/accounts";
import type { Auth } from "@velachess/infra-auth";
import type { Database, SyncNotifications } from "@velachess/infra-db";
import type { SyncQueue } from "@velachess/infra-queue";
import type { FileStore } from "@velachess/infra-storage";

import type { buildReadinessChecks } from "./composition/health.ts";
import type { Redis } from "./redis.ts";

/**
 * What the sign-in screen may render. Capability flags, nothing more: the
 * screen has to know which methods exist *before* it has a session, and a
 * self-host with no Google credentials must not show a button whose only
 * possible outcome is an error at the redirect.
 */
interface SignInMethods {
  password: boolean;
  google: boolean;
}

export interface ApiDeps {
  db: Database;
  /** Answers exactly one question: who is making this request. */
  auth: Auth;
  /** Origins the CSRF check accepts on unsafe methods. The same list the
   * auth config resolves from VELACHESS_BASE_URL, so a request the session
   * would accept and a request CSRF would accept cannot disagree. */
  trustedOrigins: string[];
  /** Served publicly at GET /config — see SignInMethods. */
  signInMethods: SignInMethods;
  syncQueue: SyncQueue;
  /** Backs the inbound rate limiter — shared across every API instance,
   * the same reason the Postgres limiter it replaced had to be. */
  redis: Redis;
  /** First-user bootstrap's own race guard; the API runs no engine and
   * acquires no other advisory lock. */
  lock: ExecutionLock;
  /** One LISTEN on `sync_job_changed`, shared by every sync stream. */
  syncNotifications: SyncNotifications;
  /** Avatar bytes — the only binary this app stores. */
  files: FileStore;
  readinessChecks: ReturnType<typeof buildReadinessChecks>;
  /** Read-through fetching for GET /games. Tests inject a fixture. */
  sync?: SyncDeps;
}
