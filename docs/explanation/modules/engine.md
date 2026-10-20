# libs/infra/engine

**[ENGINE] — talks UCI to a Stockfish process or worker, and keeps that
conversation alive.** It owns the protocol, the session's lifetime, the
search watchdog, and recovery from an engine that died. It doesn't judge a
move — that's `@velachess/analysis` for classification and `libs/chess` for
legality. It doesn't know where the Stockfish binary or wasm came from, and
it doesn't decide when a run starts.

Everything asynchronous here is an Effection `Operation`. A session is a
resource: it exists for as long as the scope that opened it, and leaving
that scope quits the engine and tears the transport down — there is no
`close()`/`quit()` for a caller to remember.

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

`useEngineSession(open, options)` is a resource. It opens a transport,
completes the UCI handshake, applies any UCI options, and only then hands
the session to its caller — so there is no "not ready yet" state for a
consumer to guard against. A handshake that times out or whose stream ends
early fails the resource, which tears the transport down on the way out.

Teardown ordering is a structural guarantee rather than a sequence someone
has to get right: `ensure(() => transport.send("quit"))` is registered
_after_ the transport is open, so it unwinds _before_ the transport's own
teardown. The engine is told to quit while it can still hear it.

`search(mode)` is a `Stream<EngineUpdate, SearchOutcome>`, because
Stockfish replies in two shapes — many `info` lines while it thinks, then
exactly one `bestmove` line when it's done:

```
search()
  ├→ update (depth 1)
  ├→ update (depth 2)
  ├→ update (depth 3)
  └→ returns { lastInfo, bestMove }
```

A consumer that only wants the result drains the stream and reads its
return value; a consumer that wants to react per line reads the updates as
they arrive. `lastInfo` is tracked by the stream itself — the last line at
`multipv 1`, not merely the last line seen — so a caller never has to
filter. `bestMove` is `null` when the transport's line stream ended before
the engine answered, which is what a dead process or a crashed worker looks
like from here.

Starting a second search while one is in flight throws. Two concurrent
searches would both be pulling `info` lines off the same single-consumer
line stream with no way to tell which search a line belongs to.

`stop()` doesn't kill the engine — it asks Stockfish to finish early. The
search still settles through the normal `bestmove` path.

## EngineEvaluator

`useEngineEvaluator(open, options)` is the reliability layer, and the only
thing in this package that owns more than one session. `evaluate(fen)`
searches a position and comes back with the engine's own answer; what it
adds is what to do when the engine misbehaves.

- **Silence watchdog.** `silenceTimeoutFor(depth)` —
  `clamp(5000, 30000, 3000 + depth * 400)` ms — is how long the engine may
  say _nothing at all_, and it is rearmed by every `info` line. A slow deep
  search is therefore not mistaken for a dead one, which a single total
  deadline cannot distinguish.
- **Grace period.** When the watchdog fires, `stop()` goes out and the
  remaining drain gets one 2 s deadline for the whole of it, not rearmed per
  line — a chatty but stuck engine cannot extend it.
- **Recovery.** A search that produced nothing retries once on a _fresh_
  session, and the budget is per call, so one bad position never spends a
  whole game's only retry. Two failures throw
  `Engine failed twice evaluating <fen>`.

The replaceable session is held by a task the evaluator spawned, so
replacing it is halting that task — which awaits the dead worker's actual
teardown — and opening another. Nothing in the evaluator needs its own
cleanup: its scope dying halts the session task, which unwinds the session
resource, which quits the engine.

It returns the engine's vocabulary (`lastInfo`, `bestMove`) and nothing
else. White POV, classification and caching belong to whoever asked, which
keeps this package free of any dependency on a business module.

## Transport

A transport is two things: `send(command)`, and `lines` — a single-consumer
`Subscription<string, void>`. It is a `Subscription` rather than a `Stream`
on purpose: a second subscriber would split the engine's replies between
two readers. The subscription buffers from the moment the transport opened,
which is what structurally guarantees a reply arriving before anyone waits
is not lost. There is no `close()` — closing belongs to the resource that
opened it.

The two concrete implementations are deliberately not re-exported from
`index.ts`: each pulls in platform-only globals (Node's `child_process` and
`readline` for one, the browser's `Worker` for the other), so importing the
barrel must never force either into scope. Consumers import the one they
need by subpath — `@velachess/infra-engine/child-process-transport` or
`@velachess/infra-engine/worker-transport`.

`useChildProcessTransport` treats `command`/`args` as an opaque
pass-through — it doesn't know or care whether that's a native binary or
`node some-script.js`. stderr is discarded.

`useWorkerTransport` wraps an already-constructed `Worker`. The worker's
`error` event closes the line stream: a crashed child process closes its
stdout, which ends readline naturally, but a crashed worker posts no final
message of its own, so without this a waiting consumer would hang instead
of seeing the stream end the same way.

## Testing

This package is the core the rest of the app depends on, so it's tested at
several isolation levels on purpose:

- **`createFakeEngine`** — an in-memory transport double that drives
  session and evaluator tests deterministically: handshake ordering, the
  handshake timeout, command formatting, the concurrency guard, `stop()`,
  and teardown ordering. Its teardown pushes a `<closed>` marker onto the
  recorded commands, so a test can assert `quit` was sent _before_ the
  transport went away rather than merely that both happened.
- **`echo-process.mjs`** — a trivial stdin-to-stdout echo script that tests
  the child-process transport's plumbing (spawn, stdio wiring, teardown)
  with zero UCI semantics.
- **A hand-rolled fake `Worker`** — tests the worker transport the same
  way, with no jsdom or DOM dependency, including that leaving the scope
  removes both listeners and terminates the worker.
- **Scripted engines per session** — the evaluator's tests give each
  session its own script, which is how "retried on a _fresh_ session" and
  "the budget is per position" are observable rather than inferred.
- **A real Stockfish process** — spawns the actual `stockfish` npm package
  and drives a real UCI session end to end: a normal search with increasing
  depth, a checkmate position settling on `"(none)"`, `stop()` mid-search,
  `MultiPV > 1` producing multiple simultaneous PV lines, and the evaluator
  running several searches over one session.

Effection's own semantics are load-bearing here, so the tests pin the ones
that are: a halt unwinds through `finally` but never through `catch`, and
awaiting a halted task throws a catchable error rather than killing the
awaiting operation.

## Layout

```
index.ts                     public surface — types + protocol + Transport type
                              + session + evaluator (omits both transports)
types.ts                     GoMode, EngineScore, EngineUpdate, BestMove,
                              EngineOption, SearchOutcome
protocol.ts                  buildGoCommand/buildPositionCommand/buildSetOptionCommand,
                              parseInfoLine, parseBestMoveLine
transport.ts                 Transport interface — send + lines
child-process-transport.ts   Node-only: useChildProcessTransport
worker-transport.ts          Browser-only: useWorkerTransport
engine-session.ts            useEngineSession — setOption/setPosition/search/stop
engine-evaluator.ts          useEngineEvaluator — watchdog, grace, retry, recovery
```
