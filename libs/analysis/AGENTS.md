# Agent Guide — `libs/analysis`

Extends `../../AGENTS.md`. Owns what a chess move was worth: the grading
that turns one evaluation per position into a `GradedPly`
(`grade-game.ts`) and the policies a result is read through (`score.ts`,
`winchance.ts`, `classify-move.ts`, `move-category.ts`). Nothing else —
no persistence, no queue, no HTTP route, no engine session, no cache, and
no sequencing. Analysis runs entirely in `apps/web/src/games/analysis/`
(Stockfish WASM in a Web Worker); there is no server/worker analysis
path.

Every function here is pure and synchronous. The module has no engine
dependency, declared or otherwise: it is handed evaluations and says what
they mean. Which positions get searched, in which order, with which
session, is `apps/web/src/games/analysis/game/analyze.ts`'s — along with
watchdogs, retries and recovering a dead Worker, which are
`@velachess/infra-engine`'s `EngineEvaluator`.

`classifyPly` and `terminalScoreOf` live in `grade-game.ts`, so the
per-ply classification exists exactly once. `classifyPly` is handed the
evaluation before the move and the one after it, and a caller must only
pass completed searches — a provisional score would grade a move against
a depth the engine had not finished.

`POLICY_VERSION` (`policy-version.ts`) is this module's half of an
external cache key: bumped when `classify-move.ts` changes, read only by
cache callers, never by this module itself.

`toWhitePov` is exported for exactly one caller — the web slice's
`analysis/position/stockfish.ts`, the single place engine scores become
domain scores. Its input type `PovScore` is declared in `score.ts` rather
than imported from infra, so this module owns both halves of its own
score vocabulary; it is structurally the engine's `EngineScore`, so a
shape change there fails to compile at that adapter. It is not exported
from `index.ts` — the adapter passes an engine score positionally and
never names the type.

`index.ts` exports: `classifyPly`, `terminalScoreOf`, `classifyMove`,
`scoreToWinChance`, `toWhitePov`, `MOVE_CATEGORIES`, `POLICY_VERSION`;
types `GradedPly`, `PositionEvaluation`, `WhitePovScore`, `MoveCategory`.

Cross-module dependencies: `@velachess/chess`, types only
(`ReplayedMove`, `Outcome`), because the replay handed in already
answered every question about a position, including each move's UCI and
the side that played it. Production dependencies end there — no
`effection`, no engine. `@velachess/infra-engine` and `effection` are
devDependencies for the one test that grades real Stockfish scores
(`tests/real-stockfish.test.ts`), which is what keeps the white-POV
conversion and the classification honest against a real engine.

Depended on by `apps/web` (reached directly through this module's
`index.ts` — no composition, since the frontend has no composition root
of its own).
