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

import type { NormalizedGame } from "@velachess/infra-platforms";

import type { Database } from "@velachess/infra-db";
import type { GameFilters, GamePage } from "@velachess/infra-db";
import {
  appendProgress,
  clearProgress,
  createSyncJob,
  createUser,
  deleteTrackedAccountAndGames,
  findTrackedAccountByPlatform,
  finishSyncJob,
  getAnalysis,
  getGame,
  getTrackedAccount,
  getTrackedAccountForUser,
  listGamesPage,
  lockSyncJob,
  markSyncRunning,
  markTrackedAccountSynced,
  markUserOnboarded,
  saveAnalysis,
  saveGames,
  updateTrackedAccountCursor,
  upsertProviderProfile,
  getSyncJobForUser,
  insertTrackedAccount,
} from "@velachess/infra-db";
import { openLibrary, type ListGamesDeps } from "@velachess/games";
import {
  disconnectAccount,
  importAccount,
  processSync,
  type ConnectAccountDeps,
  type ConnectOutcome,
  type DisconnectAccountDeps,
  type ProcessSyncDeps,
  type SyncDeps,
} from "@velachess/accounts";
import { completeAnalysis, type AnalyzeDeps } from "@velachess/analysis";

import { LISTER_USERNAME, LOOPER_USERNAME } from "@velachess/fixtures";
import {
  chessComFixtureFetch,
  chessComListingFixtureFetch,
  createLoopHarness,
  deliverSyncJob,
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
 * The same adapter apps/worker/src/composition/accounts.ts builds,
 * restated here: libs never import from apps, and @velachess/accounts's
 * process-sync slice is narrow-deps, not Database-first.
 */
function processSyncDeps(db: Database, fetch?: SyncDeps["fetch"]): ProcessSyncDeps {
  return {
    markSyncRunning: (id) => markSyncRunning(db, id),
    getTrackedAccount: (accountId) => getTrackedAccount(db, accountId),
    withTransaction: (fn) => db.transaction(fn),
    lockSyncJob,
    finishSyncJob,
    saveGames,
    updateTrackedAccountCursor,
    markTrackedAccountSynced,
    completeDelivery: (tx, delivery) => h.syncQueue.complete(tx, delivery),
    failDelivery: (tx, delivery) => h.syncQueue.fail(tx, delivery),
    ...(fetch ? { fetch } : {}),
  };
}

/** apps/server/src/composition/accounts.ts's `buildImportAccountDeps`, restated. */
function importAccountDeps(db: Database, fetch?: SyncDeps["fetch"]): ConnectAccountDeps {
  return {
    upsertProviderProfile: (seat, fetched) => upsertProviderProfile(db, seat, fetched),
    getTrackedAccountByPlatform: (userId, platform) =>
      findTrackedAccountByPlatform(db, userId, platform),
    withTransaction: (fn) => db.transaction(fn),
    insertTrackedAccount,
    createSyncJob,
    enqueueSync: (tx, job) => h.syncQueue.enqueue(tx, job),
    markOnboarded: (userId) => markUserOnboarded(db, userId),
    ...(fetch ? { fetch } : {}),
  };
}

/** Runs a sync job the way the worker's first delivery would. */
async function runSync(syncJobId: string, fetch?: SyncDeps["fetch"]) {
  const job = await deliverSyncJob(h.boss, syncJobId);
  await processSync(processSyncDeps(h.db, fetch), {
    syncJobId,
    retryCount: job.retryCount,
    retryLimit: job.retryLimit,
    signal: job.signal,
  });
}

/** A manual sync of an account: its job, the worker's run of it, the result. */
async function syncNow(
  account: { id: string; userId: string },
  fetch: typeof globalThis.fetch,
) {
  const job = await h.db.transaction(async (tx) => {
    const created = (await createSyncJob(tx, {
      userId: account.userId,
      accountId: account.id,
      trigger: "manual",
    }))!;
    await h.syncQueue.enqueue(tx, { id: created.id, accountId: account.id });
    return created;
  });
  await runSync(job.id, fetch);
  return getSyncJobForUser(h.db, account.userId, job.id);
}

function disconnectAccountDeps(db: Database): DisconnectAccountDeps {
  return {
    getTrackedAccountForUser: (userId, accountId) =>
      getTrackedAccountForUser(db, userId, accountId),
    deleteAccountAndItsGames: (accountId) => deleteTrackedAccountAndGames(db, accountId),
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

/** A pasted game, as `POST /games/import` stores one: owned by a user,
 * no account behind it. Mirrors libs/infra/db's own test builder. */
function pastedGame(): NormalizedGame {
  return {
    source: "pgn",
    externalId: null,
    externalUrl: null,
    perspective: null,
    white: { name: "alice" },
    black: { name: "bob" },
    result: "1/2-1/2",
    timeControl: {},
    opening: {},
    hasClocks: false,
    rawPgn: '[Event "?"]\n\n1. e4 e5 1/2-1/2\n',
    movetextHash: "disconnect-survivor",
  };
}

// What chess.com answers for an unknown handle — a 404, not a network failure.
const unknownHandle: typeof fetch = async () =>
  new Response("not found", { status: 404 });

beforeAll(async () => {
  h = await createLoopHarness();
});

afterAll(() => h.close());

function connectedOutcome(outcome: ConnectOutcome) {
  if (outcome.status !== "connected") throw new Error(`not connected: ${outcome.status}`);
  return outcome;
}

/** Two connects for one user whose pre-checks both run before either writes. */
function racingConnects(ownerId: string, usernames: [string, string]) {
  const deps = importAccountDeps(h.db, emptyArchive);
  let arrived = 0;
  let bothChecked!: () => void;
  const checked = new Promise<void>((resolve) => (bothChecked = resolve));
  const raced: ConnectAccountDeps = {
    ...deps,
    getTrackedAccountByPlatform: async (forUser, platform) => {
      const existing = await deps.getTrackedAccountByPlatform(forUser, platform);
      arrived += 1;
      if (arrived === 2) bothChecked();
      await checked;
      return existing;
    },
  };
  return Promise.all([
    importAccount(raced, ownerId, "chess_com", usernames[0]),
    importAccount(raced, ownerId, "chess_com", usernames[1]),
  ]);
}

describe("application services (the flow, end to end)", () => {
  let userId: string;

  /**
   * Import (idempotent — first contact fills, later calls are no-ops)
   * then read the unified library. Asserts `connected`: callers exercising
   * the `provider-connected` refusal call `importAccount` directly.
   */
  async function openImported(
    username: string,
    view: { filters?: GameFilters; page?: GamePage } = {},
    syncDeps: SyncDeps = {},
    ownerId: string = userId,
  ) {
    const outcome = await importAccount(
      importAccountDeps(h.db, syncDeps.fetch),
      ownerId,
      "chess_com",
      username,
    );
    if (outcome.status !== "connected") {
      throw new Error(`expected "connected", got "${outcome.status}"`);
    }
    // The worker's part: the first sync connecting scheduled.
    if (outcome.syncId) await runSync(outcome.syncId, syncDeps.fetch);
    return {
      account: (await getTrackedAccount(h.db, outcome.account.id))!,
      library: await openLibrary(listGamesDeps(h.db), ownerId, view),
    };
  }

  it("a user anchors the flow", async () => {
    // Identity now arrives from a session; the services still take a
    // plain userId, which is what this suite exercises.
    userId = (await createUser(h.db)).id;
    expect(userId).toBeTruthy();
  });

  it("sync: fixture archive lands as games, cursor advances, re-sync inserts nothing", async () => {
    const account = (await insertTrackedAccount(
      h.db,
      userId,
      "chess_com",
      LOOPER_USERNAME,
    ))!;

    expect(await syncNow(account, chessComFixtureFetch())).toMatchObject({
      status: "succeeded",
      gamesInserted: 2,
    });
    expect((await getTrackedAccount(h.db, account.id))?.syncCursor).not.toBeNull();

    expect((await getTrackedAccount(h.db, account.id))?.lastSyncedAt).not.toBeNull();

    expect(await syncNow(account, chessComFixtureFetch())).toMatchObject({
      status: "succeeded",
      gamesInserted: 0,
    });
  });

  it("sync: an empty archive still marks the account as synced", async () => {
    // No games means no cursor to save. The two used to be one write, so an
    // account like this looked like one that had never synced — and the
    // route guard read that as a failed import.
    // Its own user: one chess_com account per user now, and `userId` above
    // already has one from the previous test.
    const ownerId = (await createUser(h.db)).id;
    const account = (await insertTrackedAccount(
      h.db,
      ownerId,
      "chess_com",
      "emptyarchive",
    ))!;

    expect(await syncNow(account, emptyArchive)).toMatchObject({
      status: "succeeded",
      gamesInserted: 0,
    });
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

    // Reconnecting the handle already tracked asks the provider nothing.
    const again = await openImported(
      "fresh_import",
      {},
      {
        fetch: (async () => {
          throw new Error("the handle is already tracked");
        }) as unknown as typeof fetch,
      },
      ownerId,
    );
    expect(again.account.id).toBe(account.id);
    expect(again.library.games.length).toBe(2);
  });

  it("importAccount: a second handle on an already-tracked provider is refused, not overwritten", async () => {
    const ownerId = (await createUser(h.db)).id;
    const first = (await insertTrackedAccount(
      h.db,
      ownerId,
      "chess_com",
      "first_handle",
    ))!;

    const outcome = await importAccount(
      importAccountDeps(h.db, emptyArchive),
      ownerId,
      "chess_com",
      "second_handle",
    );

    expect(outcome).toMatchObject({
      status: "provider-connected",
      existing: { id: first.id, platform: "chess_com", username: "first_handle" },
    });
    // The existing connection is untouched — no silent overwrite.
    expect((await getTrackedAccount(h.db, first.id))?.username).toBe("first_handle");

    // The same handle it already tracks stays a plain idempotent connect.
    const again = await importAccount(
      importAccountDeps(h.db, emptyArchive),
      ownerId,
      "chess_com",
      "First_Handle",
    );
    expect(again).toMatchObject({ status: "connected", account: { id: first.id } });
  });

  it("importAccount: two simultaneous connects of one handle make one account and one sync", async () => {
    const ownerId = (await createUser(h.db)).id;

    const [first, second] = (
      await racingConnects(ownerId, ["race_handle", "race_handle"])
    ).map(connectedOutcome);

    expect(second!.account.id).toBe(first!.account.id);
    expect([first!.syncId, second!.syncId].filter(Boolean)).toHaveLength(1);
  });

  it("importAccount: two simultaneous connects of different handles keep one, refusing the other", async () => {
    const ownerId = (await createUser(h.db)).id;

    const outcomes = await racingConnects(ownerId, ["race_one", "race_two"]);

    expect(outcomes.map((outcome) => outcome.status).toSorted()).toEqual([
      "connected",
      "provider-connected",
    ]);
    const winner = outcomes.find((outcome) => outcome.status === "connected");
    const stored = await findTrackedAccountByPlatform(h.db, ownerId, "chess_com");
    expect(stored?.username).toBe(
      winner?.status === "connected" ? winner.account.username : undefined,
    );
  });

  it("importAccount: a handle the provider does not have is refused before any row exists", async () => {
    const ownerId = (await createUser(h.db)).id;

    expect(
      await importAccount(
        importAccountDeps(h.db, unknownHandle),
        ownerId,
        "chess_com",
        "ghost",
      ),
    ).toEqual({ status: "not-found" });

    // No row left behind to occupy the slot or need manual cleanup.
    expect(await findTrackedAccountByPlatform(h.db, ownerId, "chess_com")).toBeNull();

    // The provider slot is free: a real handle connects normally right after.
    const retry = await importAccount(
      importAccountDeps(h.db, chessComFixtureFetch()),
      ownerId,
      "chess_com",
      LOOPER_USERNAME,
    );
    expect(retry).toMatchObject({ status: "connected" });
  });

  it("disconnectAccount: owner-scoped delete takes the account's games with it, and nothing else", async () => {
    const ownerId = (await createUser(h.db)).id;
    const other = (await createUser(h.db)).id;
    const { account, library } = await openImported(
      "disconnect_me",
      {},
      { fetch: chessComFixtureFetch() },
      ownerId,
    );
    const gameCountBefore = library.games.length;
    expect(gameCountBefore).toBeGreaterThan(0);

    // A pasted game: same owner, no account behind it. Disconnecting
    // must not reach it.
    await saveGames(h.db, [pastedGame()], { userId: ownerId });

    // Not this user's account: answers not-found, same as a missing id.
    const wrongOwner = await disconnectAccount(
      disconnectAccountDeps(h.db),
      other,
      account.id,
    );
    expect(wrongOwner).toEqual({ status: "not-found" });
    expect(await getTrackedAccount(h.db, account.id)).not.toBeNull();

    const deleted = await disconnectAccount(
      disconnectAccountDeps(h.db),
      ownerId,
      account.id,
    );
    expect(deleted).toEqual({ status: "deleted" });
    expect(await getTrackedAccount(h.db, account.id)).toBeNull();

    // The account's games go with it; the pasted one, which never had an
    // account, stays. A disconnect is not "wipe the library".
    const afterDelete = await openLibrary(listGamesDeps(h.db), ownerId, {});
    expect(afterDelete.games).toHaveLength(1);
    expect(afterDelete.games[0]!.source).toBe("pgn");

    // Deleting a missing id is the same not-found, not an error.
    expect(
      await disconnectAccount(disconnectAccountDeps(h.db), ownerId, account.id),
    ).toEqual({
      status: "not-found",
    });

    // The provider slot is free: reconnecting, even under a different
    // handle, is a plain connect again.
    const reconnected = await importAccount(
      importAccountDeps(h.db, emptyArchive),
      ownerId,
      "chess_com",
      "a_new_handle",
    );
    expect(reconnected).toMatchObject({ status: "connected" });
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
