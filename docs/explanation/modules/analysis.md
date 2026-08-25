# libs/analysis

**[ANALYSIS] — turns engine evaluations into move judgments.**
Doesn't persist, doesn't fetch, doesn't own a process. Pure conversion and
classification, plus one game runner that drives an `EngineSession` the
caller provides. The caller wires db and transport — same boundary rule as
`libs/repertoire`.

Exact values — engine configuration, thresholds, persisted shapes — live in
`docs/reference/analysis.md`. This document is the reasoning.

## Flow

```
            game PGN                     chapter PGN (cycle 0)
               │                              │
               ▼                              ▼
         replayMainline                 buildRepertoire
               │                              │
               ▼                              ▼
   ┌─── analyzeGame ────────┐           findDeviation
   │  one search per ply    │                 │
   │  single EngineSession  │                 ▼
   │  watchdog + retry-once │           upsertJudgment ── cp_loss: null
   └───────┬────────────────┘                 │           engine_category: null
           │ yields                           │
           ▼                                  │
   { type: "position", index, total, … }      │
   { type: "done", positions }                │
           │                                  │
           ▼                                  ▼
     saveAnalysis ──────────────► engineSignalForDeviation(positions, ply)
     (game_analyses row =                     │
      analyzed + cached)                      ▼
                                       applyEngineSignal ── fills both columns
```

## Score handling

UCI engines report scores from the side to move's point of view; every
consumer downstream works in white POV. `toWhitePov` does the conversion
once — no other file is allowed to flip signs. Getting this wrong flips
`cp_loss` for half the moves in every game, which is why the conversion is
a named module with its own tests rather than an inline negation.

`winchance.ts` converts centipawns to a win-chance in [-1, 1] with the
logistic curve from Lichess's open, regression-fitted model (constant
`-0.00368208`): centipawns are ceiled at ±1000 before the curve, and a
mate score maps through that same ceiling (≈ ±0.951) rather than
saturating to ±1 — matching the reference server implementation exactly.
That near-saturated value is still what makes a move that allows mate
classify as a blunder.

## Reference grounding

This module is not validated by intuition — `tests/lichess-reference.test.ts`
pins it to Lichess's public implementation, same inputs, same expected
outputs:

| What                                                       | Reference source                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Win% formula + cp ceiling + mate mapping                   | `scalachess core/src/main/scala/eval.scala` (`WinPercent.winningChances`, `fromCentiPawns`, `fromMate`); prose at lichess.org/page/accuracy |
| Judgment thresholds (.1/.2/.3 win-chance drop)             | `lila modules/tree/src/main/Advice.scala` (`CpAdvice.winningChanceJudgements`)                                                              |
| Move accuracy curve (exact constants, +1 bonus)            | `lila modules/analyze/src/main/AccuracyPercent.scala` (`fromWinPercents`)                                                                   |
| Game accuracy (windows, volatility weights, harmonic mean) | same file, `gameAccuracy`; math helpers from `lichess-org/scalalib` (`Maths.scala`)                                                         |
| Expected values                                            | `lila modules/analyze/src/test/AccuracyPercentTest.scala`, all cases ported verbatim with the same tolerances                               |

