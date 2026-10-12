/**
 * ProcessSync — one pg-boss delivery of a sync job: mark it running, pull
 * the account's new games, persist them with the outcome.
 *
 * pg-boss owns the delivery: returning completes it, throwing fails it
 * (retry, backoff, dead letter per the queue's policy). What this slice
 * owns is the row: `markSyncRunning` stamps `started_at`, and every write
 * of this attempt is conditional on that stamp. A newer attempt re-stamps
 * it, so an older one that still commits matches nothing — the fence is
 * the row, not the signal. `job.signal` is pg-boss's cooperative cancel
 * (expiry, claim lost, shutdown): it stops the fetch, nothing more.
 *
 * No engine runs here, by design: analysis has one trigger, opening a game.
 */
import type {
  ChessComCursor,
  FetchFn,
  LichessCursor,
  NormalizedGame,
  SyncResult,
} from "@velachess/infra-platforms";
import {
  chessComCursorSchema,
  fetchChessCom,
  fetchLichess,
  lichessCursorSchema,
} from "@velachess/infra-platforms";
import type { Database, TrackedAccount } from "@velachess/infra-db";

/** Database and a Drizzle transaction share this type in this codebase. */
type Tx = Database;
type Cursor = ChessComCursor | LichessCursor;
/** This delivery's claim on the row: the `started_at` its `markSyncRunning` wrote. */
type Attempt = { id: string; startedAt: Date };
type Outcome = {
  status: "succeeded" | "retrying" | "failed";
  errorCode: "not-found" | "incomplete" | "internal" | null;
  gamesFetched?: number;
  gamesInserted?: number;
};

type MarkSyncRunning = (
  id: string,
) => Promise<{ accountId: string; startedAt: Date } | null>;
type GetTrackedAccount = (accountId: string) => Promise<TrackedAccount | null>;
type WithTransaction = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
/** Locks the row for this attempt. False when it is gone, or a newer
 * attempt has re-stamped it. */
type LockSyncJob = (tx: Tx, attempt: Attempt) => Promise<boolean>;
/** Writes the outcome, only while the row is still this attempt's. */
type FinishSyncJob = (tx: Tx, attempt: Attempt, outcome: Outcome) => Promise<void>;
type SaveGames = (
  tx: Tx,
  games: NormalizedGame[],
  opts: { userId: string; accountId: string },
) => Promise<{ inserted: number }>;
type UpdateTrackedAccountCursor = (
  tx: Tx,
  accountId: string,
  cursor: Cursor,
) => Promise<void>;
type MarkTrackedAccountSynced = (tx: Tx, accountId: string) => Promise<void>;

export interface ProcessSyncDeps {
  markSyncRunning: MarkSyncRunning;
  getTrackedAccount: GetTrackedAccount;
  withTransaction: WithTransaction;
  lockSyncJob: LockSyncJob;
  finishSyncJob: FinishSyncJob;
  saveGames: SaveGames;
  updateTrackedAccountCursor: UpdateTrackedAccountCursor;
  markTrackedAccountSynced: MarkTrackedAccountSynced;
  /** Composed once, at wiring time — the fixture a test harness reads
   * through instead of the network. Never varies per call. */
  fetch?: FetchFn;
  /**
   * A stored cursor that did not parse as its account's platform shape.
   * Reported rather than swallowed: the pass starts over, which is a full
   * archive walk, and nothing else would say why. Wired to the logger at
   * the composition root; absent in tests that do not assert on it.
   */
  onUnreadableCursor?: (info: { accountId: string; platform: string }) => void;
}

/** The generic fetch-override bag every route/worker composition reads to
 * decide whether a slice talks to the real network or a test fixture —
 * shared by `@velachess/games`'s provider-profile fetch and this module's
 * account fetch, since both narrow to the exact same shape. */
export interface SyncDeps {
  fetch?: FetchFn;
  /** See `ProcessSyncDeps.onUnreadableCursor` — the same sink, reached
   * through the bag a composition root already passes into sync. */
  onUnreadableCursor?: ProcessSyncDeps["onUnreadableCursor"];
}

/** What pg-boss hands the worker — its job fits as it is. The id is the
 * sync job's id: the job is sent under it. */
export interface SyncDelivery {
  id: string;
  signal: AbortSignal;
}

