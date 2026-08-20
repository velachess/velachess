# apps/server

**The only place HTTP exists.** Hono over the Node adapter. Routes are
thin: validate (zod), call `libs/application`, map outcomes to status
codes. `AppType` is exported for a future UI as a _type only_ — importing
it pulls zero runtime code.

## Surface

```
GET  /health                      liveness
GET  /openapi.json                hand-authored OpenAPI 3.1 document
POST /accounts                    track a chess.com/Lichess account (upsert)
GET  /accounts                    tracked accounts + last sync + delivery state
POST /accounts/{id}/sync          202 — enqueue; the worker refreshes and judges
GET  /accounts/{id}/games         games + judgment + analyzed flag, no PGNs
GET  /games?platform=&username=   importing: a player's games, filled once
POST /games/judge                 judge unjudged games now (interactive path)
GET  /games/{id}                  full game, rawPgn included (board replay)
GET  /deviations                  own deviations: verdict + context + drilled flag
GET  /games/{id}/analysis         analysis state + a running run's progress
GET  /games/{id}/analysis/events  SSE, EventSource-ready — watch a run (below)
POST /games/{id}/analyze          202 — ask for the analysis; the worker runs it
GET/POST /repertoires             list / create
GET  /repertoires/{id}            header + ordered chapters (name, pgn)
POST /repertoires/extract         derive the book from the user's games
DELETE /repertoires/{id}          remove (judgment history survives)
POST /repertoires/{id}/chapters   add a PGN chapter
GET  /drill/queue                 what is waiting: due, fresh, split by origin
GET  /drill/next                  next due card, else a new exercise (204 = done)
POST /drill/answer                grade + schedule
GET  /overview                    per-user counters
GET  /insights/adherence          adherence metrics per repertoire
```

## Asking for an analysis, and watching one

The trigger and the stream are separate endpoints, and neither of them
runs the engine. **The API process holds no Stockfish at all** — that is
the worker's job, delivered by pg-boss.

| `requestAnalysis` says                    | `POST /analyze`    |
| ----------------------------------------- | ------------------ |
| completed                                 | 200, cached report |
| failed (retries exhausted, dead-lettered) | 409                |
| anything else                             | 202, enqueued      |

The POST used to hold the run open and stream it, which made the HTTP
request the computation: a deploy killed the analysis mid-game, a second
replica could not observe one, and progress was visible only while a
client stayed connected.

`GET /games/{id}/analysis/events` is a plain `GET`, so `EventSource`
opens it with no polyfill and no hand-written parser. It owns nothing: it
reads the `analysis_progress` rows the worker commits and the report that
supersedes them.

```
analysis.opened        once, carrying retry
analysis.move-graded   per ply, id = its 0-based index
analysis.completed     terminal, the whole report
analysis.failed        terminal
```

Namespaced past-tense names, and **nothing is called `error`** — that
name collides with the event `EventSource` itself fires on transport
failure, and both would arrive at the same listener. The frame name is
the discriminant, so no payload repeats it.

`id:` on every graded frame is what makes the browser send
`Last-Event-ID` back on its own reconnection; the route resumes from the
frame after it instead of replaying the run. `: keep-alive` comments stop
proxies closing an idle stream, and `X-Accel-Buffering: no` stops nginx
buffering it into something indistinguishable from a hang.

**A terminal event closes the connection.** An EventSource left hanging
reconnects by itself every few seconds, so a route that finished without
saying so is an endless request loop rather than a stalled screen. The
connection deadline is the one exception: it ends _without_ a terminal
event, because the run has not finished and the browser resuming is
exactly what should happen.

**One poll loop per game, not per connection** (`src/watchers.ts`). Each
watcher used to run its own — `listProgress` plus `requestAnalysis` every
400ms, about five queries a tick — so ten people on the same analysis
meant ten loops asking the same question. The first subscriber starts the
loop, the rest attach to what it already knows, and the last one out
stops it. Per process: two replicas mean two loops for a game, and two is
not ten.

Disconnecting costs nothing here — there is no execution on this side to
cancel. `GET /games/{id}/analysis` carries `graded`/`total` for the same
run, so a client that would rather poll than stream still shows a real
progress bar.

## OpenAPI anti-drift

The spec is hand-authored in `src/openapi.ts` and served at
`GET /openapi.json`. `__tests__/openapi.test.ts` walks `app.routes` and fails
if any registered route is missing from the spec or any documented
operation has no route — the document cannot silently rot. Contract tests
go one level deeper: the `{ error }` shape the spec promises is asserted
against real 400s (invalid body, malformed id) and the JSON 404.

## Errors and validation

One JSON contract everywhere: `src/validation.ts` wraps zValidator so a
failed body or path-param validation answers `{ error, details? }` (not
zod's default dump), every `/:id` route validates the UUID before any db
touch, and global `notFound`/`onError` handlers keep unknown routes and
unmapped exceptions on the same shape.

## Identity

Middleware resolves the single user (`ensureDefaultUser`) per request and
passes `userId` via context — registered AFTER `/health` and
`/openapi.json`, so liveness and documentation answer even when the
database is down. Services never know about "current user"; swapping in
real auth later touches only the middleware.

## Maintenance notes

Dependency bump pending, deliberately not done blind: hono ^4.6 → 4.13.2
and @hono/zod-validator ^0.4 → 0.9 (changelog review + full api suite
before committing).

## Tests

`__tests__/api.test.ts` — route behavior over the real harness (PGlite +
migrations + pg-boss + shallow Stockfish): validation, upsert semantics,
sync 202 + dedup, judge outcome, the analyze state mapping, the watch
route replaying staged progress and closing on the report, cache
short-circuit, stats.
Root `__e2e__/full-loop.test.ts` — the acceptance loop through the two
apps only; it lives at the repo root, not here, because it composes both
deployables (see `docs/explanation/architecture.md`).
