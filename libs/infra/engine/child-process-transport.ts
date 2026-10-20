/**
 * Node-only. Spawns a UCI engine as a child process and speaks to it over
 * stdin/stdout. `command`/`args` are handed in as-is — this file has no idea
 * where the binary came from (native executable, or `node` plus a script
 * path); that's a deploy/config concern, not this package's.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import { createQueue, ensure, resource, type Operation } from "effection";

import type { Transport } from "./transport.ts";

export function useChildProcessTransport(
  command: string,
  args: string[] = [],
): Operation<Transport> {
  return resource(function* (provide) {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"] });
    const readline = createInterface({ input: child.stdout });
    const lines = createQueue<string, void>();

    const onLine = (line: string) => lines.add(line);
    const onClose = () => lines.close();

    readline.on("line", onLine);
    readline.on("close", onClose);

    yield* ensure(() => {
      readline.off("line", onLine);
      readline.off("close", onClose);
      readline.close();
      child.stdin.end();
      child.kill();
      // The `close` handler is already detached, so nothing else would
      // end the stream.
      lines.close();
    });

    yield* provide({
      send: (uci) => void child.stdin.write(`${uci}\n`),
      lines,
    });
  });
}
