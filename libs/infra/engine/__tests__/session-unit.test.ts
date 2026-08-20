import { describe, expect, it } from "vitest";

import { EngineSession } from "../session.ts";
import { FakeTransport } from "./fake-transport.ts";

describe("EngineSession.init", () => {
  it("sends uci then isready, resolving once both acks arrive", async () => {
    const transport = new FakeTransport();
    const session = new EngineSession(transport);

    const initDone = session.init();
    // Junk lines before the ack (id name, options) are just ignored.
    transport.emit("id name Stockfish 18");
    transport.emit("uciok");
    transport.emit("readyok");
    await initDone;

    expect(transport.sent).toEqual(["uci", "isready"]);
  });

  it("doesn't send isready until uciok arrives", async () => {
    const transport = new FakeTransport();
    const session = new EngineSession(transport);

    const initDone = session.init();
    expect(transport.sent).toEqual(["uci"]);

    // Junk lines before uciok must not trigger isready early.
    transport.emit("id name Stockfish 18");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(transport.sent).toEqual(["uci"]);

    transport.emit("uciok");
    transport.emit("readyok");
    await initDone;
    expect(transport.sent).toEqual(["uci", "isready"]);
  });
});

describe("EngineSession.setOption", () => {
  it("sends a formatted setoption command", () => {
    const transport = new FakeTransport();
    const session = new EngineSession(transport);

    session.setOption({ name: "MultiPV", value: 3 });

    expect(transport.sent).toEqual(["setoption name MultiPV value 3"]);
  });
});

describe("EngineSession.setPosition", () => {
  it("sends position with and without moves", () => {
    const transport = new FakeTransport();
    const session = new EngineSession(transport);

    session.setPosition("fen-a");
    session.setPosition("fen-b", ["e2e4", "e7e5"]);

    expect(transport.sent).toEqual([
      "position fen fen-a",
      "position fen fen-b moves e2e4 e7e5",
    ]);
  });
});

describe("EngineSession.go", () => {
  it("streams updates and resolves bestMove", async () => {
    const transport = new FakeTransport();
    const session = new EngineSession(transport);

    const { updates, bestMove } = session.go({ kind: "depth", depth: 5 });
    expect(transport.sent).toEqual(["go depth 5"]);

    transport.emit("info depth 1 multipv 1 score cp 10 pv e2e4");
    transport.emit("info depth 2 multipv 1 score cp 12 pv e2e4 e7e5");
    transport.emit("bestmove e2e4 ponder e7e5");

    const seen = [];
    for await (const update of updates) seen.push(update);

    expect(seen).toHaveLength(2);
    expect(seen[1]?.depth).toBe(2);
    expect(await bestMove).toEqual({ move: "e2e4", ponder: "e7e5" });
  });

  it("throws if called again before the previous search resolved", () => {
    const transport = new FakeTransport();
    const session = new EngineSession(transport);

    session.go({ kind: "infinite" });

    expect(() => session.go({ kind: "infinite" })).toThrow(/still in flight/);
  });

  it("allows a new go() once the previous bestMove has resolved", async () => {
    const transport = new FakeTransport();
    const session = new EngineSession(transport);

    const first = session.go({ kind: "depth", depth: 1 });
    transport.emit("bestmove e2e4");
    await first.bestMove;

    expect(() => session.go({ kind: "depth", depth: 1 })).not.toThrow();
  });

  it("stop() lets an in-flight search's bestMove resolve without draining every update", async () => {
    const transport = new FakeTransport();
    const session = new EngineSession(transport);

    const { updates, bestMove } = session.go({ kind: "infinite" });
    const iterator = updates[Symbol.asyncIterator]();

    transport.emit("info depth 1 multipv 1 score cp 10 pv e2e4");
    await iterator.next();

    session.stop();
    expect(transport.sent).toContain("stop");

    transport.emit("bestmove e2e4");
    expect(await bestMove).toEqual({ move: "e2e4" });
  });
});

describe("EngineSession.quit", () => {
  it("sends quit and closes the transport", () => {
    const transport = new FakeTransport();
    const session = new EngineSession(transport);

    session.quit();

    expect(transport.sent).toEqual(["quit"]);
    expect(transport.closed).toBe(true);
  });
});

describe("EngineSession.init timeout", () => {
  it("rejects instead of hanging when the engine never answers the handshake", async () => {
    const transport = new FakeTransport();
    const session = new EngineSession(transport);

    await expect(session.init({ timeoutMs: 50 })).rejects.toThrow(/handshake timed out/);
    expect(transport.sent).toContain("uci");
  });

  it("completes normally when the engine answers in time", async () => {
    const transport = new FakeTransport();
    const session = new EngineSession(transport);

    const init = session.init({ timeoutMs: 1000 });
    transport.emit("uciok");
    transport.emit("readyok");

    await expect(init).resolves.toBeUndefined();
  });
});
