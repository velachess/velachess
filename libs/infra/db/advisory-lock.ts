/**
 * The acquisition is the check, so there is no TOCTOU, and session locks
 * die with the connection, so a crashed executor leaves no stale claim.
 */

import postgres from "postgres";

export interface LockExecutor {
  /** The shape PGlite and node-postgres both expose, so the row type flows
   * through instead of being asserted at the call site. */
  query<T>(sql: string, params?: string[]): Promise<{ rows: T[] }>;
}

export interface ExecutionLock {
  /** Null when someone alive holds it; otherwise a release the caller runs
   * in its finally. */
  tryAcquire(key: string): Promise<(() => Promise<void>) | null>;
}

export function sessionAdvisoryLock(executor: LockExecutor): ExecutionLock {
  // Session advisory locks are reentrant within a session, so two callers
  // sharing one connection would both acquire. The set closes that hole;
  // the advisory lock covers cross-connection exclusion.
  const heldInProcess = new Set<string>();

  return {
    async tryAcquire(key: string) {
      if (heldInProcess.has(key)) return null;
      heldInProcess.add(key);

      const result = await executor.query<{ ok: boolean }>(
        "select pg_try_advisory_lock(hashtext($1)) as ok",
        [key],
      );
      const acquired = result.rows[0]?.ok === true;
      if (!acquired) {
        heldInProcess.delete(key);
        return null;
      }

      return async () => {
        try {
          await executor.query("select pg_advisory_unlock(hashtext($1))", [key]);
        } finally {
          heldInProcess.delete(key);
        }
      };
    },
  };
}

/**
 * Session locks must outlive individual queries, so the connection is
 * pinned with `max: 1`.
 */
export function postgresLockExecutor(url: string): {
  lock: ExecutionLock;
  close(): Promise<void>;
} {
  const sql = postgres(url, { max: 1 });
  const lock = sessionAdvisoryLock({
    query: async <T>(query: string, params?: string[]) => ({
      rows: await sql.unsafe<T[]>(query, params),
    }),
  });
  return { lock, close: () => sql.end({ timeout: 5 }) };
}
