/**
 * `apps/web` keeps its own copy over its own vocabulary, where a settled
 * job collapses into `idle`, because the frontend may not import a backend
 * module. The SQL predicate in `libs/infra/db/queries/sync-jobs.ts` cannot
 * call this one either, and is held to the list by that package's
 * `sync-jobs.test.ts`.
 */

/** The job lifecycle, as `sync_job_status` stores it. */
export type SyncJobStatus = "queued" | "running" | "retrying" | "succeeded" | "failed";

const ACTIVE_SYNC_STATUSES = [
  "queued",
  "running",
  "retrying",
] as const satisfies readonly SyncJobStatus[];

type ActiveSyncStatus = (typeof ACTIVE_SYNC_STATUSES)[number];

/**
 * A type predicate rather than a bare `includes`, because callers use the
 * status after branching on it. A missing newest job is not active.
 */
export function isActiveSyncStatus(
  status: SyncJobStatus | null | undefined,
): status is ActiveSyncStatus {
  return ACTIVE_SYNC_STATUSES.some((active) => active === status);
}

/**
 * `apps/server` emits these on `GET /syncs/events` and `apps/web` matches
 * them. One declaration, so a rename cannot compile on one side and break
 * the other.
 */
export const SYNC_SETTLED_EVENTS = {
  completed: "sync.completed",
  failed: "sync.failed",
} as const;
