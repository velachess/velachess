// @vitest-environment node
/**
 * Repository-wide integration suite: the full sync -> list -> analyze
 * pipeline exercised across the business module packages, against the
 * real harness (PGlite + migrations + pg-boss + advisory lock), Stockfish
 * real where the engine runs.
 *
 * Lives at the repo root, not inside any one module, because it is a
 * genuine cross-module fact: no single package owns "importing a game
 * makes it listable and analyzable." `process-analysis`'s own
 * TOCTOU/disconnect/streaming contract lives in
 * `libs/analysis/tests/execution.test.ts` — that behavior is private to
 * one slice, not a cross-module pipeline fact.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@velachess/infra-db";
import type { GameFilters, GamePage } from "@velachess/infra-db";
import {
  appendProgress,
  clearProgress,
  createUser,
  findProviderProfiles,
  getAnalysis,
  getGame,
  getTrackedAccount,
  getTrackedAccountForUser,
  isProfileFresh,
  listGamesPage,
  markTrackedAccountSynced,
  saveAnalysis,
  saveGames,
  updateTrackedAccountCursor,
  upsertProviderProfile,
  upsertTrackedAccount,
} from "@velachess/infra-db";
import { openLibrary, type ListGamesDeps } from "@velachess/games";
import {
  importAccount,
  syncAccount,
  type ConnectAccountDeps,
  type SyncAccountDeps,
  type SyncDeps,
} from "@velachess/accounts";
import { completeAnalysis, type AnalyzeDeps } from "@velachess/analysis";

import { LISTER_USERNAME, LOOPER_USERNAME } from "@velachess/fixtures";
import {
  chessComFixtureFetch,
  chessComListingFixtureFetch,
  createLoopHarness,
  makeStockfishSession as makeSession,
  type LoopHarness,
} from "@velachess/test-utils";

let h: LoopHarness;

function listGamesDeps(db: Database): ListGamesDeps {
  return {
    listGamesPage: (userId, filters, page) => listGamesPage(db, userId, filters, page),
  };
}

/**
 * The same adapter apps/server/src/composition/accounts.ts's
 * buildSyncAccountDeps builds, restated here: libs never import from
 * apps, and @velachess/accounts's sync-account slice is narrow-deps, not
 * Database-first.
 */
function syncAccountDeps(db: Database, fetch?: SyncDeps["fetch"]): SyncAccountDeps {
  return {
    getTrackedAccount: (accountId) => getTrackedAccount(db, accountId),
    getTrackedAccountForUser: (userId, accountId) =>
      getTrackedAccountForUser(db, userId, accountId),
    saveGames: (newGameRows, opts) => saveGames(db, newGameRows, opts),
    updateTrackedAccountCursor: (accountId, cursor) =>
      updateTrackedAccountCursor(db, accountId, cursor),
    markTrackedAccountSynced: (accountId) => markTrackedAccountSynced(db, accountId),
    ...(fetch ? { fetch } : {}),
  };
}

function importAccountDeps(db: Database, fetch?: SyncDeps["fetch"]): ConnectAccountDeps {
  const syncDeps = syncAccountDeps(db, fetch);
  return {
    findProviderProfiles: (seats) => findProviderProfiles(db, seats),
    upsertProviderProfile: (seat, fetched) => upsertProviderProfile(db, seat, fetched),
    isProfileFresh,
    upsertTrackedAccount: (userId, platform, username) =>
      upsertTrackedAccount(db, userId, platform, username),
    getTrackedAccount: (accountId) => getTrackedAccount(db, accountId),
    syncAccount: (accountId) => syncAccount(syncDeps, accountId),
    ...(fetch ? { fetch } : {}),
  };
}

/**
 * The same adapter apps/worker/src/composition/analysis.ts builds,
 * restated here: `analysis/process-analysis`'s `completeAnalysis` is
 * narrow-deps, not Database-first.
 */
function analyzeDeps(db: Database, lock: LoopHarness["lock"]): AnalyzeDeps {
  return {
    makeSession,
    tryAcquireLock: (key) => lock.tryAcquire(key),
    getGame: (gameId) => getGame(db, gameId),
    getAnalysis: (gameId) => getAnalysis(db, gameId),
    withTransaction: (fn) => db.transaction(fn),
    saveAnalysis: (tx, gameId, data) => saveAnalysis(tx, gameId, data),
    appendProgress: (entry) => appendProgress(db, entry),
    clearProgress: (gameId) => clearProgress(db, gameId),
    depth: 8,
  };
}

