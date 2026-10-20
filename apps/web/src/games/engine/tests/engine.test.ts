import { describe, expect, it, vi } from "vitest";

import { useEngineSession, type CompletedSearch } from "@velachess/infra-engine";

import { run, type Task } from "../../../libs/effection.ts";
import {
  createEngine,
  EngineSessionDisposed,
  SearchSuperseded,
  type EngineSessionHandle,
} from "../engine.ts";
import {
  createScriptedEngine,
  goLines,
  type ScriptedEngine,
  type ScriptedEngineOptions,
} from "./scripted-engine.ts";

const FEN_A = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FEN_B = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const FEN_C = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

/** Short enough to elapse inside a test, same spirit as the engine
 * suite's own `FAST` options. */
const STOP_SETTLE_MS = 30;

function harness(options: ScriptedEngineOptions = {}) {
  const engines: ScriptedEngine[] = [];
  const engine = createEngine({
    openSession: function* () {
      const scripted = createScriptedEngine(options);
      engines.push(scripted);
      return yield* useEngineSession(scripted.open);
    },
    stopSettleMs: STOP_SETTLE_MS,
  });
  return { engine, engines };
}

const search = (session: EngineSessionHandle, fen: string): Task<CompletedSearch> =>
  run(() => session.evaluate(fen));

/** Lets Effection's scheduler drain, and any deadline shorter than this
 * elapse, without asserting on how long anything took. */
async function flush(ms = 0) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function quiet(task: Task<unknown>): void {
  void task.catch(() => {});
}

