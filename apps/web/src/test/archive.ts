import type { Game } from "../games/list/index.ts";
import { ME, resetGameIds } from "./games.ts";
import { announceSync } from "./sync-stream.ts";

/** One player's archive, in memory. It filters and pages for real, without
 * importing production's rules, so both sides check independently. */

type Platform = "chess_com" | "lichess";

export interface ArchiveAccount {
  id: string;
  platform: Platform;
  username: string;
  lastSyncedAt: string | null;
}

const DEFAULT_ACCOUNT: ArchiveAccount = {
  id: "account-1",
  platform: "chess_com",
  username: ME,
  lastSyncedAt: "2026-05-04T18:30:00.000Z",
};

/** One seat's provider identity, which the server resolves from a shared
 * per-handle cache. */
export type SeatProfile = Game["whiteIdentity"];

const NO_PROFILE: SeatProfile = { avatarUrl: null, flair: null, countryCode: null };

interface ArchiveState {
  account: ArchiveAccount;
  games: Game[];
  incoming: Game[];
  /** Set when the next refresh should answer 429. */
  refusesRefreshFor: number | null;
  identities: Map<string, { white: SeatProfile; black: SeatProfile }>;
  movetext: Map<string, string>;
  syncs: Map<string, SyncJob>;
}

export interface SyncJob {
  id: string;
  accountId: string;
  trigger: "connect" | "manual";
  status: "queued" | "running" | "retrying" | "succeeded" | "failed";
  gamesInserted: number | null;
}

function fresh(): ArchiveState {
  return {
    account: { ...DEFAULT_ACCOUNT },
    games: [],
    incoming: [],
    refusesRefreshFor: null,
    identities: new Map(),
    movetext: new Map(),
    syncs: new Map(),
  };
}

let state: ArchiveState = fresh();

export function resetArchive(): void {
  state = fresh();
  pgnImportState = freshImportPlan();
  resetGameIds();
}

export function archiveAccount(): ArchiveAccount {
  return state.account;
}

export function addGames(...games: Game[]): void {
  state.games.push(...games);
}

/** A second refresh finds nothing. */
export function stageIncomingGames(...games: Game[]): void {
  state.incoming.push(...games);
}

/** As the cooldown does. */
export function refuseRefreshFor(seconds: number): void {
  state.refusesRefreshFor = seconds;
}

/** Undefined means the detail read answers 404. */
export function gameById(id: string): Game | undefined {
  return state.games.find((game) => game.id === id);
}

/** For when the default Scholar's mate is not the game under test. */
export function stageMovetext(gameId: string, rawPgn: string): void {
  state.movetext.set(gameId, rawPgn);
}

export function movetextOf(gameId: string): string | undefined {
  return state.movetext.get(gameId);
}

/** An absent side stays on initials. */
export function stageSeatIdentities(
  gameId: string,
  seats: { white?: Partial<SeatProfile>; black?: Partial<SeatProfile> },
): void {
  state.identities.set(gameId, {
    white: { ...NO_PROFILE, ...seats.white },
    black: { ...NO_PROFILE, ...seats.black },
  });
}

/** Shaped as GET /games/:id reports it. */
export function seatIdentityFields(gameId: string): {
  whiteIdentity: SeatProfile;
  blackIdentity: SeatProfile;
} {
  const staged = state.identities.get(gameId);
  return {
    whiteIdentity: staged?.white ?? { ...NO_PROFILE },
    blackIdentity: staged?.black ?? { ...NO_PROFILE },
  };
}

/**
 * What the next PGN upload does. Success lands its games in the library;
 * `refuses` answers like an unreachable server. Reset with the archive.
 */
export interface PgnImportPlan {
  incoming: Game[];
  duplicates: number;
  rejected: number;
  refuses: boolean;
}

function freshImportPlan(): PgnImportPlan {
  return { incoming: [], duplicates: 0, rejected: 0, refuses: false };
}

let pgnImportState: PgnImportPlan = freshImportPlan();

export const pgnImport = {
  get incoming() {
    return pgnImportState.incoming;
  },
  get duplicates() {
    return pgnImportState.duplicates;
  },
  get rejected() {
    return pgnImportState.rejected;
  },
  get refuses() {
    return pgnImportState.refuses;
  },
};

export function stagePgnImport(plan: Partial<PgnImportPlan>): void {
  pgnImportState = { ...freshImportPlan(), ...plan };
}

/** Unknown player -> 404, not an empty archive — how a test tells "no such user" from "no games yet". */
export function knowsPlayer(platform: string, username: string): boolean {
  return (
    platform === state.account.platform &&
    username.toLowerCase() === state.account.username.toLowerCase()
  );
}

export interface ArchiveView {
  opponent: string | null;
  color: string | null;
  outcome: string | null;
  timeClasses: string[];
  source: string | null;
  page: number;
  pageSize: number;
}

export interface ArchivePage {
  games: Game[];
  /** Matching the filters, not the page — the pager needs the whole count. */
  total: number;
  page: number;
  pageSize: number;
}

