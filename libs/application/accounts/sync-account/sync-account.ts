/**
 * SyncAccount — the refresh behavior, with its two triggers.
 *
 * One slice, two entry points: `refreshAccount` is the HTTP trigger
 * (interactive, rate-limited, answers the person who tapped refresh) and
 * `processAccountSync` is the delivery-agnostic core the worker's sync
 * consumer also invokes. They are one behavior — pull, judge, seed —
 * not two; what differs is who is waiting.
 */
import type { AnalysisQueue } from "@velachess/queue/ports";

import { judgeGamesForUser } from "../../games/judge-games/judge-games.ts";
import { triageAndSeed } from "../../drills/seed-exercises/seed-exercises.ts";
import { ensureCandidateRepertoires } from "../../repertoires/extract-repertoire/extract-repertoire.ts";

import type { FetchFn } from "@velachess/platforms";
import { fetchChessCom, fetchLichess } from "@velachess/platforms";
import type { ChessComCursor, LichessCursor } from "@velachess/platforms";
import type { Database } from "@velachess/db";
import {
  getTrackedAccount,
  getTrackedAccountForUser,
  markTrackedAccountSynced,
  saveGames,
  updateTrackedAccountCursor,
} from "@velachess/db";

export interface SyncDeps {
  fetch?: FetchFn;
}

export interface SyncOutcome {
  saved: number;
  failures: number;
  complete: boolean;
  /** Games the repertoire judged on this pass. */
  judged: number;
  /** Deviations that became exercises. */
  seeded: number;
}

/** Cursor advances only on a complete pass — a partial page failure keeps
 * what was saved but retries from the same cursor next time. */
export async function syncAccount(
  db: Database,
  accountId: string,
  deps: SyncDeps = {},
): Promise<SyncOutcome> {
  const account = await getTrackedAccount(db, accountId);
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

  const { inserted } = await saveGames(db, result.games, { accountId });

  if (result.complete) {
    // Two facts, two writes: where to resume, and that a pass finished.
    // An empty archive completes and yields no cursor — it still synced.
    if (result.cursor) await updateTrackedAccountCursor(db, accountId, result.cursor);
    await markTrackedAccountSynced(db, accountId);
  }

  // syncAccount is the fetch half; judging is the caller's business.
  return {
    saved: inserted,
    failures: result.failures.length,
    complete: result.complete,
    judged: 0,
    seeded: 0,
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
  | { status: "refreshed"; saved: number; judged: number; seeded: number }
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
 * What the refresh button does: pull, judge, seed, and say what changed.
 *
 * Interactive and synchronous, like importing — someone waiting on a
 * button needs an answer, and "nothing new" is an answer. The queue stays
 * for refreshes nobody is watching.
 */
export async function refreshAccount(
  db: Database,
  userId: string,
  accountId: string,
  queue: AnalysisQueue,
  deps: SyncDeps = {},
): Promise<RefreshOutcome> {
  // Scoped by owner: someone else's account id answers not-found, the
  // same as an id that never existed — a sync is work done on your
  // behalf, and the caller's session decides whose behalf that is.
  const account = await getTrackedAccountForUser(db, userId, accountId);
  if (!account) return { status: "not-found" };

  const retryAfterSeconds = secondsUntilRefreshAllowed(account.lastSyncedAt);
  if (retryAfterSeconds > 0) return { status: "too-soon", retryAfterSeconds };

  const outcome = await processAccountSync(db, accountId, queue, deps);
  return {
    status: "refreshed",
    saved: outcome.saved,
    judged: outcome.judged,
    seeded: outcome.seeded,
  };
}

/**
 * The refresh routine, whole: pull what's new, insist on completeness (a
 * partial pass keeps its saves but the delivery must fail and retry from
 * the same cursor), then bring the drilling routines up to date — judge
 * the new games against the repertoire, and seed exercises from the
 * deviations that already carry a severity.
 *
 * No engine runs here, by design. Judging is replay; severity comes from
 * a report, and reports are produced by opening a game. So refreshing an
 * archive of hundreds of games costs hundreds of replays, not hundreds of
 * Stockfish runs.
 */
export async function processAccountSync(
  db: Database,
  accountId: string,
  queue: AnalysisQueue,
  deps: SyncDeps = {},
): Promise<SyncOutcome> {
  const outcome = await syncAccount(db, accountId, deps);
  if (!outcome.complete) {
    throw new Error(`sync of ${accountId} incomplete (${outcome.failures} failures)`);
  }

  const account = await getTrackedAccount(db, accountId);
  if (!account?.userId) return outcome;

  // Repertoires grow from games, so they are derived here rather than
  // asked for: a color with no preparation gets its candidate book the
  // moment there are games to derive one from, and confirmed
  // preparation is never touched. Before judging, so the new book's
  // chapters are part of this pass.
  await ensureCandidateRepertoires(db, account.userId, { newGames: outcome.saved });

  const judged = await judgeGamesForUser(db, account.userId, queue);
  const triaged = await triageAndSeed(db, account.userId);

  return { ...outcome, judged: judged.judged, seeded: triaged.seeded };
}
