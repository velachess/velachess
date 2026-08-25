import { createRequire } from "node:module";

import { afterEach, describe, expect, it } from "vitest";

import { ChildProcessTransport } from "../transport-child-process.ts";

// Isolated from any real chess engine — a trivial stdin->stdout echo proves
// send()/lines()/close() actually move bytes through a real child process,
// independent of UCI semantics (those are protocol.ts's job).

const require = createRequire(import.meta.url);
const echoScript = require.resolve("./fixtures/echo-process.mjs");

describe("ChildProcessTransport", () => {
  let transport: ChildProcessTransport | undefined;

  afterEach(() => {
    transport?.close();
    transport = undefined;
  });

  it("send() writes a line the child process receives", async () => {
    transport = new ChildProcessTransport(process.execPath, [echoScript]);
    transport.send("hello");

    const { value } = await transport.lines()[Symbol.asyncIterator]().next();
    expect(value).toBe("echo:hello");
  });

  it("lines() yields responses in the order commands were sent", async () => {
    transport = new ChildProcessTransport(process.execPath, [echoScript]);
    const iterator = transport.lines()[Symbol.asyncIterator]();

    transport.send("first");
    transport.send("second");

    expect((await iterator.next()).value).toBe("echo:first");
    expect((await iterator.next()).value).toBe("echo:second");
  });

  it("close() ends the line stream", async () => {
    transport = new ChildProcessTransport(process.execPath, [echoScript]);
    const iterator = transport.lines()[Symbol.asyncIterator]();

    transport.close();

    const result = await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("timed out — lines() didn't end after close()")),
          3000,
        );
      }),
    ]);

    expect(result.done).toBe(true);
  });
});
