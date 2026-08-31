# Agent Guide — `libs/analysis`

Extends `../../AGENTS.md`. Owns the Stockfish job lifecycle end to end:
request (queue or report), process (execute under the advisory lock,
persist), watch (poll progress), get (the composed read a game page
renders).

`index.ts` exports: `getAnalysisReport`, `drillSummaryFor`,
`requestAnalysis`, `requestAnalysisForUser`, `startAnalysisForUser`,
`createWatchers`, `completeAnalysis`, `engineSignalForDeviation`,
`toEngineCategory`, `scoreToWinChance`; types `AnalysisReport`,
`GetAnalysisDeps`, `DrillSummary`, `DrillSummaryDeps`, `AnalysisRequest`,
`GameAnalysisRecord`, `RequestAnalysisDeps`, `WatcherDeps`, `Watchers`,
`WatchSnapshot`, `WatchTerminal`, `AnalyzeDeps`, `GradedPly`,
`EngineCategory`. `tryStartAnalysis` (the TOCTOU/streaming primitive
`completeAnalysis` wraps) stays private — its own contract is tested at
`libs/analysis/tests/execution.test.ts`, not exposed for outside use.

Cross-module dependencies: depends on `@velachess/chess` and
`@velachess/drills` (`process-analysis` declares `SeedDrillsAfterAnalysis`,
wired from drills' `triageAndSeed`; `drill-summary.ts` reads a drills
capability).

Depended on by `games/judge-games` (`engineSignalForDeviation` pure
policy), `drills/seed-exercises` (`toEngineCategory` pure policy), and
`apps/web` (`scoreToWinChance`, reached directly through this module's
`index.ts` — no composition, since the frontend has no composition root
of its own).