export async function processSync(
  deps: ProcessSyncDeps,
  job: SyncDelivery,
): Promise<void> {
  const sync = await deps.markSyncRunning(job.id);
  // Gone with its account, or already settled: nothing left to do.
  if (!sync) return;
  const attempt: Attempt = { id: job.id, startedAt: sync.startedAt };
  const account = await deps.getTrackedAccount(sync.accountId);
  // Disconnected meanwhile; the job row went with it.
  if (!account) return;

  let fetched: SyncResult & { cursor: Cursor | null };
  try {
    fetched = await fetchGameHistory(deps, account, job.signal);
    // Cancelled after the last response: skip the work below, pg-boss
    // already decided what follows.
    job.signal.throwIfAborted();
  } catch (error) {
    await deps.withTransaction((tx) =>
      deps.finishSyncJob(tx, attempt, { status: "retrying", errorCode: "internal" }),
    );
    throw error;
  }

  // The handle no longer exists at the provider. Permanent: retrying cannot
  // fix it, and the account and its games stay as they are.
  if (fetched.failures.some(({ reason }) => reason === "not-found")) {
    await deps.withTransaction((tx) =>
      deps.finishSyncJob(tx, attempt, { status: "failed", errorCode: "not-found" }),
    );
    return;
  }

  // Games, cursor and outcome commit together. The job row is locked
  // first, then the account through the games' FK: the order disconnecting
  // takes them in. A partial pass keeps its games but not its cursor, so
  // the retry starts from the same place and the unique constraints absorb
  // the repeats.
  await deps.withTransaction(async (tx) => {
    if (!(await deps.lockSyncJob(tx, attempt))) return;
    const { inserted } = await deps.saveGames(tx, fetched.games, {
      userId: account.userId,
      accountId: account.id,
    });
    if (fetched.complete) {
      // An empty archive completes and yields no cursor — it still synced.
      if (fetched.cursor)
        await deps.updateTrackedAccountCursor(tx, account.id, fetched.cursor);
      await deps.markTrackedAccountSynced(tx, account.id);
    }
    await deps.finishSyncJob(tx, attempt, {
      status: fetched.complete ? "succeeded" : "retrying",
      errorCode: fetched.complete ? null : "incomplete",
      gamesFetched: fetched.games.length,
      gamesInserted: inserted,
    });
  });
  if (!fetched.complete) {
    throw new Error(`sync ${job.id} incomplete (${fetched.failures.length} failures)`);
  }
}

/**
 * The account's game history since its cursor, from its own provider.
 *
 * `sync_cursor` is one jsonb column holding either provider's shape, so
 * the column cannot say which one it has — only this switch can. Absent
 * (a first sync) and invalid (a cursor written for the other provider, or
 * by an older shape) both start from the beginning, but only the second is
 * reported: without that, a full archive walk looks like a normal one.
 *
 * A `switch` over the platform with no fall-through return: the column's
 * type comes from `accountPlatformSchema`, so adding a provider there
 * leaves this returning `undefined` and the caller stops compiling. An
 * `else` would instead route the new provider to Lichess in silence.
 *
 * The parse cannot be hoisted out of the branches or chosen from a
 * `Record<AccountPlatform, …>`: the two cursor shapes are disjoint and
 * each `fetch*` demands its own, so calling a union of those functions
 * asks for the *intersection* of their parameters —
 * `ChessComCursor & LichessCursor`, which no cursor satisfies.
 */
function fetchGameHistory(
  deps: ProcessSyncDeps,
  account: TrackedAccount,
  signal: AbortSignal,
): Promise<SyncResult & { cursor: Cursor | null }> {
  const stored = account.syncCursor ?? null;
  const reportUnreadable = () =>
    deps.onUnreadableCursor?.({ accountId: account.id, platform: account.platform });
  // Spread per key: `exactOptionalPropertyTypes` treats an explicit
  // `undefined` as a value, which would erase the provider's default.
  const opts = { signal, ...(deps.fetch ? { fetch: deps.fetch } : {}) };

  switch (account.platform) {
    case "chess_com": {
      const parsed = chessComCursorSchema.safeParse(stored);
      if (stored !== null && !parsed.success) reportUnreadable();
      return fetchChessCom(account.username, parsed.success ? parsed.data : null, opts);
    }
    case "lichess": {
      const parsed = lichessCursorSchema.safeParse(stored);
      if (stored !== null && !parsed.success) reportUnreadable();
      return fetchLichess(account.username, parsed.success ? parsed.data : null, opts);
    }
  }
}
