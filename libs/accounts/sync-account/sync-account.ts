/**
 * pg-boss owns the delivery — returning completes it, throwing fails it.
 * This slice owns the row: `markSyncRunning` stamps `started_at` and every
 * write of this attempt is conditional on that stamp, so an older attempt
 * that still commits matches nothing. The fence is the row, not the signal;
 * `job.signal` is pg-boss's cooperative cancel and only stops the fetch.
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

type Tx = Database;
type Cursor = ChessComCursor | LichessCursor;
/** This delivery's claim on the row: the `started_at` it wrote. */
type Attempt = { id: string; startedAt: Date };
/** What a checkpoint already committed: a prefix of `fetched.games` to skip
 * in the final save, and the insert count the job's total needs. */
type Progress = { gameCount: number; inserted: number };
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
/** False when the row is gone or a newer attempt re-stamped it. */
type ClaimSyncAttempt = (tx: Tx, attempt: Attempt) => Promise<boolean>;
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

export interface SyncAccountDeps {
  markSyncRunning: MarkSyncRunning;
  getTrackedAccount: GetTrackedAccount;
  withTransaction: WithTransaction;
  claimSyncAttempt: ClaimSyncAttempt;
  finishSyncJob: FinishSyncJob;
  saveGames: SaveGames;
  updateTrackedAccountCursor: UpdateTrackedAccountCursor;
  markTrackedAccountSynced: MarkTrackedAccountSynced;
  fetch?: FetchFn;
  /**
   * A stored cursor that did not parse as its account's platform shape.
   * Reported rather than swallowed: the pass restarts as a full archive
   * walk, and nothing else would say why.
   */
  onUnreadableCursor?: (info: { accountId: string; platform: string }) => void;
}

/** The fetch-override bag a composition reads to decide between the real
 * network and a fixture, shared with `@velachess/games`'s provider-profile
 * fetch since both narrow to the same shape. */
export interface SyncDeps {
  fetch?: FetchFn;
  /** The same sink as `SyncAccountDeps.onUnreadableCursor`. */
  onUnreadableCursor?: SyncAccountDeps["onUnreadableCursor"];
}

/** What pg-boss hands the worker. The id is the sync job's: the queue job
 * is sent under it. */
export interface SyncDelivery {
  id: string;
  signal: AbortSignal;
}

export async function syncAccount(
  deps: SyncAccountDeps,
  job: SyncDelivery,
): Promise<void> {
  const sync = await deps.markSyncRunning(job.id);
  if (!sync) return;
  const attempt: Attempt = { id: job.id, startedAt: sync.startedAt };
  const account = await deps.getTrackedAccount(sync.accountId);
  if (!account) return;

  const progress: Progress = { gameCount: 0, inserted: 0 };
  let fetched: SyncResult & { cursor: Cursor | null };
  try {
    fetched = await fetchGameHistory(deps, account, attempt, job.signal, progress);
    // Cancelled after the last response: pg-boss already decided what
    // follows.
    job.signal.throwIfAborted();
  } catch (error) {
    await deps.withTransaction((tx) =>
      deps.finishSyncJob(tx, attempt, { status: "retrying", errorCode: "internal" }),
    );
    throw error;
  }

  // The handle is gone at the provider: permanent, and retrying cannot fix
  // it.
  if (fetched.failures.some(({ reason }) => reason === "not-found")) {
    await deps.withTransaction((tx) =>
      deps.finishSyncJob(tx, attempt, { status: "failed", errorCode: "not-found" }),
    );
    return;
  }

  // Games, cursor and outcome commit together, locking the job row first and
  // then the account through the games' FK — the order disconnecting takes
  // them in. A partial pass keeps its games, its cursor stays at the last
  // checkpoint, and the unique constraints absorb the repeats on retry.
  await deps.withTransaction(async (tx) => {
    // A newer attempt re-stamped `started_at`.
    if (!(await deps.claimSyncAttempt(tx, attempt))) return;
    // Everything up to `progress.gameCount` landed in a checkpoint of this
    // same delivery (chess.com only).
    const { inserted } = await deps.saveGames(
      tx,
      fetched.games.slice(progress.gameCount),
      {
        userId: account.userId,
        accountId: account.id,
      },
    );
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
      gamesInserted: progress.inserted + inserted,
    });
  });
  if (!fetched.complete) {
    throw new Error(`sync ${job.id} incomplete (${fetched.failures.length} failures)`);
  }
}

/**
 * The account's game history since its cursor. `sync_cursor` is one jsonb
 * column holding either provider's shape, so only this switch can say which
 * one it has. Absent (a first sync) and invalid both start from the
 * beginning, but only the second is reported, or a full archive walk looks
 * like a normal one.
 *
 * The `switch` has no fall-through return on purpose: adding a platform to
 * `accountPlatformSchema` leaves this returning `undefined` and the caller
 * stops compiling, where an `else` would silently route it to Lichess.
 *
 * The parse cannot be hoisted out of the branches: the cursor shapes are
 * disjoint and each `fetch*` demands its own, so calling a union of those
 * functions asks for the intersection of their parameters, which no cursor
 * satisfies.
 */
function fetchGameHistory(
  deps: SyncAccountDeps,
  account: TrackedAccount,
  attempt: Attempt,
  signal: AbortSignal,
  progress: Progress,
): Promise<SyncResult & { cursor: Cursor | null }> {
  const stored = account.syncCursor ?? null;
  const reportUnreadable = () =>
    deps.onUnreadableCursor?.({ accountId: account.id, platform: account.platform });
  // Spread per key: `exactOptionalPropertyTypes` treats an explicit
  // `undefined` as a value, erasing the provider's default.
  const opts = { signal, ...(deps.fetch ? { fetch: deps.fetch } : {}) };

  switch (account.platform) {
    case "chess_com": {
      const parsed = chessComCursorSchema.safeParse(stored);
      if (stored !== null && !parsed.success) reportUnreadable();
      return fetchChessCom(account.username, parsed.success ? parsed.data : null, {
        ...opts,
        onCheckpoint: (cursor, monthGames) =>
          commitCheckpoint(deps, attempt, account, cursor, monthGames, progress),
      });
    }
    case "lichess": {
      const parsed = lichessCursorSchema.safeParse(stored);
      if (stored !== null && !parsed.success) reportUnreadable();
      return fetchLichess(account.username, parsed.success ? parsed.data : null, opts);
    }
  }
}

/**
 * One Chess.com archive month in its own short transaction, so a crash loses
 * only the month in flight. `claimSyncAttempt` guards it like the final
 * commit, so a delivery that lost the job to a retry writes nothing.
 */
async function commitCheckpoint(
  deps: SyncAccountDeps,
  attempt: Attempt,
  account: TrackedAccount,
  cursor: Cursor,
  monthGames: NormalizedGame[],
  progress: Progress,
): Promise<void> {
  await deps.withTransaction(async (tx) => {
    if (!(await deps.claimSyncAttempt(tx, attempt))) return;
    const { inserted } = await deps.saveGames(tx, monthGames, {
      userId: account.userId,
      accountId: account.id,
    });
    await deps.updateTrackedAccountCursor(tx, account.id, cursor);
    progress.gameCount += monthGames.length;
    progress.inserted += inserted;
  });
}
