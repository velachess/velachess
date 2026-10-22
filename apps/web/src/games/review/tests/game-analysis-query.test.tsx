import { act, renderHook } from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GradedPly } from "@velachess/analysis";

import {
  getBackendStatus,
  resetBackendStatus,
} from "../../../backend-status/backend-status.ts";
import { aGradedPly, aReplay } from "../../../test/games.ts";
import {
  QueryClientProvider,
  useQuery,
  type QueryClientType,
} from "../../../libs/react-query.ts";
import { createQueryClient } from "../../../query/index.ts";
import {
  ANALYSIS_EVENT,
  type AnalysisEvent,
  type GameAnalysis,
} from "../../analysis/index.ts";
import { gameAnalysisQuery, selectGraded } from "../game-analysis-query.ts";
import type { AnalysedGame } from "../game-analysis-query.ts";

// The stream itself, staged: what `analyzeGameInBrowser` produces is
// covered by `analysis/tests/`, and what this file owns is what React
// Query does with it.
vi.mock("../../analysis/game/analyze.ts", () => ({
  analyzeGameInBrowser: vi.fn(),
}));
const { analyzeGameInBrowser } = await import("../../analysis/game/analyze.ts");

/** The one game every case analyses: its id and its replay, which is all
 * an analysis is handed. */
const game: AnalysedGame = { id: "game-1", ...aReplay() };

/**
 * A pass the test drives event by event, counting how many times it was
 * started and how many of its streams were closed — which is how "the
 * pass outlives the screen" is observable at all.
 */
function stagedPass() {
  const events: AnalysisEvent[] = [];
  let resume: (() => void) | null = null;
  let ended = false;
  let failure: Error | null = null;
  let started = 0;
  let closed = 0;

  function wake() {
    const resumeNow = resume;
    resume = null;
    resumeNow?.();
  }

  async function* stream(): AsyncGenerator<AnalysisEvent> {
    started += 1;
    try {
      let index = 0;
      while (true) {
        while (index < events.length) yield events[index++]!;
        if (failure) throw failure;
        if (ended) return;
        await new Promise<void>((resolve) => {
          resume = resolve;
        });
      }
    } finally {
      closed += 1;
    }
  }

  vi.mocked(analyzeGameInBrowser).mockImplementation(stream);

  return {
    get started() {
      return started;
    },
    get closed() {
      return closed;
    },
    grade(ply: number) {
      events.push({ type: ANALYSIS_EVENT.PLY_GRADED, grade: aGradedPly(ply) });
      wake();
    },
    searching(ply: number, depth: number) {
      events.push({
        type: ANALYSIS_EVENT.POSITION_UPDATE,
        live: {
          ply,
          fen: game.moves[ply - 1]!.fenBefore,
          update: { depth, multipv: 1, score: { cp: 8 }, pv: ["e2e4"] },
        },
      });
      wake();
    },
    complete(graded: GradedPly[]) {
      events.push({ type: ANALYSIS_EVENT.COMPLETED, graded });
      ended = true;
      wake();
    },
    fail(error: Error) {
      failure = error;
      wake();
    },
  };
}

function readCache(queryClient: QueryClientType): GameAnalysis | undefined {
  return queryClient.getQueryData<GameAnalysis>(gameAnalysisQuery(game).queryKey);
}

