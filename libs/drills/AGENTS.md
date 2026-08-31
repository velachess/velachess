# Agent Guide — `libs/drills`

Extends `../../AGENTS.md`. Owns exercise identity, FSRS card state, and
the training queue.

`index.ts` exports: `getNextDrillForUser`, `countDrillQueue`,
`submitAnswer`, `seedsFor`, `triageAndSeed`, `seedRepertoireLines`; types
`GetNextDrillDeps`, `CountDrillQueueDeps`, `SubmitAnswerDeps`,
`TriageOutcome`.

`triageAndSeed`/`seedRepertoireLines` take `Database` directly rather than
a narrow declared-deps interface — composition roots across other modules
wire them with the `Database` they already hold, the same as any infra
query function.

Cross-module dependencies: `seed-exercises` imports `buildRepertoire`
directly from `@velachess/repertoires` and `toEngineCategory` directly
from `@velachess/analysis` — both module-level pure policies, no
composition needed.

Depended on by `accounts`, `games`, `repertoires`, and `analysis`, all
wiring `triageAndSeed`/`seedRepertoireLines` at their own composition
roots.
