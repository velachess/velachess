import { createRequire } from "node:module";

import { FOOLS_MATE_CHECKMATE, STARTING_POSITION } from "@velachess/fixtures";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ChildProcessTransport } from "@velachess/engine/transport-child-process";
import { EngineSession } from "@velachess/engine";

// e2e: talks to a real Stockfish process (the `stockfish` npm package ships
// a UCI engine runnable straight under node, no native binary required).
// One session is reused across the whole file, same as a real consumer
// would — init() once, go() many times, quit() at the end.

const require = createRequire(import.meta.url);
const enginePath = require.resolve("stockfish/bin/stockfish-18-lite-single.js");

async function collectUpdates(session: EngineSession, depth: number) {
  const { updates, bestMove } = session.go({ kind: "depth", depth });
  const seen = [];
  for await (const update of updates) seen.push(update);
  return { updates: seen, bestMove: await bestMove };
}

describe("EngineSession (real Stockfish process)", () => {
  let session: EngineSession;

  beforeAll(async () => {
    session = new EngineSession(
      new ChildProcessTransport(process.execPath, [enginePath]),
    );
    await session.init();
  }, 20_000);

  afterAll(() => {
    session.quit();
  });

  it("streams increasing-depth updates and resolves a legal bestmove", async () => {
    session.setPosition(STARTING_POSITION);
    const { updates, bestMove } = await collectUpdates(session, 8);

    expect(updates.length).toBeGreaterThan(0);
    expect(updates.at(-1)?.depth).toBe(8);
    expect(
      updates.every(
        (u) => typeof u.score.cp === "number" || typeof u.score.mate === "number",
      ),
    ).toBe(true);

    expect(bestMove?.move).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
  }, 15_000);

  it("reports no legal move in a checkmate position", async () => {
    session.setPosition(FOOLS_MATE_CHECKMATE);
    const { bestMove } = await collectUpdates(session, 5);

    expect(bestMove).toEqual({ move: "(none)" });
  }, 15_000);

  it("stop() ends an in-flight search and still resolves bestMove", async () => {
    session.setPosition(STARTING_POSITION);
    const { updates, bestMove } = session.go({ kind: "infinite" });

    // Let a couple of updates come in, then cut it short.
    const iterator = updates[Symbol.asyncIterator]();
    await iterator.next();
    session.stop();

    const move = await bestMove;
    expect(move?.move).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
  }, 15_000);

  it("reports multiple simultaneous lines when MultiPV > 1", async () => {
    session.setOption({ name: "MultiPV", value: 3 });
    session.setPosition(STARTING_POSITION);
    const { updates } = await collectUpdates(session, 6);

    const multipvSeen = new Set(updates.map((u) => u.multipv));
    expect(multipvSeen).toEqual(new Set([1, 2, 3]));

    session.setOption({ name: "MultiPV", value: 1 });
  }, 15_000);
});
