// Minimal stdin->stdout echo, used to test ChildProcessTransport in
// isolation without spawning a real chess engine. Not UCI — just proves
// send()/lines() actually move bytes through a real child process.
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  process.stdout.write(`echo:${line}\n`);
});