export function readArchive(view: ArchiveView): ArchivePage {
  const matching = state.games
    .filter((game) => view.opponent === null || facesOpponent(game, view.opponent))
    .filter((game) => view.color === null || game.perspective === view.color)
    .filter((game) => view.outcome === null || hasOutcome(game, view.outcome))
    .filter(
      (game) =>
        view.timeClasses.length === 0 ||
        view.timeClasses.includes(timeClassOf(game) ?? ""),
    )
    .filter((game) => view.source === null || game.source === view.source)
    // Newest first, as the query orders it: paging assertions are only
    // meaningful against a defined order.
    .toSorted((left, right) => (right.playedAt ?? "").localeCompare(left.playedAt ?? ""));

  const from = (view.page - 1) * view.pageSize;

  return {
    games: matching.slice(from, from + view.pageSize),
    total: matching.length,
    page: view.page,
    pageSize: view.pageSize,
  };
}

export type RefreshResult =
  | { status: "not-found" }
  | { status: "too-soon"; retryAfterSeconds: number }
  | { status: "accepted"; job: SyncJob };

/** Schedules a sync — active until `landSync`, the way the worker leaves it. */
export function scheduleSync(accountId: string, trigger: SyncJob["trigger"]): SyncJob {
  const job: SyncJob = {
    id: `sync-${state.syncs.size + 1}`,
    accountId,
    trigger,
    status: "queued",
    gamesInserted: null,
  };
  state.syncs.set(job.id, job);
  return job;
}

/** The account's newest scheduled sync — what a click just started. */
export function latestSync(): SyncJob {
  const job = [...state.syncs.values()].at(-1);
  if (!job) throw new Error("no sync has been scheduled");
  return job;
}

/**
 * The worker finishing: the staged games land (or not), the row settles,
 * and the stream announces it — in that order, as pg_notify on commit
 * would have it.
 */
export function landSync(id: string, options: { fails?: boolean } = {}): void {
  const job = state.syncs.get(id);
  if (!job) throw new Error(`no sync ${id}`);
  if (options.fails) {
    job.status = "failed";
    announceSync("sync.failed", job);
    return;
  }
  job.gamesInserted = state.incoming.length;
  state.games.push(...state.incoming);
  state.incoming = [];
  job.status = "succeeded";
  announceSync("sync.completed", job);
}

export function refreshArchive(accountId: string): RefreshResult {
  if (accountId !== state.account.id) return { status: "not-found" };

  if (state.refusesRefreshFor !== null) {
    const retryAfterSeconds = state.refusesRefreshFor;
    // Spent, not permanent — a refusal that never lifts makes "try again
    // in a moment" untestable.
    state.refusesRefreshFor = null;
    return { status: "too-soon", retryAfterSeconds };
  }

  return { status: "accepted", job: scheduleSync(accountId, "manual") };
}

/** The job active for an account, as `GET /accounts` reports it. */
export function activeSyncOf(accountId: string): SyncJob | undefined {
  return [...state.syncs.values()].find(
    (job) =>
      job.accountId === accountId &&
      job.status !== "succeeded" &&
      job.status !== "failed",
  );
}

/**
 * The opponent is the seat you did not have; an unattributed game has no
 * opponent, so both names answer. Mirrors the server's predicate.
 */
function facesOpponent(game: Game, term: string): boolean {
  const needle = term.toLowerCase();
  const names =
    game.perspective === null
      ? [game.whiteName, game.blackName]
      : [game.perspective === "white" ? game.blackName : game.whiteName];
  return names.some((name) => name.toLowerCase().includes(needle));
}

/** Which side you were on decides whether "1-0" is good news. */
const WINNING_RESULT = { white: "1-0", black: "0-1" } as const;

function hasOutcome(game: Game, outcome: string): boolean {
  if (game.result === "1/2-1/2") return outcome === "draw";
  if (game.result === "*" || game.perspective === null) return false;

  const won = game.result === WINNING_RESULT[game.perspective];
  return outcome === (won ? "win" : "loss");
}

/**
 * Bucketed by estimated duration, not the clock alone — 3+2 plays like a
 * much longer game than 3+0. Mirrors the server's `timeClassOf`.
 */
const ESTIMATED_MOVES = 40;
const TIME_CLASS_CEILINGS = { bullet: 180, blitz: 480, rapid: 1500 } as const;

function timeClassOf(game: Game): string | null {
  if (game.timeControlInitialSeconds === null) return null;

  const seconds =
    game.timeControlInitialSeconds +
    ESTIMATED_MOVES * (game.timeControlIncrementSeconds ?? 0);
  if (seconds < TIME_CLASS_CEILINGS.bullet) return "bullet";
  if (seconds < TIME_CLASS_CEILINGS.blitz) return "blitz";
  if (seconds < TIME_CLASS_CEILINGS.rapid) return "rapid";
  return "classical";
}
