import { createRequire } from "node:module";

import { race, run, scoped, sleep, type Operation } from "effection";
import { describe, expect, it } from "vitest";

import { useChildProcessTransport } from "../child-process-transport.ts";
import type { Transport } from "../transport.ts";

// Isolated from any real chess engine — a trivial stdin->stdout echo proves
// send() and the line stream actually move bytes through a real child
// process, independent of UCI semantics (those are protocol.ts's job).

const require = createRequire(import.meta.url);
const echoScript = require.resolve("./fixtures/echo-process.mjs");

function open(): Operation<Transport> {
  return useChildProcessTransport(process.execPath, [echoScript]);
}

function* readUntilDone(transport: Transport): Operation<"ended"> {
  while (true) {
    const next = yield* transport.lines.next();
    if (next.done) return "ended";
  }
}

function* timeout(ms: number, message: string): Operation<"ended"> {
  yield* sleep(ms);
  throw new Error(`timed out — ${message}`);
}

describe("useChildProcessTransport", () => {
  it("send() writes a line the child process receives", async () => {
    const line = await run(function* () {
      const transport = yield* open();
      transport.send("hello");
      const { value } = yield* transport.lines.next();
      return value;
    });

    expect(line).toBe("echo:hello");
  });

  it("yields responses in the order commands were sent", async () => {
    const lines = await run(function* () {
      const transport = yield* open();
      transport.send("first");
      transport.send("second");

      const first = yield* transport.lines.next();
      const second = yield* transport.lines.next();
      return [first.value, second.value];
    });

    expect(lines).toEqual(["echo:first", "echo:second"]);
  });

  it("leaving the scope kills the child and ends the stream", async () => {
    const outcome = await run(function* (): Operation<"ended"> {
      let transport!: Transport;

      yield* scoped(function* () {
        transport = yield* open();
      });

      // Reading after teardown must end rather than hang. The race is the
      // assertion: a transport that leaked its child would suspend here.
      return yield* race([
        readUntilDone(transport),
        timeout(3000, "lines did not end after the scope exited"),
      ]);
    });

    expect(outcome).toBe("ended");
  });
});
