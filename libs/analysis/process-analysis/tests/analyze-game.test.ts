// @vitest-environment node
import { createRequire } from "node:module";

import { parsePgn } from "@velachess/chess";
import { EngineSession, type Transport } from "@velachess/infra-engine";
import { ChildProcessTransport } from "@velachess/infra-engine/transport-child-process";
import { describe, expect, it } from "vitest";

import type { StoredGradedPly } from "@velachess/infra-db";

import { analyzeGame, type AnalysisEvent, type GradedPly } from "../analyze-game.ts";

// Drift guard: infra-db stores a report as jsonb and declares its own
// structural mirror of GradedPly, because drizzle-kit's schema loader must
// never pull in the chess toolchain. The two must stay mutually
// assignable, checked at typecheck time in both directions.
//
// It lives here, not in infra-db's own tests, because this is the
// direction the package graph already runs: analysis depends on infra-db.
// The reverse made @velachess/analysis a devDependency of infra-db, which
// turned the graph into a cycle and made every analysis-only change mark
// infra-db — and everything downstream of it — affected.
const toStoredDriftCheck: StoredGradedPly = {} as GradedPly;
const fromStoredDriftCheck: GradedPly = {} as StoredGradedPly;
void toStoredDriftCheck;
void fromStoredDriftCheck;

const require = createRequire(import.meta.url);
const enginePath = require.resolve("stockfish/bin/stockfish-19-lite-single.js");

async function makeStockfishSession(): Promise<EngineSession> {
  const session = new EngineSession(
    new ChildProcessTransport(process.execPath, [enginePath]),
  );
  await session.init();
  return session;
}

const FOOLS_MATE = "1. f3 e5 2. g4 Qh4# *";

async function collect(events: AsyncIterable<AnalysisEvent>) {
  const positions = [];
  let done;
  for await (const event of events) {
    if (event.type === "position") positions.push(event);
    else done = event;
  }
  return { positions, done };
}

describe("analyzeGame (real Stockfish)", () => {
  it("streams one event per ply, then done, with white-POV evals and the losing blunder flagged", async () => {
    const game = parsePgn(FOOLS_MATE)[0]!;
    const { positions, done } = await collect(
      analyzeGame(game, makeStockfishSession, { depth: 8 }),
    );

    expect(positions).toHaveLength(4);
    expect(positions.map((e) => e.index)).toEqual([0, 1, 2, 3]);
    expect(positions.every((e) => e.total === 4)).toBe(true);
    expect(done?.positions).toHaveLength(4);

    // 3. g4 allows mate in one — the eval after it must be a black mate, white POV.
    const g4 = done!.positions[2]!;
    expect(g4.san).toBe("g4");
    expect(g4.evalAfter.mate).toBeLessThan(0);
    expect(g4.category).toBe("blunder");

    // Final position is checkmate: terminal eval, no search.
    const qh4 = done!.positions[3]!;
    expect(qh4.san).toBe("Qh4#");
    expect(qh4.evalAfter).toEqual({ mate: -1 });
  });

  it("a watchdog timeout followed by a live engine reply continues instead of failing", async () => {
    const game = parsePgn("1. e4 e5 *")[0]!;
    const { positions } = await collect(
      analyzeGame(game, makeStockfishSession, { depth: 10, searchTimeoutMs: 1 }),
    );
    expect(positions).toHaveLength(2);
  });
});

describe("analyzeGame failure policy", () => {
  class MuteTransport implements Transport {
    readonly sent: string[] = [];
    send(command: string): void {
      this.sent.push(command);
    }
    // Never emits and never ends: the watchdog is what must react.
    // Written as a plain method rather than `async *` because a generator
    // with no yield is a lint error and, more to the point, a lie about
    // what this does.
    lines(): AsyncIterable<string> {
      return {
        [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => {}) }),
      };
    }
    close(): void {}
  }

  it("retries once on a dead engine, then fails the game", async () => {
    let sessions = 0;
    const makeMuteSession = async () => {
      sessions++;
      return new EngineSession(new MuteTransport());
    };

    const game = parsePgn("1. e4 e5 *")[0]!;
    await expect(
      collect(analyzeGame(game, makeMuteSession, { depth: 8, searchTimeoutMs: 50 })),
    ).rejects.toThrow(/failed twice/);
    expect(sessions).toBe(2);
  }, 15_000);
});