Lichess's constants come from a regression over real games
(lichess-org/lila#11148) — the empirical grounding the classifier
inherits by matching the implementation exactly.

The accuracy half of this port (`moveAccuracy`, `gameAccuracy`) is fully
tested and not yet wired into any product surface — it exists so an accuracy
number, when the product wants one, matches what players already know from
the reference site.

## Classification

Five categories (`best`, `good`, `inaccuracy`, `mistake`, `blunder`) from
win-chance loss, thresholds 0.10 / 0.20 / 0.30 — the conventional public
cut-offs for ?!/?/??. A move matching the engine's first PV move is `best`
regardless of eval noise. Gaining eval is never punished (loss clamps at
zero). `toEngineCategory` collapses the five report categories into the
`deviations` table's four-value severity enum (`best`/`good` → `ok`).

No rating-based adjustment — a deliberate cut, revisited only with real
user data to calibrate against. Two consequences of the win-chance curve
worth knowing when reading reports: losing ground in an already-decided
position barely moves the number (the curve is flat far from zero), while
the same centipawn swing near equality can cross two thresholds.

## Game runner

`analyzeGame` evaluates every mainline position with one engine session,
one search per ply, and yields a `position` event as each ply completes —
the streaming shape a future transport (SSE route handler or otherwise)
can forward as-is — then `done` with the full report. A terminal final
position (mate/stalemate) gets a saturated eval directly, no search.

In production the worker runs this at **depth 12** — set in
`process-analysis.ts`, not here; `analyzeGame`'s own default (14) is never
used in production. Depth is the single biggest lever on classification
quality: the engine at depth 12 with no MultiPV can only compare the played
move against one principal variation.

Failure policy: each search runs under a watchdog
(`3000 + depth·400` ms, clamped to [5s, 30s]). On timeout the engine is
asked to `stop`; if it answers within a grace period the analysis simply
continues. A search that stays silent — or a transport that died — gets a
fresh session from the caller's factory and one retry for the whole game;
a second failure throws. `EngineSession.init` itself has a handshake
timeout for the same reason: a hung engine must fail loudly, not stall a
queue.

## Persistence and execution (lives in libs/infra, not here)

`game_analyses` stores the full per-ply report as jsonb, one row per game
with a unique index — **row existence is the analyzed/not-analyzed
distinction**, and the row doubles as the whole-report cache
(re-enqueueing an analyzed game is a no-op). Category counters are
derivable from the jsonb and deliberately not materialized. The cache has
no invalidation: a report produced under yesterday's engine settings stays
until someone decides otherwise, which is why `depth` and `engine_version`
ride on every row.

Delivery is pg-boss (`libs/infra/queue`): the HTTP route only enqueues, the
worker consumer invokes `completeAnalysis`, and pg-boss owns retry, backoff
and concurrency. Execution ownership is the session advisory lock in
`libs/infra/db/advisory-lock.ts` — an application invariant covering
HTTP-vs-worker races, not queue dedup; both layers are needed.

While a run is live, each graded ply is committed immediately as an
`analysis_progress` row under the run's own `run_id` — a progress row inside
the final transaction would be invisible to the connection streaming it. The
completion transaction writes the report and fills every existing judgment's
severity together; the progress rows are then deleted. A crashed run's
leftovers stay under their dead `run_id` and readers only follow the newest.

`applyEngineSignal` fills the `cp_loss`/`engine_category` columns cycle 0
created nullable — the severity signal drill triage consumes.

## Testing

Pure modules have exhaustive unit tests (threshold boundaries, POV
mirror-image symmetry, mate saturation, UCI rendering including the
knight-is-n promotion letter). The game runner runs against the real
Stockfish the repo already ships for engine tests: a four-ply mating game
must produce the losing move flagged as a blunder and a saturated terminal
eval; the failure policy is tested with a mute transport (retry once, then
fail, exactly two sessions created). The queue/cache/acceptance e2e lives
in `libs/infra/db/tests/analysis-flow.test.ts` and runs the whole diagram
above against a real database.

## Layout

```
winchance.ts          cp → win chance (±1000 ceiling, mate via ceiling), winPercent
accuracy.ts           moveAccuracy, gameAccuracy — reference port (no product callers yet)
score.ts              side-to-move POV → white POV, once
classify.ts           5 categories, reference thresholds, toEngineCategory, cpLoss
phase.ts              gamePhaseOf — opening/middlegame/endgame heuristic (insights only)
uci.ts                Move → UCI string (bestmove comparison)
analyze-game.ts       analyzeGame — events, watchdog, retry-once
deviation-signal.ts   engineSignalForDeviation — analysis × judgment
index.ts              public surface
tests/lichess-reference.test.ts   the grounding suite — see table above
```
