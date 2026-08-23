import type { GradedPly } from "../games/analysis-contract.ts";
import type { Game } from "../games/list/queries.ts";
import { ME, resetGameIds } from "./games.ts";

/** One player's archive, in memory. Filters/pages for real — production's filtering rules aren't imported, so both sides check independently. */

type Platform = "chess_com" | "lichess";

export interface ArchiveAccount {
  id: string;
  platform: Platform;
  username: string;
  /** Provider identity, as the real route returns it. */
  avatarUrl: string | null;
  flair: string | null;
  lastSyncedAt: string | null;
}

const DEFAULT_ACCOUNT: ArchiveAccount = {
  id: "account-1",
  platform: "chess_com",
  username: ME,
  avatarUrl: null,
  flair: null,
  lastSyncedAt: "2026-05-04T18:30:00.000Z",
};

/** How the server answers an analysis request. `elsewhere` counts reads: first says "running", next delivers — the 202 convergence. */
export type AnalysisAnswer =
  | {
      kind: "stream";
      moves: GradedPly[];
      /** Chunk size in bytes — a real stream never guarantees a chunk is a whole frame. */
      chunkBytes?: number;
      /** Ends the first connection early, no terminal frame, like a dropped socket; reconnect replays from the start. */
      dropsAfter?: number;
    }
  | { kind: "cached"; moves: GradedPly[] }
  | { kind: "elsewhere"; moves: GradedPly[]; reads: number }
  | { kind: "failed" };

interface ArchiveState {
  account: ArchiveAccount;
  games: Game[];
  incoming: Game[];
  /** Set when the server should answer the next refresh with 429. */
  refusesRefreshFor: number | null;
  /** Per game — absent means "never analyzed", which streams empty. */
  analyses: Map<string, AnalysisAnswer>;
  watches: number;
}

function fresh(): ArchiveState {
  return {
    account: { ...DEFAULT_ACCOUNT },
    games: [],
    incoming: [],
    refusesRefreshFor: null,
    analyses: new Map(),
    watches: 0,
  };
}

let state: ArchiveState = fresh();

export function resetArchive(): void {
  state = fresh();
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

export function stageAnalysis(gameId: string, answer: AnalysisAnswer): void {
  state.analyses.set(gameId, answer);
}

/** Counted because a reopening EventSource is invisible on screen — this is the only tell. */
export function watchCount(): number {
  return state.watches;
}

export function countWatch(): number {
  state.watches += 1;
  return state.watches;
}

export function analysisAnswerFor(gameId: string): AnalysisAnswer | undefined {
  return state.analyses.get(gameId);
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
  | { status: "refreshed"; saved: number };

export function refreshArchive(accountId: string): RefreshResult {
  if (accountId !== state.account.id) return { status: "not-found" };

  if (state.refusesRefreshFor !== null) {
    const retryAfterSeconds = state.refusesRefreshFor;
    // Spent, not permanent — a refusal that never lifts makes "try again
    // in a moment" untestable.
    state.refusesRefreshFor = null;
    return { status: "too-soon", retryAfterSeconds };
  }

  const saved = state.incoming.length;
  state.games.push(...state.incoming);
  state.incoming = [];

  return { status: "refreshed", saved };
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
