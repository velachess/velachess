# Agent Guide — `libs/analysis`

Extends `../../AGENTS.md`. Owns what a chess move was worth: the per-ply
sequencing of a game's evaluations (`analyze-game.ts`), the grading that
turns those evaluations into `GradedPly`s (`grade-game.ts`), and the
policies a result is read through (`score.ts`, `winchance.ts`,
`classify-move.ts`, `move-category.ts`). No persistence, no queue, no
HTTP route, no engine session and no cache — analysis runs entirely in
`apps/web/src/games/browser-analysis/` (Stockfish WASM in a Web Worker),
and a browser-computed result lives only in that session's React Query
cache plus the caches that slice keeps. There is no server/worker
analysis path.

This module does not depend on `@velachess/infra-engine`. The engine
arrives through the one dependency it declares in its own vocabulary:

```ts
interface PositionEvaluator {
  evaluate(fen: string): Operation<RawEval>;
}
```

Watchdogs, timeouts, retries and recovering a dead Worker are
`@velachess/infra-engine`'s `EngineEvaluator`; the cache, and the
conversion from the engine's side-to-move score into white-POV `RawEval`,
are the web slice's `cached-position-evaluator.ts`. What belongs here is
only _which_ positions to evaluate and what the answers mean — which is
why a fake `PositionEvaluator` is an object literal, and why nothing in
this module's own tests needs a Worker.

`analyzeGame` is an `Operation<void>` that calls `publish` the moment each
ply is decided, and buffers nothing: a queue between it and its consumer
would hold a value that is already available synchronously, since one
engine search stands between consecutive plies. A caller that needs the
whole report collects what arrives. `fensToEvaluate` produces the FEN list
`gradeGame`'s `evals` argument must align with, and `gradeGame` is the
pure whole-game half for a caller that already has every evaluation.
`classifyPly`/`terminalScoreOf` live in `grade-game.ts` and are shared by
both paths, so the per-ply classification exists once.

`POLICY_VERSION` (`policy-version.ts`) is this module's half of an
external cache key: bumped when `classify-move.ts` changes, read only by
cache callers, never by this module itself.

`toWhitePov` is exported for exactly one caller — the web slice's
evaluator adapter, the single place engine scores become domain scores.
Its input type `PovScore` is declared here rather than imported from
infra, so this module owns both halves of its own score vocabulary; it is
structurally the engine's `EngineScore`, so a shape change there fails to
compile at that adapter.

`index.ts` exports: `analyzeGame`, `fensToEvaluate`, `gradeGame`,
`classifyMove`, `scoreToWinChance`, `toWhitePov`, `MOVE_CATEGORIES`,
`POLICY_VERSION`; types `PositionEvaluator`, `PublishPly`, `GradedPly`,
`RawEval`, `PovScore`, `WhitePovScore`, `MoveCategory`, `ClassifyInput`.

Cross-module dependencies: `@velachess/chess` (including `makeUci`, the
one `Move` → UCI encoder, and `sideToMoveOf`) and `effection` for
`Operation`. `@velachess/infra-db` is a dependency of the drift guard in
`tests/analyze-game.test.ts` only — it pins `GradedPly` against
infra-db's own structural mirror, in the direction the package graph
already runs. `@velachess/infra-engine` is a devDependency for the one
test that grades a real game with a real Stockfish process.

Depended on by `apps/web` (reached directly through this module's
`index.ts` — no composition, since the frontend has no composition root
of its own).
