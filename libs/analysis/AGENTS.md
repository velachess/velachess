# Agent Guide — `libs/analysis`

Extends `../../AGENTS.md`. Owns the pure Stockfish analysis algorithm
(`analyzeGame`, the per-ply search/classify loop) and the policies a
result is read through (`score.ts`, `winchance.ts`, `classify-move.ts`,
`move-category.ts`). No persistence, no queue, no HTTP route — analysis
runs entirely in `apps/web/src/games/browser-analysis/` (Stockfish WASM
in a Web Worker), and a browser-computed result lives only in that
session's React Query cache. There is no server/worker analysis path.

`index.ts` exports: `analyzeGame`, `scoreToWinChance`, `MOVE_CATEGORIES`;
types `AnalysisEvent`, `AnalyzeOptions`, `GradedPly`, `MoveCategory`,
`WhitePovScore`.

Cross-module dependencies: depends on `@velachess/chess`. Everything a
caller supplies (an engine session, a transport) arrives through declared
dependency types — `analyzeGame` never constructs one itself.

Depended on by `apps/web` (`analyzeGame`, `scoreToWinChance`,
`MOVE_CATEGORIES`, reached directly through this module's `index.ts` — no
composition, since the frontend has no composition root of its own).
