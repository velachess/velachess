# libs/infra/engine

**[ENGINE] — talks UCI to a Stockfish process or worker and streams back
what it says.** Doesn't judge a move — that's application-layer (e.g.
`libs/chess` for legality). Doesn't know where the Stockfish binary or
wasm came from. Doesn't orchestrate a whole game.

## Protocol

`protocol.ts` is the only place in this package that knows what UCI text
looks like. It's pure functions, both directions:

- Builders — `buildGoCommand`, `buildPositionCommand`, `buildSetOptionCommand`
  — turn VelaChess's structured objects into UCI command strings.
- Parsers — `parseInfoLine`, `parseBestMoveLine` — turn Stockfish's text
  output back into typed values.

No I/O, so it's tested against literal strings with no process or transport
involved.

`parseInfoLine` deliberately discards two kinds of line: `info string`
messages, and any `score cp N` or `score mate N` carrying an `upperbound` or
`lowerbound` qualifier. A bound isn't a settled evaluation for that depth —
it's Stockfish saying "the true value is at least/at most this" during an
aspiration-window re-search. Treating it as a real update would report a
wrong score at that depth. This was a real bug caught during a coverage
audit, not something obvious from reading the UCI spec up front.

## EngineSession

`EngineSession` is what a consumer actually holds. Its constructor pulls
one `AsyncIterator<string>` out of the transport and keeps it — every
method (`init`, `go`, `stop`) reads from that same shared iterator. That
single fact is why only one search can be in flight at a time (below).

`init()` runs the UCI handshake in order: send `uci`, drain lines until
exactly `uciok`, send `isready`, drain until exactly `readyok`. Anything
else Stockfish says in between (`id name ...`, `option name ...`) is
discarded. The order matters — `isready` must not go out before `uciok`.

`go(mode)` returns two different things, not one, because Stockfish itself
replies in two different shapes — many `info` lines while it thinks, then
exactly one `bestmove` line when it's done:

```
go()
  ├→ update (depth 1)
  ├→ update (depth 2)
  ├→ update (depth 3)
  └→ bestmove
```

`updates` is an `AsyncIterable<EngineUpdate>` a caller can stream to a UI
in real time; `bestMove` is a `Promise<BestMove | null>` that resolves once,
when the search actually ends.

Calling `go()` again before the previous one has resolved throws
synchronously. Two concurrent searches would both be pulling `info` lines
off the same shared iterator, with no way to tell which search a given line
belongs to — so the contract is one active search per session, and a new
one can start only after `bestMove` resolves.

Internally, `go()` runs a pump that keeps draining the iterator regardless
of whether the caller is still reading from `updates`. That decoupling is
what makes `stop()` work correctly even if the caller stopped consuming
updates early — without it, calling `stop()` after reading only one update
used to hang forever, because the transport only advanced when something
external pulled from `updates`. This was found and fixed via e2e testing,
not by inspection.

`stop()` doesn't kill the engine — it asks Stockfish to finish early.
`bestMove` still resolves through the normal `bestmove`-line path once
Stockfish responds.

`quit()` sends `quit` and closes the transport. Terminal — the session
isn't reusable after.

## Transport

`EngineSession` knows nothing about where Stockfish is actually running —
only a three-method interface: `send`, `lines`, `close`. That's what lets
the same session and protocol code run unchanged whether Stockfish is a
server-side process or a browser worker.

The two concrete implementations are deliberately not re-exported from
`index.ts`: each pulls in platform-only globals (Node's `child_process` and
`readline` for one, the browser's `Worker` for the other), so importing the
barrel must never force either into scope. Consumers import the one they
need by subpath — `@velachess/infra-engine/transport-child-process` or
`@velachess/infra-engine/transport-worker`.

`ChildProcessTransport` treats `command`/`args` as an opaque pass-through —
it doesn't know or care whether that's a native binary or `node
some-script.js`. stderr is discarded. `lines()` hands back the process's
`readline` interface directly, since it's already `AsyncIterable<string>`.
`close()` closes the readline interface, ends stdin, then kills the child,
in that order.

`WorkerTransport` wraps an already-constructed `Worker`. It keeps an
internal queue because messages can arrive from the worker before a
consumer ever calls `lines()` — without buffering, those early messages
would be lost. `send()` posts the raw command string directly; there's no
framing on top of it.

## Testing

This package is the core the rest of the app depends on, so it's tested at
three separate isolation levels on purpose, not just unit-tested in
isolation:

- **`FakeTransport`** — an in-memory `Transport` double, drives
  `EngineSession` unit tests deterministically: handshake ordering, command
  formatting, the concurrency guard, and `stop()` without draining every
  update. No real process or worker involved.
- **`echo-process.mjs`** — a trivial stdin-to-stdout echo script that tests
  `ChildProcessTransport`'s plumbing (spawn, stdio wiring, close ordering)
  with zero UCI semantics. It isolates "does the transport move bytes
  correctly" from "is UCI parsed correctly."
- **A hand-rolled fake `Worker`** — tests `WorkerTransport` the same way,
  with no jsdom or DOM dependency.
- **A real Stockfish process** — the one test that spawns the actual
  `stockfish` npm package through `ChildProcessTransport` and drives a real
  UCI session end to end: a normal search with increasing depth, a
  checkmate position where `bestMove` resolves to `"(none)"`, `stop()`
  mid-search, and `MultiPV > 1` producing multiple simultaneous PV lines.
  Everything else in this package is a controlled substitute one level
  removed from this.

## Layout

```
index.ts                    public surface — types + protocol + Transport type + session
                             (deliberately omits both transport implementations)
types.ts                    GoMode, EngineScore, EngineUpdate, BestMove, EngineOption
protocol.ts                 buildGoCommand/buildPositionCommand/buildSetOptionCommand,
                             parseInfoLine, parseBestMoveLine
transport.ts                Transport interface — send/lines/close
transport-child-process.ts  Node-only: ChildProcessTransport
transport-worker.ts         Browser-only: WorkerTransport
session.ts                  EngineSession — init/setOption/setPosition/go/stop/quit
```
