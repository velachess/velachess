/**
 * SyncAccount — the refresh behavior, with its two triggers.
 *
 * One slice, two entry points: `refreshAccount` is the HTTP trigger
 * (interactive, rate-limited, answers the person who tapped refresh) and
 * `processAccountSync` is the delivery-agnostic core the worker's sync
 * consumer also invokes. They are one behavior — pull and persist — not
 * two; what differs is who is waiting.
 */
import type {
  ChessComCursor,
  FetchFn,
  LichessCursor,
  NormalizedGame,
} from "@velachess/infra-platforms";
import { fetchChessCom, fetchLichess } from "@velachess/infra-platforms";
import type { TrackedAccount } from "@velachess/infra-db";

type GetTrackedAccount = (accountId: string) => Promise<TrackedAccount | null>;
type GetTrackedAccountForUser = (
  userId: string,
  accountId: string,
) => Promise<TrackedAccount | null>;
type SaveGames = (
  games: NormalizedGame[],
  opts: { userId: string; accountId: string },
) => Promise<{ inserted: number }>;
type UpdateTrackedAccountCursor = (
  accountId: string,
  cursor: ChessComCursor | LichessCursor,
) => Promise<void>;
type MarkTrackedAccountSynced = (accountId: string) => Promise<void>;

export interface SyncAccountDeps {
  getTrackedAccount: GetTrackedAccount;
  getTrackedAccountForUser: GetTrackedAccountForUser;
  saveGames: SaveGames;
  updateTrackedAccountCursor: UpdateTrackedAccountCursor;
  markTrackedAccountSynced: MarkTrackedAccountSynced;
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

export interface SyncOutcome {
  saved: number;
  failures: number;
  complete: boolean;
}

/** Cursor advances only on a complete pass — a partial page failure keeps
 * what was saved but retries from the same cursor next time. */
export async function syncAccount(
  deps: SyncAccountDeps,
  accountId: string,
): Promise<SyncOutcome> {
  const account = await deps.getTrackedAccount(accountId);
  if (!account) throw new Error(`Tracked account ${accountId} not found`);

  const opts = deps.fetch ? { fetch: deps.fetch } : {};
  const result =
    account.platform === "chess_com"
      ? await fetchChessCom(
          account.username,
          (account.syncCursor as ChessComCursor | null) ?? null,
          opts,
        )
      : await fetchLichess(
          account.username,
          (account.syncCursor as LichessCursor | null) ?? null,
          opts,
        );

  // Ownership is direct (the account's user); the account rides along as
  // provenance and dedup scope.
  const { inserted } = await deps.saveGames(result.games, {
    userId: account.userId,
    accountId,
  });

  if (result.complete) {
    // Two facts, two writes: where to resume, and that a pass finished.
    // An empty archive completes and yields no cursor — it still synced.
    if (result.cursor) await deps.updateTrackedAccountCursor(accountId, result.cursor);
    await deps.markTrackedAccountSynced(accountId);
  }

  return {
    saved: inserted,
    failures: result.failures.length,
    complete: result.complete,
  };
}

/**
 * How long an account rests between refreshes.
 *
 * Both platforms publish rate limits and answer 429 to bursts, and a
 * refresh button is exactly the control someone taps twice. One minute is
 * short enough to feel responsive and long enough that leaning on it
 * costs the platform nothing.
 */
export const SYNC_COOLDOWN_SECONDS = 60;

export type RefreshOutcome =
  | { status: "refreshed"; saved: number }
  | { status: "too-soon"; retryAfterSeconds: number }
  | { status: "not-found" };

export function secondsUntilRefreshAllowed(
  lastSyncedAt: Date | null,
  now = new Date(),
): number {
  if (!lastSyncedAt) return 0;

  const elapsed = (now.getTime() - lastSyncedAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(SYNC_COOLDOWN_SECONDS - elapsed));
}

/**
 * What the refresh button does: pull, persist, and say what changed.
 *
 * Interactive and synchronous, like importing — someone waiting on a
 * button needs an answer, and "nothing new" is an answer. The queue stays
 * for refreshes nobody is watching.
 */
export async function refreshAccount(
  deps: SyncAccountDeps,
  userId: string,
  accountId: string,
): Promise<RefreshOutcome> {
  // Scoped by owner: someone else's account id answers not-found, the
  // same as an id that never existed — a sync is work done on your
  // behalf, and the caller's session decides whose behalf that is.
  const account = await deps.getTrackedAccountForUser(userId, accountId);
  if (!account) return { status: "not-found" };

  const retryAfterSeconds = secondsUntilRefreshAllowed(account.lastSyncedAt);
  if (retryAfterSeconds > 0) return { status: "too-soon", retryAfterSeconds };

  const outcome = await processAccountSync(deps, accountId);
  return { status: "refreshed", saved: outcome.saved };
}

/**
 * The refresh routine, whole: pull what's new and insist on completeness
 * — a partial pass keeps its saves but the delivery must fail and retry
 * from the same cursor. No engine runs here, by design: analysis has one
 * trigger, opening a game.
 */
export async function processAccountSync(
  deps: SyncAccountDeps,
  accountId: string,
): Promise<SyncOutcome> {
  const outcome = await syncAccount(deps, accountId);
  if (!outcome.complete) {
    throw new Error(`sync of ${accountId} incomplete (${outcome.failures} failures)`);
  }
  return outcome;
}
