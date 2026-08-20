/**
 * Node-only. Spawns a UCI engine as a child process and speaks to it over
 * stdin/stdout. `command`/`args` are handed in as-is — this file has no idea
 * where the binary came from (native executable, or `node` plus a script
 * path); that's a deploy/config concern, not this package's.
 */

import { type ChildProcessByStdio, spawn } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import type { Readable, Writable } from "node:stream";

import type { Transport } from "./transport.ts";

export class ChildProcessTransport implements Transport {
  private readonly child: ChildProcessByStdio<Writable, Readable, null>;
  private readonly rl: Interface;

  constructor(command: string, args: string[] = []) {
    this.child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"] });
    this.rl = createInterface({ input: this.child.stdout });
  }

  send(command: string): void {
    this.child.stdin.write(`${command}\n`);
  }

  lines(): AsyncIterable<string> {
    return this.rl;
  }

  close(): void {
    this.rl.close();
    this.child.stdin.end();
    this.child.kill();
  }
}
