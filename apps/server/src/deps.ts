/**
 * [API DEPS] — everything the routes need, injected. Tests build these over
 * PGlite; production builds them over postgres in index.ts. Routes never
 * construct infrastructure.
 */

import type { ExecutionLock } from "@velachess/db";
import type { SyncDeps } from "@velachess/application/accounts/sync-account/sync-account";
import type { Auth } from "@velachess/auth";
import type { Database } from "@velachess/db";
import type { AnalysisQueue, SyncQueue } from "@velachess/queue";
import type { Scheduler } from "@velachess/scheduler";

import type { Watchers } from "@velachess/application/analysis/watch-analysis/watchers";

export interface ApiDeps {
  db: Database;
  /** Answers exactly one question: who is making this request. */
  auth: Auth;
  /** Origins the CSRF check accepts on unsafe methods. The same list the
   * auth config resolves from VELACHESS_BASE_URL, so a request the session
   * would accept and a request CSRF would accept cannot disagree. */
  trustedOrigins: string[];
  analysisQueue: AnalysisQueue;
  syncQueue: SyncQueue;
  scheduler: Scheduler;
  /** Held for the advisory-lock plumbing; the API runs no engine itself. */
  lock: ExecutionLock;
  /** One poll loop per game, shared by everyone watching it. */
  watchers: Watchers;
  /** Read-through fetching for GET /games. Tests inject a fixture. */
  sync?: SyncDeps;
}
