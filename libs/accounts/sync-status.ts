/**
 * Which sync-job statuses mean a sync is still on its way.
 *
 * A module-root pure policy: no DB, queue or provider dependency of its
 * own, so the slices import it directly rather than declaring it three
 * times. `get-sync`, `request-sync` and `list-accounts` each had their own
 * copy of this list. `apps/web` keeps its own, over its own vocabulary: a
 * job settles on `succeeded`/`failed` while an account's `syncStatus`
 * collapses both into `idle`, and the frontend must not import a backend
 * module to learn that the active sets happen to coincide.
 *
 * The SQL predicate in `libs/infra/db/queries/sync-jobs.ts` is the one
 * expression of this rule that cannot call it — a predicate runs inside
 * Postgres, and infra may not import a business module. It is held to this
 * list by that package's `sync-jobs.test.ts`, not by shared code; same
 * arrangement `libs/chess/game-result.ts` documents for its own SQL
 * counterpart.
 */

/** The job lifecycle, as `sync_job_status` stores it. */
export type SyncJobStatus = "queued" | "running" | "retrying" | "succeeded" | "failed";

/** Private to this policy: callers ask the predicate below, which keeps
 * the narrowing an `includes` would throw away. Exporting the list too
 * would be a second way to answer one question. */
const ACTIVE_SYNC_STATUSES = [
  "queued",
  "running",
  "retrying",
] as const satisfies readonly SyncJobStatus[];

type ActiveSyncStatus = (typeof ACTIVE_SYNC_STATUSES)[number];

/**
 * A type predicate, not a bare `includes`: callers branch on the answer
 * and then use the status itself, so the narrowing has to survive. `null`
 * — an account whose newest job is gone — is not active.
 */
export function isActiveSyncStatus(
  status: SyncJobStatus | null | undefined,
): status is ActiveSyncStatus {
  return ACTIVE_SYNC_STATUSES.some((active) => active === status);
}
