# libs/application

**[APPLICATION] — the composition layer. Orchestrates domain capabilities,
never implements them.**
Consumed by `apps/server` and `apps/worker`; those two stay thin because
every multi-package flow lives here. Knows queue _ports_, never pg-boss;
knows `Database`, never HTTP.

## Services

- `bootstrap.ts` — `ensureDefaultUser`: single-user get-or-create. The
  api middleware resolves identity once and passes `userId` on; no
  service knows about a "current user".
- `sync.ts` — three things, in order of how often they run:
  - `openArchive`: "show me this player's games", and the whole of
    importing. Read-through — a username nobody opened yet is tracked and
    filled once, then every later read is a database query.
  - `syncAccount`: fetch (chess.com/Lichess) → save → advance cursor only
    on a complete pass; mark the account synced on any complete pass
    (an empty archive produces no cursor and still counts).
  - `processAccountSync`: the refresh routine — pull what's new, judge it,
    keep the drilling routines current. No engine.
- `judge.ts` — `judgeGamesForUser`: builds the judging repertoire per
  color (oldest chaptered one wins, deterministically), and judges each
  game PER REPERTOIRE — a game is pending for repertoire R until R judged
  it, so a fresh extraction reaches games older repertoires already
  judged. Judging is replay, never the engine. `enqueueAnalysis` is
  opt-in and off by default: when it is on, judgment persistence and the
  enqueue share one transaction.
- `extract.ts` — `extractRepertoire`: loads the user's games of a color,
  replays them, feeds the pure trie (`@velachess/repertoire`), and writes
  the result into the fixed `Extracted — <color>` repertoire (typed
  constants) — chapters fully replaced in one transaction, so
  re-extraction is idempotent.
- `perspective.ts` — `resolveGamePerspective`: the one place that decides
  which side is "you" (stored perspective wins; else tracked-account
  username vs player names; else null).
- `analyze.ts` — the heart. See below.
- `triage.ts` — `triageAndSeed`: harmful, analysis-confirmed deviations
  become exercises. Since severity only exists for games someone opened,
  exercises grow out of the games you reviewed.
- `review.ts` — `getReviewItem` (oldest due card, else a new exercise,
  EPD → playable FEN, per-grade previews) and `submitAnswer` (check →
  grade → record → schedule).
- `reports.ts` — UI read models: `listAdherence` (adherence per
  repertoire — the math is cycle-2's pure `adherenceMetrics`) and
  `reviewForecast` (cards due per day — cycle-4's pure `forecast`).
- `locks.ts` — `sessionAdvisoryLock`: `pg_try_advisory_lock` where the
  acquisition IS the check (no TOCTOU), plus an in-process set because
  session locks are reentrant within one connection.

## Analysis: one primitive, two callers

`tryStartAnalysis` is the only way an analysis run starts. The advisory
lock decides ownership atomically; the interactive route (SSE) and the
background consumer both call it and accept whatever it decides:

- `started` — this caller owns the run. It gets an `AnalysisExecution`:
  a broadcast `events` iterable (subscribe before `start()`; a subscriber
  that stops reading never stops the run — disconnect ≠ cancel is
  structural), a `result` promise, and `start()`.
- `running` — someone alive holds the lock. Observe, don't drive.
- `completed` — cached. A crash-retried job never re-runs the engine.

Completion is atomic: the engine report and the judgment severity update
(`applyEngineSignal`) commit in one transaction.

`requestAnalysis` is the read-only composition for HTTP state mapping
(created / queued / running / failed / completed) — it inspects the domain
table and the queue, never the lock (that would reintroduce TOCTOU).

## Tests

One suite over the real harness — PGlite + real migrations + pg-boss +
real Stockfish (shallow depth): bootstrap idempotence, sync fixture and
cursor, `openArchive` filling once and then only reading, judge with
transactional enqueue when it is asked for, the TOCTOU race (two concurrent
`tryStartAnalysis`, exactly one starts), disconnect ≠ cancel, completed
short-circuit, triage, review round-trip.
