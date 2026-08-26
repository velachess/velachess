// @vitest-environment node
/**
 * Route behavior over the real harness. Seeding uses application services
 * directly where the worker would normally act — the worker's own suite
 * and the e2e cover that side.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { completeAnalysis } from "@velachess/application/analysis/process-analysis/process-analysis";
import { appendProgress } from "@velachess/db";
import { LOOPER_REPERTOIRE_PGN, LOOPER_USERNAME } from "@velachess/fixtures";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;
let owner: AuthedApp;
let accountId: string;
let inBookGameId: string;
let deviantGameId: string;

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

beforeAll(async () => {
  harness = await createApiHarness();
  // Every request below is made as this signed-in user — the suite goes
  // through the same session gate production does, never around it.
  owner = (await harness.signUp("owner@api.test")).app;
});

afterAll(async () => {
  await harness.close();
});

/** The first chunks of a stream that is still open, as text. */
async function readSome(response: Response, ms = 1500) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + ms;
  let text = "";
  while (Date.now() < deadline) {
    const next = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), 300),
      ),
    ]);
    if (next.done) break;
    text += decoder.decode(next.value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return text;
}

const aStubPosition = (ply: number) => ({
  ply,
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  san: "e4",
  evalBefore: { cp: 0 },
  evalAfter: { cp: 20 },
  bestMove: "e2e4",
  category: "best" as const,
  winChanceLoss: 0,
});

