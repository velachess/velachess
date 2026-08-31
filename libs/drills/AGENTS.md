# Agent Guide — `libs/drills`

Extends `../../AGENTS.md`. Owns exercise identity, FSRS card state, and
the training queue.

`index.ts` exports: `getNextDrillForUser`, `countDrillQueue`,
`submitAnswer`, `seedsFor`, `triageAndSeed`, `seedRepertoireLines`; types
`GetNextDrillDeps`, `CountDrillQueueDeps`, `SubmitAnswerDeps`,
`TriageOutcome`.

`triageAndSeed`/`seedRepertoireLines` keep a deliberate, permanent
`Database`-first signature rather than a narrow declared-deps one: six
composition roots across five other modules each wire them directly with
the `Database` they already hold — the same pattern as any other infra
query function, not migration debt.

Cross-module dependencies: `seed-exercises` imports `buildRepertoire`
directly from `@velachess/repertoires` and `toEngineCategory` directly
from `@velachess/analysis` — both module-level pure policies, no
composition needed.

Depended on by `accounts`, `games`, `repertoires`, and `analysis`, all
wiring `triageAndSeed`/`seedRepertoireLines` at their own composition
roots.
