/**
 * ProcessSync — one pg-boss delivery of a sync job: mark it running, pull
 * what is new, and persist it with the outcome in one transaction.
 *
 * The fetch runs outside any transaction. Every write runs inside one that
 * also settles the delivery with pg-boss, which fences the settle to the
 * attempt this delivery holds: a delivery that lost the job (timed out, or
 * taken over by a retry) gets `false`, and rolls everything back — no games,
 * no cursor, no status. No engine runs here, by design: analysis has one
 * trigger, opening a game.
 */
import type {
  ChessComCursor,
  FetchFn,
  LichessCursor,
  NormalizedGame,
  SyncResult,
} from "@velachess/infra-platforms";
import { fetchChessCom, fetchLichess } from "@velachess/infra-platforms";
import type { Database, TrackedAccount } from "@velachess/infra-db";

/** Database and a Drizzle transaction share this type in this codebase. */
type Tx = Database;
type Cursor = ChessComCursor | LichessCursor;
type ErrorCode = "not-found" | "incomplete" | "internal";
type Attempt = { id: string; retryCount: number };
type Outcome = {
  status: "succeeded" | "retrying" | "failed";
  errorCode: ErrorCode | null;
  gamesFetched?: number;
  gamesInserted?: number;
};

type MarkSyncRunning = (id: string) => Promise<{ accountId: string } | null>;
type GetTrackedAccount = (accountId: string) => Promise<TrackedAccount | null>;
type WithTransaction = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
type LockSyncJob = (tx: Tx, id: string) => Promise<boolean>;
type FinishSyncJob = (tx: Tx, id: string, outcome: Outcome) => Promise<void>;
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
/** Settle the delivery with the queue, in `tx`. False when this delivery no
 * longer holds the job. */
type CompleteDelivery = (tx: Tx, delivery: Attempt) => Promise<boolean>;
type FailDelivery = (tx: Tx, delivery: Attempt) => Promise<boolean>;

export interface ProcessSyncDeps {
  markSyncRunning: MarkSyncRunning;
  getTrackedAccount: GetTrackedAccount;
  withTransaction: WithTransaction;
  lockSyncJob: LockSyncJob;
  finishSyncJob: FinishSyncJob;
  saveGames: SaveGames;
  updateTrackedAccountCursor: UpdateTrackedAccountCursor;
  markTrackedAccountSynced: MarkTrackedAccountSynced;
  completeDelivery: CompleteDelivery;
  failDelivery: FailDelivery;
  /** Composed once, at wiring time — the fixture a test harness reads
   * through instead of the network. Never varies per call. */
  fetch?: FetchFn;
}

/** The generic fetch-override bag every route/worker composition reads to
 * decide whether a slice talks to the real network or a test fixture —
 * shared by `@velachess/games`'s provider-profile fetch and this module's
 * account fetch, since both narrow to the exact same shape. */
export interface SyncDeps {
  fetch?: FetchFn;
}

/** What a delivery knows about itself, straight from pg-boss. */
export interface SyncDelivery {
  syncJobId: string;
  /** Retries already spent, and allowed, by the queue's policy. */
  retryCount: number;
  retryLimit: number;
  /** Aborted by pg-boss when the delivery outlives its expiry or loses
   * its claim to a retry. */
  signal: AbortSignal;
}

export async function processSync(
  deps: ProcessSyncDeps,
  delivery: SyncDelivery,
): Promise<void> {
  const { syncJobId: id, signal } = delivery;
  const attempt: Attempt = { id, retryCount: delivery.retryCount };
  const job = await deps.markSyncRunning(id);
  // Gone with its account, or already settled: nothing left to do.
  if (!job) return;
  const lastAttempt = delivery.retryCount >= delivery.retryLimit;
  const internal: Outcome = {
    status: lastAttempt ? "failed" : "retrying",
    errorCode: "internal",
  };

  const account = await deps.getTrackedAccount(job.accountId);
  if (!account) return;

  /** Writes the outcome and settles the delivery as one commit: `fail`
   * lets pg-boss retry or dead-letter it, `complete` ends it. */
  const commit = (
    outcome: Outcome,
    settle: "complete" | "fail",
    write?: (tx: Tx) => Promise<Partial<Outcome>>,
  ) =>
    deps.withTransaction(async (tx) => {
      // The job row first, then the account through the games' FK: the
      // order disconnecting takes them in.
      if (!(await deps.lockSyncJob(tx, id))) return;
      const counts = write ? await write(tx) : {};
      await deps.finishSyncJob(tx, id, { ...outcome, ...counts });
      const held =
        settle === "fail"
          ? await deps.failDelivery(tx, attempt)
          : await deps.completeDelivery(tx, attempt);
      if (!held) throw new Error(`sync ${id} attempt ${attempt.retryCount} lost the job`);
    });

  let result: SyncResult & { cursor: Cursor | null };
  try {
    result = await fetchArchive(account, {
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
      signal,
    });
  } catch (error) {
    await commit(internal, "fail");
    throw error;
  }

  // The handle no longer exists at the provider. Permanent: retrying cannot
  // fix it, and the account and its games stay as they are.
  if (result.failures.some((failure) => failure.reason === "not-found")) {
    await commit({ status: "failed", errorCode: "not-found" }, "complete");
    return;
  }
  // pg-boss aborts the signal once this delivery outlived its expiry or lost
  // its claim; the commit below would be refused anyway.
  if (signal.aborted) {
    await commit(internal, "fail");
    throw signal.reason;
  }

  // A partial pass keeps its saves but not its cursor, so the retry starts
  // from the same place and the unique constraints absorb the repeats.
  const incomplete = result.complete
    ? null
    : new Error(`sync ${id} incomplete (${result.failures.length} failures)`);
  const outcome: Outcome = incomplete
    ? { status: lastAttempt ? "failed" : "retrying", errorCode: "incomplete" }
    : { status: "succeeded", errorCode: null };

  await commit(outcome, incomplete ? "fail" : "complete", async (tx) => {
    const { inserted } = await deps.saveGames(tx, result.games, {
      userId: account.userId,
      accountId: account.id,
    });
    if (result.complete) {
      // An empty archive completes and yields no cursor — it still synced.
      if (result.cursor)
        await deps.updateTrackedAccountCursor(tx, account.id, result.cursor);
      await deps.markTrackedAccountSynced(tx, account.id);
    }
    return { gamesFetched: result.games.length, gamesInserted: inserted };
  });

  if (incomplete) throw incomplete;
}

function fetchArchive(
  account: TrackedAccount,
  opts: { fetch?: FetchFn; signal: AbortSignal },
) {
  return account.platform === "chess_com"
    ? fetchChessCom(
        account.username,
        (account.syncCursor as ChessComCursor | null) ?? null,
        opts,
      )
    : fetchLichess(
        account.username,
        (account.syncCursor as LichessCursor | null) ?? null,
        opts,
      );
}