describe("createEngine", () => {
  it("opens no Worker until the first search", async () => {
    const { engine, engines } = harness();

    engine.createSession({ depth: 14 });
    await flush();

    expect(engines).toHaveLength(0);
  });

  it("runs two sessions at once, each on its own Worker", async () => {
    const { engine, engines } = harness();
    const a = engine.createSession({ depth: 14 });
    const b = engine.createSession({ depth: 14 });

    const first = search(a, FEN_A);
    const second = search(b, FEN_B);
    await vi.waitFor(() => expect(engines).toHaveLength(2));

    // Both are searching before either has answered: neither session
    // waited for the other.
    expect(engines[0]!.searching).toBe(true);
    expect(engines[1]!.searching).toBe(true);

    engines[0]!.queueGoResponse(goLines(20, "e2e4"));
    engines[1]!.queueGoResponse(goLines(-5, "e7e5"));

    expect((await first).bestMove.move).toBe("e2e4");
    expect((await second).bestMove.move).toBe("e7e5");
  });

  it("reuses one Worker across searches", async () => {
    const { engine, engines } = harness();
    const session = engine.createSession({ depth: 14 });

    const first = search(session, FEN_A);
    await vi.waitFor(() => expect(engines).toHaveLength(1));
    engines[0]!.queueGoResponse(goLines(20, "e2e4"));
    await first;

    engines[0]!.queueGoResponse(goLines(-5, "e7e5"));
    await search(session, FEN_B);

    expect(engines).toHaveLength(1);
    expect(engines[0]!.goCallCount).toBe(2);
  });

  it("replaces a search with stop, bestmove, then the new position", async () => {
    const { engine, engines } = harness();
    const session = engine.createSession({ depth: 14 });

    const abandoned = search(session, FEN_A);
    quiet(abandoned);
    await vi.waitFor(() => expect(engines).toHaveLength(1));
    const scripted = engines[0]!;

    const next = search(session, FEN_B);
    await vi.waitFor(() => expect(scripted.goCallCount).toBe(2));
    scripted.queueGoResponse(goLines(-5, "e7e5"));
    await next;

    const conversation = scripted.sent.filter(
      (command) =>
        command === "stop" || command.startsWith("go") || command.startsWith("position"),
    );
    expect(conversation).toEqual([
      `position fen ${FEN_A}`,
      "go depth 14",
      "stop",
      `position fen ${FEN_B}`,
      "go depth 14",
    ]);
    await expect(abandoned).rejects.toBeInstanceOf(SearchSuperseded);
  });

  it("never delivers a superseded search as the newer one's result", async () => {
    const { engine, engines } = harness();
    const session = engine.createSession({ depth: 14 });

    const abandoned = search(session, FEN_A);
    quiet(abandoned);
    await vi.waitFor(() => expect(engines).toHaveLength(1));

    // Nothing is queued, so `stop` is what ends the first search — the
    // truncated outcome that must not be handed to the second.
    const next = search(session, FEN_B);
    engines[0]!.queueGoResponse(goLines(-5, "e7e5"));

    expect((await next).bestMove.move).toBe("e7e5");
    await expect(abandoned).rejects.toBeInstanceOf(SearchSuperseded);
  });

  it("serializes three overlapping requests, answering only the newest", async () => {
    const { engine, engines } = harness();
    const session = engine.createSession({ depth: 14 });

    const first = search(session, FEN_A);
    const second = search(session, FEN_B);
    const third = search(session, FEN_C);
    quiet(first);
    quiet(second);

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    engines[0]!.queueGoResponse(goLines(10, "g1f3"));

    expect((await third).bestMove.move).toBe("g1f3");
    await expect(first).rejects.toBeInstanceOf(SearchSuperseded);
    await expect(second).rejects.toBeInstanceOf(SearchSuperseded);

    // Each replacement waited for the one before it to answer: the whole
    // conversation is one Worker's, strictly alternating, with no `go`
    // ever issued while another was outstanding.
    expect(engines[0]!.sent).toEqual([
      "uci",
      "isready",
      `position fen ${FEN_A}`,
      "go depth 14",
      "stop",
      `position fen ${FEN_B}`,
      "go depth 14",
      "stop",
      `position fen ${FEN_C}`,
      "go depth 14",
    ]);
  });

  it("stops the search when its caller walks away, and keeps the session", async () => {
    const { engine, engines } = harness();
    const session = engine.createSession({ depth: 14 });

    const abandoned = search(session, FEN_A);
    await vi.waitFor(() => expect(engines).toHaveLength(1));
    const scripted = engines[0]!;
    await abandoned.halt().catch(() => {});

    expect(scripted.sent).toContain("stop");
    expect(scripted.searching).toBe(false);
    expect(scripted.closed).toBe(false);

    scripted.queueGoResponse(goLines(-5, "e7e5"));
    expect((await search(session, FEN_B)).bestMove.move).toBe("e7e5");
    expect(engines).toHaveLength(1);
  });

  it("holds the next search until the stopped one actually answers", async () => {
    // `ignoreStop` withholds the bestmove, so nothing but the deadline
    // can release the replacement — and before the deadline it must not
    // be released at all.
    const { engine, engines } = harness({ ignoreStop: true });
    const session = engine.createSession({ depth: 14 });

    const abandoned = search(session, FEN_A);
    quiet(abandoned);
    await vi.waitFor(() => expect(engines).toHaveLength(1));

    const next = search(session, FEN_B);
    quiet(next);
    await flush(STOP_SETTLE_MS / 3);

    // Still one `go`: the replacement cannot speak while the first search
    // is outstanding. If `done` ever reported the caller leaving rather
    // than the engine going idle, this is where it breaks.
    expect(engines[0]!.goCallCount).toBe(1);
    expect(engines[0]!.sent).toContain("stop");
  });

  it("kills a Worker that ignores stop, and opens a new one for the next search", async () => {
    const { engine, engines } = harness({ ignoreStop: true });
    const session = engine.createSession({ depth: 14 });

    const abandoned = search(session, FEN_A);
    quiet(abandoned);
    await vi.waitFor(() => expect(engines).toHaveLength(1));
    // Chatty but wedged: a silence watchdog would never fire here, which
    // is exactly why the stop deadline exists.
    engines[0]!.emitInfo(12);

    const next = search(session, FEN_B);
    await vi.waitFor(() => expect(engines).toHaveLength(2));
    expect(engines[0]!.closed).toBe(true);

    engines[1]!.queueGoResponse(goLines(-5, "e7e5"));
    expect((await next).bestMove.move).toBe("e7e5");
    await expect(abandoned).rejects.toBeInstanceOf(SearchSuperseded);
  });

  it("drops a Worker the engine failed on, so the next search starts clean", async () => {
    const { engine, engines } = harness();
    const session = engine.createSession({ depth: 14 });

    const failing = search(session, FEN_A);
    // A dead Worker ends its line stream; infra retries once on a fresh
    // session, so the second one has to die too for the call to fail.
    await vi.waitFor(() => expect(engines).toHaveLength(1));
    engines[0]!.crash();
    await vi.waitFor(() => expect(engines).toHaveLength(2));
    engines[1]!.crash();
    await expect(failing).rejects.toThrow(/Engine failed twice/);

    const next = search(session, FEN_B);
    await vi.waitFor(() => expect(engines).toHaveLength(3));
    engines[2]!.queueGoResponse(goLines(-5, "e7e5"));
    expect((await next).bestMove.move).toBe("e7e5");
  });

  it("releases the next search when a cancelled one is stopped and the engine never answers", async () => {
    // The caller-halt path goes through `releaseSearch`, whose teardown
    // runs while the operation is unwinding — a different route to
    // `stopSearch` than a newer request takes. If `released` failed to
    // resolve there, the next search would wait forever.
    const { engine, engines } = harness({ ignoreStop: true });
    const session = engine.createSession({ depth: 14 });

    const abandoned = search(session, FEN_A);
    await vi.waitFor(() => expect(engines).toHaveLength(1));
    await abandoned.halt().catch(() => {});

    expect(engines[0]!.sent).toContain("stop");
    expect(engines[0]!.closed).toBe(true);

    const next = search(session, FEN_B);
    await vi.waitFor(() => expect(engines).toHaveLength(2));
    engines[1]!.queueGoResponse(goLines(-5, "e7e5"));
    expect((await next).bestMove.move).toBe("e7e5");
  });

  describe("while the Worker is still opening", () => {
    it("abandons a cancelled search without searching, and keeps the Worker", async () => {
      const { engine, engines } = harness({ holdHandshake: true });
      const session = engine.createSession({ depth: 14 });

      const abandoned = search(session, FEN_A);
      await vi.waitFor(() => expect(engines).toHaveLength(1));
      await abandoned.halt().catch(() => {});

      // The open was the session's, not the caller's, so it finishes and
      // the Worker is registered rather than orphaned.
      engines[0]!.answerHandshake();
      expect(engines[0]!.goCallCount).toBe(0);
      expect(engines[0]!.closed).toBe(false);

      engines[0]!.queueGoResponse(goLines(-5, "e7e5"));
      expect((await search(session, FEN_B)).bestMove.move).toBe("e7e5");
      expect(engines).toHaveLength(1);

      await run(() => session.dispose());
      expect(engines[0]!.closed).toBe(true);
    });

    it("publishes no Worker once the session has been disposed", async () => {
      const { engine, engines } = harness({ holdHandshake: true });
      const session = engine.createSession({ depth: 14 });

      const pending = search(session, FEN_A);
      quiet(pending);
      await vi.waitFor(() => expect(engines).toHaveLength(1));

      await run(() => session.dispose());
      // Finishing the handshake after disposal must not hand the Worker
      // to anyone: the session's scope is already gone.
      engines[0]!.answerHandshake();

      await expect(pending).rejects.toBeInstanceOf(EngineSessionDisposed);
      expect(engines[0]!.closed).toBe(true);
      expect(engines[0]!.goCallCount).toBe(0);

      await expect(search(session, FEN_B)).rejects.toBeInstanceOf(EngineSessionDisposed);
      expect(engines).toHaveLength(1);
    });
  });

  describe("dispose", () => {
    it("terminates the Worker and is idempotent", async () => {
      const { engine, engines } = harness();
      const session = engine.createSession({ depth: 14 });

      const first = search(session, FEN_A);
      await vi.waitFor(() => expect(engines).toHaveLength(1));
      engines[0]!.queueGoResponse(goLines(20, "e2e4"));
      await first;

      await run(() => session.dispose());
      expect(engines[0]!.closed).toBe(true);
      // Nothing to assert but that it returns: a second disposal of a
      // session that is already gone must not reopen or throw.
      await run(() => session.dispose());
      expect(engines).toHaveLength(1);
    });

    it("settles a search that was still running", async () => {
      const { engine, engines } = harness();
      const session = engine.createSession({ depth: 14 });

      const pending = search(session, FEN_A);
      await vi.waitFor(() => expect(engines).toHaveLength(1));
      await run(() => session.dispose());

      await expect(pending).rejects.toBeInstanceOf(EngineSessionDisposed);
      expect(engines[0]!.closed).toBe(true);
    });

    it("refuses a later search without opening anything", async () => {
      const { engine, engines } = harness();
      const session = engine.createSession({ depth: 14 });

      await run(() => session.dispose());

      await expect(search(session, FEN_A)).rejects.toBeInstanceOf(EngineSessionDisposed);
      expect(engines).toHaveLength(0);
    });

    it("leaves no Worker behind when one was open", async () => {
      const { engine, engines } = harness();
      const session = engine.createSession({ depth: 14 });

      const first = search(session, FEN_A);
      await vi.waitFor(() => expect(engines).toHaveLength(1));
      engines[0]!.queueGoResponse(goLines(20, "e2e4"));
      await first;
      await run(() => session.dispose());

      expect(engines.every((scripted) => scripted.closed)).toBe(true);
    });

    it("does not touch another session", async () => {
      const { engine, engines } = harness();
      const a = engine.createSession({ depth: 14 });
      const b = engine.createSession({ depth: 14 });

      const theirs = search(b, FEN_B);
      await vi.waitFor(() => expect(engines).toHaveLength(1));
      await run(() => a.dispose());

      engines[0]!.queueGoResponse(goLines(-5, "e7e5"));
      expect((await theirs).bestMove.move).toBe("e7e5");
      expect(engines[0]!.closed).toBe(false);
    });
  });
});
