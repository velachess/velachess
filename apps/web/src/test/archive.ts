import type { Game } from "../games/list/queries.ts";
import { ME, resetGameIds } from "./games.ts";

/** One player's archive, in memory. Filters/pages for real — production's filtering rules aren't imported, so both sides check independently. */

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

/** What the detail read reports for one seat's provider identity — the server resolves it from a shared per-handle cache, tracked or not. */
export interface SeatProfile {
  avatarUrl: string | null;
  flair: string | null;
}

const NO_PROFILE: SeatProfile = { avatarUrl: null, flair: null };

interface ArchiveState {
  account: ArchiveAccount;
  games: Game[];
  incoming: Game[];
  /** Set when the server should answer the next refresh with 429. */
  refusesRefreshFor: number | null;
  /** Per game — what the detail read reports for each seat's identity. */
  identities: Map<string, { white: SeatProfile; black: SeatProfile }>;
  /** Scheduled syncs, by id. */
  syncs: Map<string, SyncJob>;
  /** How many status polls a sync answers `running` before it settles. */
  syncPolls: number;
  /** Set when the next sync should end `failed`. */
  syncFails: boolean;
}

export interface SyncJob {
  id: string;
  accountId: string;
  trigger: "connect" | "manual";
  status: "queued" | "running" | "retrying" | "succeeded" | "failed";
  gamesInserted: number | null;
  error: { code: "incomplete"; retryable: true } | null;
  pollsLeft: number;
  fails: boolean;
}

function fresh(): ArchiveState {
  return {
    account: { ...DEFAULT_ACCOUNT },
    games: [],
    incoming: [],
    refusesRefreshFor: null,
    identities: new Map(),
    syncs: new Map(),
    syncPolls: 0,
    syncFails: false,
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

/** Games a refresh will pull in. A second refresh finds nothing. */
export function stageIncomingGames(...games: Game[]): void {
  state.incoming.push(...games);
}

/** Makes the next refresh answer 429, as the cooldown does. */
export function refuseRefreshFor(seconds: number): void {
  state.refusesRefreshFor = seconds;
}

/** The game a detail read finds, or undefined for a 404. */
export function gameById(id: string): Game | undefined {
  return state.games.find((game) => game.id === id);
}

/** What the provider cache holds for this game's two seats. Absent sides stay on initials. */
export function stageSeatIdentities(
  gameId: string,
  seats: { white?: Partial<SeatProfile>; black?: Partial<SeatProfile> },
): void {
  state.identities.set(gameId, {
    white: { ...NO_PROFILE, ...seats.white },
    black: { ...NO_PROFILE, ...seats.black },
  });
}

/** Shaped exactly as GET /games/:id reports it. */
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
  color: string | null;
  outcome: string | null;
  timeClass: string | null;
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
    .filter((game) => view.color === null || game.perspective === view.color)
    .filter((game) => view.outcome === null || hasOutcome(game, view.outcome))
    .filter((game) => view.timeClass === null || timeClassOf(game) === view.timeClass)
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

/** Sync status polls answer `running` this many times before settling. */
export function syncTakesPolls(polls: number): void {
  state.syncPolls = polls;
}

/** Makes the next sync end `failed`, as a pass that never completed does. */
export function failNextSync(): void {
  state.syncFails = true;
}

/** Schedules a sync — the games arrive only once it settles, as with the worker. */
export function scheduleSync(accountId: string, trigger: SyncJob["trigger"]): SyncJob {
  const job: SyncJob = {
    id: `sync-${state.syncs.size + 1}`,
    accountId,
    trigger,
    status: "queued",
    gamesInserted: null,
    error: null,
    pollsLeft: state.syncPolls,
    fails: state.syncFails,
  };
  state.syncFails = false;
  state.syncs.set(job.id, job);
  return job;
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

/** One status poll: `running` while polls are left, then the outcome, landing the games. */
export function pollSync(id: string): SyncJob | undefined {
  const job = state.syncs.get(id);
  if (!job || job.status === "succeeded" || job.status === "failed") return job;

  if (job.pollsLeft > 0) {
    job.pollsLeft -= 1;
    job.status = "running";
    return job;
  }

  if (job.fails) {
    job.status = "failed";
    job.error = { code: "incomplete", retryable: true };
    return job;
  }
  job.gamesInserted = state.incoming.length;
  state.games.push(...state.incoming);
  state.incoming = [];
  job.status = "succeeded";
  return job;
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