describe("api routes", () => {
  it("health and validation basics", async () => {
    expect((await owner.request("/health")).status).toBe(200);
    expect(
      (await owner.request("/accounts", json({ platform: "nope", username: "" }))).status,
    ).toBe(400);
    expect((await owner.request(`/accounts/${randomUUID()}/games`)).status).toBe(404);
  });

  it("accounts: create is an upsert", async () => {
    const created = await owner.request(
      "/accounts",
      json({ platform: "chess_com", username: "Looper" }),
    );
    expect(created.status).toBe(201);
    const account = (await created.json()) as { id: string; username: string };
    expect(account.username).toBe(LOOPER_USERNAME); // normalized
    accountId = account.id;

    const again = await owner.request(
      "/accounts",
      json({ platform: "chess_com", username: "looper" }),
    );
    expect(((await again.json()) as { id: string }).id).toBe(accountId);

    const listed = (await (await owner.request("/accounts")).json()) as {
      id: string;
      lastSyncedAt: string | null;
    }[];
    // Importing IS the first sync now — first contact fills the archive,
    // so a listed account never shows the old "connected, never synced"
    // limbo for a username the platform knows.
    expect(listed.find((entry) => entry.id === accountId)!.lastSyncedAt).not.toBeNull();
  });

  it("repertoires: create, chapter, list", async () => {
    const created = await owner.request(
      "/repertoires",
      json({ name: "White e4", color: "white" }),
    );
    expect(created.status).toBe(201);
    const repertoire = (await created.json()) as { id: string };

    const chapter = await owner.request(
      `/repertoires/${repertoire.id}/chapters`,
      json({ name: "French", pgn: LOOPER_REPERTOIRE_PGN }),
    );
    expect(chapter.status).toBe(201);
    expect(
      (
        await owner.request(
          `/repertoires/${randomUUID()}/chapters`,
          json({ name: "x", pgn: "1. e4 *" }),
        )
      ).status,
    ).toBe(404);

    // Two books for this user: the one just created, and the candidate
    // the import derived from the archive on its own — repertoires grow
    // from games, so a connected account always has one.
    const list = await owner.request("/repertoires");
    const books = (await list.json()) as { name: string; source: string }[];
    expect(books.map((book) => book.source).toSorted()).toEqual(["extracted", "manual"]);

    const opened = await owner.request(`/repertoires/${repertoire.id}`);
    expect(opened.status).toBe(200);
    const full = (await opened.json()) as {
      source: string;
      chapters: {
        id: string;
        name: string;
        training: { due: number; fresh: number };
      }[];
      stats: { outcomes: Record<string, number> };
    };
    expect(full.source).toBe("manual");
    expect(full.chapters).toHaveLength(1);
    expect(full.chapters[0]!.name).toBe("French");
    // No PGN on a list row — the tree is the chapter detail's payload.
    expect("pgn" in full.chapters[0]!).toBe(false);
    // The chapter's decision positions were seeded on add, unscheduled.
    expect(full.chapters[0]!.training.fresh).toBeGreaterThan(0);
    // Statistics ride the detail — derived from judgment rows, present
    // (all zeros) even before anything was judged.
    expect(full.stats.outcomes).toEqual({
      held: 0,
      playerLeft: 0,
      opponentLeft: 0,
      repertoireEnded: 0,
      unmatched: 0,
    });
    expect((await owner.request(`/repertoires/${randomUUID()}`)).status).toBe(404);

    // The chapter detail is the heavy endpoint: tree, decision positions,
    // root key — everything an interactive board needs, on demand.
    const chapterDetail = await owner.request(
      `/repertoires/${repertoire.id}/chapters/${full.chapters[0]!.id}`,
    );
    expect(chapterDetail.status).toBe(200);
    const detail = (await chapterDetail.json()) as {
      color: string;
      start: { fen: string; isOwnTurn: boolean; prepared: { san: string }[] };
      lines: { moves: { label: string; from: string; to: string }[] }[];
    };
    expect(detail.color).toBe("white");
    // The chapter arrives formatted for a board: playable position,
    // labeled moves, squares — no chess left for the client to do.
    expect(detail.start.fen).toContain(" w ");
    expect(detail.start.isOwnTurn).toBe(true);
    expect(detail.start.prepared.map((move) => move.san)).toEqual(["e4"]);
    expect(detail.lines[0]!.moves.map((move) => move.label)).toEqual([
      "1. e4",
      "e6",
      "2. d4",
      "d5",
      "3. Nc3",
    ]);
    expect(detail.lines[0]!.moves[0]).toMatchObject({ from: "e2", to: "e4" });
    expect(
      (await owner.request(`/repertoires/${repertoire.id}/chapters/${randomUUID()}`))
        .status,
    ).toBe(404);

    // A chapter that builds an empty tree is rejected before any write.
    expect(
      (
        await owner.request(
          `/repertoires/${repertoire.id}/chapters`,
          json({ name: "Typo", pgn: "1. e9 zz *" }),
        )
      ).status,
    ).toBe(400);
  });

  it("repertoires: delete removes it, history-safe; unknown id is 404", async () => {
    const created = await owner.request(
      "/repertoires",
      json({ name: "Throwaway", color: "black" }),
    );
    const { id } = (await created.json()) as { id: string };

    expect((await owner.request(`/repertoires/${id}`, { method: "DELETE" })).status).toBe(
      204,
    );
    expect((await owner.request(`/repertoires/${id}`, { method: "DELETE" })).status).toBe(
      404,
    );

    const list = await owner.request("/repertoires");
    expect(
      ((await list.json()) as { name: string }[]).some((r) => r.name === "Throwaway"),
    ).toBe(false);
  });

  it("empty state: nothing to judge, drill, or count", async () => {
    // A brand-new user, because the owner's world is no longer empty —
    // importing fills the archive at POST /accounts.
    const nobody = (await harness.signUp("empty@api.test")).app;
    const judged = await nobody.request("/games/judge", { method: "POST" });
    expect(await judged.json()).toEqual({
      judged: 0,
      skipped: 0,
      enqueuedForAnalysis: 0,
    });
    expect((await nobody.request("/drill/next")).status).toBe(204);
    expect(
      (
        await nobody.request(
          "/drill/answer",
          json({ exerciseId: randomUUID(), san: "d4" }),
        )
      ).status,
    ).toBe(404);
    const overview = (await (await nobody.request("/overview")).json()) as {
      games: number;
    };
    expect(overview.games).toBe(0);
  });

  it("GET /games is the unified library — a read that never imports nor starts an engine", async () => {
    expect((await owner.request("/games?page=0")).status).toBe(400);
    expect((await owner.request("/games?outcome=nope")).status).toBe(400);

    // The library lists every game the caller owns — synced accounts and
    // manual imports together — without needing to name either.
    const response = await owner.request("/games");
    expect(response.status).toBe(200);

    const library = (await response.json()) as {
      games: { id: string; source: string; analyzed: boolean }[];
      total: number;
      page: number;
      pageSize: number;
    };
    expect(library.games).toHaveLength(2);
    expect(library.total).toBe(2);
    expect(library.page).toBe(1);
    expect(library.games.every((game) => game.source === "chess_com")).toBe(true);

    // Reading the library never reaches Stockfish. That is what opening
    // one game is for — importing hundreds must not queue hundreds of runs.
    for (const game of library.games) {
      expect(game.analyzed).toBe(false);
      expect(await harness.deps.analysisQueue.getState(game.id)).toBe("none");
    }
  });

  it("refreshing right after an import is rate limited, with Retry-After", async () => {
    // The import synced a moment ago. Both platforms answer 429 to bursts,
    // and a refresh button is exactly the control someone taps twice.
    const tooSoon = await owner.request(`/accounts/${accountId}/sync`, {
      method: "POST",
    });
    expect(tooSoon.status).toBe(429);

    const retryAfter = Number(tooSoon.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(
      ((await tooSoon.json()) as { retryAfterSeconds: number }).retryAfterSeconds,
    ).toBe(retryAfter);

    expect(
      (await owner.request(`/accounts/${randomUUID()}/sync`, { method: "POST" })).status,
    ).toBe(404);
  });

  it("judging is replay: it finds the deviation and queues nothing", async () => {
    const judged = await owner.request("/games/judge", { method: "POST" });
    expect(await judged.json()).toEqual({
      judged: 2,
      skipped: 0,
      enqueuedForAnalysis: 0,
    });

    const games = (await (
      await owner.request(`/accounts/${accountId}/games`)
    ).json()) as {
      id: string;
      judgmentType: string | null;
      analyzed: boolean;
    }[];
    expect(games).toHaveLength(2);
    deviantGameId = games.find((g) => g.judgmentType === "deviation")!.id;
    inBookGameId = games.find((g) => g.judgmentType !== "deviation")!.id;

    // The deviation is known and unanalyzed: severity waits for intent.
    expect(await harness.deps.analysisQueue.getState(deviantGameId)).toBe("none");
  });

  it("analyze state mapping: queued → 202, unknown → 404", async () => {
    // A background enqueue is still possible (a redrive, a future batch);
    // an interactive POST must not start a second run on top of it.
    await harness.deps.analysisQueue.enqueue(harness.db, deviantGameId);

    const queued = await owner.request(`/games/${deviantGameId}/analyze`, {
      method: "POST",
    });
    expect(queued.status).toBe(202);
    expect(((await queued.json()) as { status: string }).status).toBe("queued");

    expect(
      (await owner.request(`/games/${randomUUID()}/analyze`, { method: "POST" })).status,
    ).toBe(404);
  });

  it("analyze enqueues and returns rather than holding the run open", async () => {
    const res = await owner.request(`/games/${inBookGameId}/analyze`, {
      method: "POST",
    });

    expect(res.status).toBe(202);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(((await res.json()) as { status: string }).status).toBe("queued");
  });

  it("does not carry a dead run's cursor into the run that replaced it", async () => {
    // pg-boss retries. A client holding `Last-Event-ID` from the attempt
    // that died asks to resume past an index the new attempt has not
    // reached — and a plain numeric cursor would skip everything the
    // replacement graded. The id has to say which run it belongs to.
    const crashed = randomUUID();
    for (const index of [0, 1, 2, 3, 4, 5]) {
      await appendProgress(harness.db, {
        runId: crashed,
        gameId: deviantGameId,
        index,
        total: 20,
        position: aStubPosition(index + 1),
      });
    }

    // The replacement has graded three moves, numbered from zero again.
    const live = randomUUID();
    for (const index of [0, 1, 2]) {
      await appendProgress(harness.db, {
        runId: live,
        gameId: deviantGameId,
        index,
        total: 20,
        position: aStubPosition(index + 1),
      });
    }

    const events = await owner.request(`/games/${deviantGameId}/analysis/events`, {
      headers: { "Last-Event-ID": `${crashed}:5` },
    });
    // Read what arrives rather than awaiting the whole body: the run has
    // not finished, so the route correctly holds the connection open and
    // `text()` would wait out the deadline.
    const transcript = await readSome(events);

    // Everything the live run has graded, not nothing.
    expect(transcript).toContain(`id: ${live}:0`);
    expect(transcript).toContain(`id: ${live}:2`);
    expect(transcript).not.toContain(`id: ${crashed}`);
  });

  it("the watch route replays a run's progress and closes on the report", async () => {
    // Progress is staged rather than raced for. The route is a view over
    // durable state and nothing else, so what it must be held to is what
    // it does with rows that exist — not whether a real engine happens to
    // still be mid-game when the connection opens.
    const runId = randomUUID();
    await appendProgress(harness.db, {
      runId,
      gameId: inBookGameId,
      index: 0,
      total: 2,
      position: {
        ply: 1,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        san: "e4",
        evalBefore: { cp: 0 },
        evalAfter: { cp: 20 },
        bestMove: "e2e4",
        category: "best",
        winChanceLoss: 0,
      },
    });

    // Headers arrive before the body: the watcher is already polling while
    // the worker works, which is the point of it not owning the run.
    const events = await owner.request(`/games/${inBookGameId}/analysis/events`);
    expect(events.headers.get("content-type")).toContain("text/event-stream");

    // The worker, inline. Delivery is pg-boss's business and lives in
    // apps/worker; what this pins is that the run is not the request.
    const run = completeAnalysis(harness.db, harness.analyze, inBookGameId);
    const transcript = await events.text(); // resolves when the route closes
    await run;

    expect(transcript).toContain("event: analysis.move-graded");
    expect(transcript).toContain("event: analysis.completed");
    expect(transcript).not.toContain("event: analysis.failed");
  });

  it("completed analysis short-circuits: POST returns the cache, GET reads it", async () => {
    const post = await owner.request(`/games/${inBookGameId}/analyze`, {
      method: "POST",
    });
    expect(post.status).toBe(200);
    const body = (await post.json()) as {
      status: string;
      analysis: { positions: unknown[] };
    };
    expect(body.status).toBe("completed");
    expect(body.analysis.positions.length).toBeGreaterThan(0);

    const get = await owner.request(`/games/${inBookGameId}/analysis`);
    expect(((await get.json()) as { status: string }).status).toBe("completed");

    const games = (await (
      await owner.request(`/accounts/${accountId}/games`)
    ).json()) as {
      id: string;
      analyzed: boolean;
    }[];
    expect(games.find((g) => g.id === inBookGameId)?.analyzed).toBe(true);
  });

  it("the dashboard reflects the loop so far", async () => {
    const overview = (await (await owner.request("/overview")).json()) as Record<
      string,
      number
    >;
    // Three exercises already: judging seeds the repertoire deviation
    // without waiting for the engine, and the chapter's own decision
    // positions seed as repertoire-line the moment the chapter lands.
    expect(overview).toEqual({ games: 2, deviations: 2, exercises: 3, dueCards: 0 });
  });

  it("GET /games/:id returns the full game with rawPgn for board replay", async () => {
    const game = (await (await owner.request(`/games/${deviantGameId}`)).json()) as {
      id: string;
      rawPgn: string;
    };
    expect(game.id).toBe(deviantGameId);
    expect(game.rawPgn).toContain("1. e4 e6");
    expect((await owner.request(`/games/${randomUUID()}`)).status).toBe(404);
  });

  it("GET /deviations lists own deviations with verdict, context and playable FEN", async () => {
    const rows = (await (await owner.request("/deviations")).json()) as {
      gameId: string;
      playedSan: string;
      expectedSans: string[];
      engineCategory: string | null;
      fen: string | null;
      drilled: boolean;
      repertoireName: string;
    }[];
    expect(rows).toHaveLength(1); // only the own-deviation, not the in-book judgment
    const row = rows[0]!;
    expect(row.gameId).toBe(deviantGameId);
    expect(row.playedSan).toBe("g4");
    expect(row.expectedSans).toEqual(["d4"]);
    expect(row.fen).toContain(" w "); // EPD converted to playable FEN
    // Drilled at judge time: the repertoire origin does not wait for the
    // engine, so the deviation became an exercise before any analysis ran.
    expect(row.drilled).toBe(true);
    expect(row.repertoireName).toBe("White e4");
  });

  it("GET /repertoires carries each book's adherence with derived perspective", async () => {
    const entries = (await (await owner.request("/repertoires")).json()) as {
      name: string;
      adherence: {
        judgedGames: number;
        adherenceRate: number;
        outOfBook: { total: number };
      } | null;
    }[];
    const white = entries.find((entry) => entry.name === "White e4");
    expect(white).toBeDefined();
    // Fixture games are 4 and 2 plies — both under the default 6-ply
    // floor, so judged/skipped split is what the metrics report.
    expect(white!.adherence!.judgedGames + 2).toBeGreaterThanOrEqual(2);
  });

  it("GET /repertoires reports adherence as null for a book nothing was judged against", async () => {
    // Null, not zeros: "no game has met this book yet" and "judged, and
    // you never once followed it" are different answers, and a zeroed
    // shape cannot tell a screen which one it is holding.
    const created = (await (
      await owner.request(
        "/repertoires",
        json({ name: "Black Caro-Kann", color: "black" }),
      )
    ).json()) as { id: string };

    const entries = (await (await owner.request("/repertoires")).json()) as {
      id: string;
      adherence: unknown;
    }[];

    expect(entries.find((entry) => entry.id === created.id)?.adherence).toBeNull();
  });

  it("GET /insights stays silent rather than drawing a finding from two games", async () => {
    // The floors are the point: the fixture has two judged games, which
    // cannot support a comparison of win rates. A card here would be a
    // confident sentence about nothing — but the envelope still says
    // what the silence is made of, which is how an empty answer stays
    // distinguishable from a broken one.
    const report = (await (await owner.request("/insights")).json()) as {
      coverage: {
        gamesConsidered: number;
        deeplyAnalysedGames: number;
        coverage: number;
      };
      findings: unknown[];
    };
    expect(report.findings).toEqual([]);
    expect(report.coverage.gamesConsidered).toBeGreaterThanOrEqual(2);
    expect(report.coverage.deeplyAnalysedGames).toBeGreaterThanOrEqual(1);
  });
});
