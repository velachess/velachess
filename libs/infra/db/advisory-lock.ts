/**
 * Execution-level mutual exclusion via Postgres session advisory locks.
 * The acquisition IS the check (pg_try_advisory_lock) — no separate
 * inspect step, no TOCTOU. Session locks die with the connection, so a
 * crashed executor never leaves a stale claim behind.
 */

export interface LockExecutor {
  /** Same generic shape PGlite and node-postgres expose — the row type
   * flows through instead of being asserted at the call site. */
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface ExecutionLock {
  /** Null = someone alive holds it. Otherwise a release function that must
   * run in the caller's finally. */
  tryAcquire(key: string): Promise<(() => Promise<void>) | null>;
}

export function sessionAdvisoryLock(executor: LockExecutor): ExecutionLock {
  // Session advisory locks are reentrant WITHIN a session, so two callers
  // sharing one connection (same api process; PGlite's single session)
  // would both "acquire". The in-process set closes that hole; the
  // advisory lock covers cross-process/cross-connection exclusion.
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