// No archives at all: the index is the only request the provider makes.
const emptyArchive: typeof fetch = async () =>
  new Response(JSON.stringify({ archives: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

beforeAll(async () => {
  h = await createLoopHarness();
});

afterAll(() => h.close());

describe("application services (the flow, end to end)", () => {
  let userId: string;

  /**
   * Import (idempotent — first contact fills, later calls are no-ops)
   * then read the unified library.
   */
  async function openImported(
    username: string,
    view: { filters?: GameFilters; page?: GamePage } = {},
    syncDeps: SyncDeps = {},
    ownerId: string = userId,
  ) {
    const account = await importAccount(
      importAccountDeps(h.db, syncDeps.fetch),
      ownerId,
      "chess_com",
      username,
    );
    return { account, library: await openLibrary(listGamesDeps(h.db), ownerId, view) };
  }

  it("a user anchors the flow", async () => {
    // Identity now arrives from a session; the services still take a
    // plain userId, which is what this suite exercises.
    userId = (await createUser(h.db)).id;
    expect(userId).toBeTruthy();
  });

  it("sync: fixture archive lands as games, cursor advances, re-sync inserts nothing", async () => {
    const account = await upsertTrackedAccount(
      h.db,
      userId,
      "chess_com",
      LOOPER_USERNAME,
    );

    const first = await syncAccount(
      syncAccountDeps(h.db, chessComFixtureFetch()),
      account.id,
    );
    expect(first.saved).toBe(2);
    expect(first.complete).toBe(true);
    expect((await getTrackedAccount(h.db, account.id))?.syncCursor).not.toBeNull();

    expect((await getTrackedAccount(h.db, account.id))?.lastSyncedAt).not.toBeNull();

    const second = await syncAccount(
      syncAccountDeps(h.db, chessComFixtureFetch()),
      account.id,
    );
    expect(second.saved).toBe(0);
  });

  it("sync: an empty archive still marks the account as synced", async () => {
    // No games means no cursor to save. The two used to be one write, so an
    // account like this looked like one that had never synced — and the
    // route guard read that as a failed import.
    const account = await upsertTrackedAccount(h.db, userId, "chess_com", "emptyarchive");

    const outcome = await syncAccount(syncAccountDeps(h.db, emptyArchive), account.id);

    expect(outcome).toMatchObject({ saved: 0, complete: true });
    const synced = await getTrackedAccount(h.db, account.id);
    expect(synced?.syncCursor).toBeNull();
    expect(synced?.lastSyncedAt).not.toBeNull();
  });

  it("analyze: a synced game gets a real, persisted report", async () => {
    // `completeAnalysis` is the same public entry apps/worker's analysis
    // consumer calls — its own TOCTOU/streaming contract is covered at
    // libs/analysis/tests/execution.test.ts.
    const library = await openLibrary(listGamesDeps(h.db), userId, {});
    const gameId = library.games[0]!.id;

    await completeAnalysis(analyzeDeps(h.db, h.lock), gameId);

    const analysis = await getAnalysis(h.db, gameId);
    expect(analysis).not.toBeNull();
    expect(analysis!.positions.length).toBeGreaterThan(0);
  }, 120_000);

  it("importAccount: a first import fills the archive, a second one only reads", async () => {
    // Its own movetext: games dedupe per user and account, so reusing
    // the looper fixture here would save nothing and prove nothing.
    const freshArchive: typeof fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/archives")) {
        return Response.json({
          archives: ["https://api.chess.com/pub/player/fresh_import/games/2026/08"],
        });
      }
      return Response.json({
        games: [
          {
            url: "https://www.chess.com/game/live/9001",
            pgn: '[White "fresh_import"]\n[Black "opponent"]\n[Result "1-0"]\n\n1. b3 e5 2. Bb2 Nc6 1-0',
            rules: "chess",
            end_time: 1755200000,
          },
          {
            url: "https://www.chess.com/game/live/9002",
            pgn: '[White "opponent"]\n[Black "fresh_import"]\n[Result "0-1"]\n\n1. f4 d5 2. Nf3 Nf6 0-1',
            rules: "chess",
            end_time: 1755200100,
          },
        ],
      });
    }) as typeof fetch;

    // The unified library is per user — a fresh one, so these
    // assertions see exactly this import and nothing earlier in the
    // suite.
    const ownerId = (await createUser(h.db)).id;
    const { account, library } = await openImported(
      "Fresh_Import",
      {},
      { fetch: freshArchive },
      ownerId,
    );

    // Username normalised on the way in, games listed with status.
    expect(account.username).toBe("fresh_import");
    expect(account.lastSyncedAt).not.toBeNull();
    expect(library.games.length).toBe(2);

    // Which side was you is DERIVED for synced games, not stored: the
    // normalizer sees a PGN and no identity, so `games.perspective` is
    // null on everything synced. Without this derivation the list called
    // every game unfinished and drew every player white. The fixture has
    // one game from each seat.
    const bySeat = Object.fromEntries(library.games.map((g) => [g.perspective, g]));
    expect(Object.keys(bySeat).toSorted()).toEqual(["black", "white"]);
    expect(bySeat.white!.whiteName).toBe("fresh_import");
    expect(bySeat.black!.blackName).toBe("fresh_import");

    // Importing runs no engine. Analysis is intent —
    // an archive of hundreds of games must not queue hundreds of runs.
    for (const game of library.games) {
      expect(await h.analysisQueue.getState(game.id)).toBe("none");
      expect(game.analyzed).toBe(false);
    }

    // Second import never pulls the archive again: a fetch that would throw
    // on any game request. The profile endpoint is answered instead of
    // throwing — a re-import still refreshes identity by design — and
    // returning no avatar keeps what was stored.
    const again = await openImported(
      "fresh_import",
      {},
      {
        fetch: (async (input: RequestInfo | URL) => {
          const url = String(input);
          if (/\/pub\/player\/[^/]+$/.test(url)) {
            return Response.json({ username: "fresh_import" });
          }
          throw new Error("the archive was already filled");
        }) as unknown as typeof fetch,
      },
      ownerId,
    );
    expect(again.account.id).toBe(account.id);
    expect(again.library.games.length).toBe(2);
  });

  it("the library list: every field the games list renders survives the trip", async () => {
    // The contract test the list never had. Its columns read ratings, a
    // clock, an opening and a platform link — none of which the judging
    // fixtures carry, so a green suite said nothing about whether the
    // pipeline delivers them. This archive is tagged like a real one.
    const { library } = await openImported(
      LISTER_USERNAME,
      {},
      { fetch: chessComListingFixtureFetch() },
      // Same isolation: this user's library holds only what it imports.
      (await createUser(h.db)).id,
    );

    expect(library.games).toHaveLength(2);
    const asWhite = library.games.find((game) => game.perspective === "white")!;
    const asBlack = library.games.find((game) => game.perspective === "black")!;
    expect(asWhite).toBeDefined();
    expect(asBlack).toBeDefined();

    for (const game of library.games) {
      expect(game.whiteRating, "white rating").not.toBeNull();
      expect(game.blackRating, "black rating").not.toBeNull();
      expect(game.playedAt, "played at").not.toBeNull();
      expect(game.openingName, "opening").not.toBeNull();
      expect(game.externalUrl, "platform link").not.toBeNull();
      expect(game.timeControlInitialSeconds, "clock").not.toBeNull();
      expect(game.source).toBe("chess_com");
    }

    // Won from white's seat, lost from black's — the same "1-0" both times.
    expect(asWhite.result).toBe("1-0");
    expect(asBlack.result).toBe("1-0");
    expect(asWhite.openingName).toBe("French Defense");

    // 3+2 keeps its increment; without it the row would read "3 min".
    expect(asBlack.timeControlInitialSeconds).toBe(180);
    expect(asBlack.timeControlIncrementSeconds).toBe(2);
  });

  it("library filters read the derived seat, not the stored column", async () => {
    // The filter and the column have to agree. Pointed at the stored
    // `perspective` (null on everything synced) this returns nothing while
    // the list happily shows wins.
    const ownerId = (await createUser(h.db)).id;
    await openImported(
      LISTER_USERNAME,
      {},
      { fetch: chessComListingFixtureFetch() },
      ownerId,
    );

    const won = await openLibrary(listGamesDeps(h.db), ownerId, {
      filters: { outcome: "win" },
    });
    expect(won.games).toHaveLength(1);
    expect(won.games[0]!.perspective).toBe("white");
    expect(won.total).toBe(1);

    const lost = await openLibrary(listGamesDeps(h.db), ownerId, {
      filters: { outcome: "loss" },
    });
    expect(lost.games).toHaveLength(1);
    expect(lost.games[0]!.perspective).toBe("black");

    const asBlack = await openLibrary(listGamesDeps(h.db), ownerId, {
      filters: { color: "black" },
    });
    expect(asBlack.games).toHaveLength(1);

    // 10 min is rapid; 3+2 estimates to 300s, which is blitz.
    const blitz = await openLibrary(listGamesDeps(h.db), ownerId, {
      filters: { timeClass: "blitz" },
    });
    expect(blitz.games).toHaveLength(1);
    expect(blitz.games[0]!.timeControlInitialSeconds).toBe(180);
  });

  it("a page is a slice of the whole, and total ignores it", async () => {
    // Fresh owner again: the pager's totals must count one import, not
    // everything the suite has accumulated.
    const ownerId = (await createUser(h.db)).id;
    await openImported(
      LISTER_USERNAME,
      {},
      { fetch: chessComListingFixtureFetch() },
      ownerId,
    );
    const first = await openLibrary(listGamesDeps(h.db), ownerId, {
      page: { page: 1, pageSize: 1 },
    });
    const second = await openLibrary(listGamesDeps(h.db), ownerId, {
      page: { page: 2, pageSize: 1 },
    });

    expect(first.games).toHaveLength(1);
    expect(second.games).toHaveLength(1);
    // Newest first, and no row on two pages — the reason the ordering is
    // total (played_at, then id) instead of just the date.
    expect(first.games[0]!.id).not.toBe(second.games[0]!.id);
    expect(first.total).toBe(2);
    expect(second.total).toBe(2);
  });
});