/** One screen reading the grades, mounted and unmounted on demand. */
function mountConsumer(queryClient: QueryClientType) {
  return renderHook(
    () => useQuery({ ...gameAnalysisQuery(game), select: selectGraded }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    },
  );
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

let queryClient: QueryClientType;

beforeEach(() => {
  queryClient = createQueryClient();
});

afterEach(() => {
  // Not `clear()`: a pass this test left running would be cancelled with
  // nobody to hear it, and every case builds its own client anyway.
  onlineManager.setOnline(true);
  resetBackendStatus();
  vi.restoreAllMocks();
});

describe("gameAnalysisQuery", () => {
  it("accumulates the stream into one reading, and keeps the finished report", async () => {
    const pass = stagedPass();
    const fetched = queryClient.fetchQuery(gameAnalysisQuery(game));

    await vi.waitFor(() => expect(pass.started).toBe(1));
    pass.grade(1);

    // Readable while the pass is still running: the cache is the
    // accumulator, so there is nothing to wait for.
    await vi.waitFor(() => expect(readCache(queryClient)?.graded).toHaveLength(1));
    expect(queryClient.getQueryState(gameAnalysisQuery(game).queryKey)).toMatchObject({
      status: "success",
      fetchStatus: "fetching",
    });

    const report = [aGradedPly(1), aGradedPly(2)];
    pass.complete(report);

    expect(await fetched).toEqual({ graded: report, live: null, isComplete: true });
  });

  it("shows only the search in flight, and drops it once it produced a grade", async () => {
    const pass = stagedPass();
    void queryClient.fetchQuery(gameAnalysisQuery(game)).catch(() => {});
    await vi.waitFor(() => expect(pass.started).toBe(1));

    pass.searching(1, 4);
    pass.searching(1, 9);
    await vi.waitFor(() =>
      expect(readCache(queryClient)?.live).toMatchObject({ ply: 1 }),
    );

    // The deeper reading replaces the shallower one: the earlier depths
    // are not history anybody keeps.
    expect(readCache(queryClient)?.live?.update.depth).toBe(9);
    expect(readCache(queryClient)?.graded).toEqual([]);

    pass.grade(1);
    await vi.waitFor(() => expect(readCache(queryClient)?.graded).toHaveLength(1));
    // Cleared with the grade, so a finished position's reading can never
    // be shown as the next one's.
    expect(readCache(queryClient)?.live).toBeNull();
  });

  it("serves two consumers from one pass", async () => {
    const pass = stagedPass();

    const first = mountConsumer(queryClient);
    const second = mountConsumer(queryClient);
    await vi.waitFor(() => expect(pass.started).toBe(1));

    pass.complete([aGradedPly(1)]);
    await vi.waitFor(() => expect(first.result.current.data).toHaveLength(1));
    expect(second.result.current.data).toEqual(first.result.current.data);
    expect(pass.started).toBe(1);
  });

  it("keeps analysing after the screen is gone, and hands back the progress on return", async () => {
    const pass = stagedPass();

    const screen = mountConsumer(queryClient);
    await vi.waitFor(() => expect(pass.started).toBe(1));
    pass.grade(1);
    await vi.waitFor(() => expect(screen.result.current.data).toHaveLength(1));

    screen.unmount();
    await settle();

    // Nothing consumed the query's signal, so React Query leaves the
    // fetch alone: the stream is still open and still filling the cache.
    expect(pass.closed).toBe(0);
    pass.grade(2);
    await vi.waitFor(() => expect(readCache(queryClient)?.graded).toHaveLength(2));

    const reopened = mountConsumer(queryClient);
    await vi.waitFor(() => expect(reopened.result.current.data).toHaveLength(2));
    expect(pass.started).toBe(1);
  });

  it("does not analyse a game whose report it already has", async () => {
    const pass = stagedPass();

    const screen = mountConsumer(queryClient);
    await vi.waitFor(() => expect(pass.started).toBe(1));
    pass.complete([aGradedPly(1), aGradedPly(2)]);
    await vi.waitFor(() => expect(screen.result.current.data).toHaveLength(2));
    screen.unmount();

    const reopened = mountConsumer(queryClient);
    await settle();

    expect(reopened.result.current.data).toHaveLength(2);
    expect(pass.started).toBe(1);
  });

  it("analyses with the browser offline — Stockfish is not a request", async () => {
    const pass = stagedPass();
    onlineManager.setOnline(false);

    void queryClient.fetchQuery(gameAnalysisQuery(game)).catch(() => {});

    await vi.waitFor(() => expect(pass.started).toBe(1));
    pass.complete([aGradedPly(1)]);
    await vi.waitFor(() => expect(readCache(queryClient)?.isComplete).toBe(true));
  });

  it("hands a failing engine to its own screen, and to nothing global", async () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => {});
    const pass = stagedPass();
    const boom = new Error("Engine failed twice evaluating something");

    const screen = mountConsumer(queryClient);
    await vi.waitFor(() => expect(pass.started).toBe(1));

    await act(async () => {
      pass.fail(boom);
      await vi.waitFor(() => expect(screen.result.current.isError).toBe(true));
    });

    // The consumer is where it lands: `meta.engine` keeps it out of the
    // API error path, so nothing reports it, nothing is normalized into
    // an `ApiError`, and the backend is never blamed for a search.
    expect(screen.result.current.error).toBe(boom);
    expect(reported).not.toHaveBeenCalled();
    expect(getBackendStatus()).toBe("available");
  });
});
