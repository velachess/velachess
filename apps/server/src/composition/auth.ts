/**
 * Composition root for the auth module's one slice: adapts the real
 * Better Auth instance, DB client, and advisory lock into the narrow
 * functions bootstrap-user declared. Shared between main.ts (production
 * boot) and apps/server/tests/auth.test.ts (the same wiring, over the
 * harness's Postgres and Better Auth instances) so both exercise the
 * identical adapter.
 */
import type { Auth } from "@velachess/infra-auth";
import { countUsers, markEmailVerified } from "@velachess/infra-db";
import type { Database, ExecutionLock } from "@velachess/infra-db";
import type { BootstrapUserDeps } from "@velachess/auth";

export function buildBootstrapUserDeps(
  db: Database,
  auth: Auth,
  lock: ExecutionLock,
): BootstrapUserDeps {
  return {
    countUsers: () => countUsers(db),
    signUpEmail: (input) => auth.api.signUpEmail({ body: input }),
    markEmailVerified: (userId) => markEmailVerified(db, userId),
    tryAcquireLock: (key) => lock.tryAcquire(key),
  };
}
