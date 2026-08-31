# Agent Guide — `libs/games`

Extends `../../AGENTS.md`. Owns the game record and the "replay against
repertoire" behavior, including `land-new-games` — the shared post-import
tail every source of new games runs.

`index.ts` exports: `getGameForReview`, `openLibrary`, `importPgnForUser`,
`judgeGamesForUser`, `landNewGames`; types `GetGameDeps`, `SeatIdentity`,
`Library`, `ListGamesDeps`, `ImportPgnDeps`, `ImportPgnInput`,
`ImportPgnOutcome`, `JudgeGamesDeps`, `JudgeOptions`, `JudgeOutcome`,
`LandNewGamesDeps`, `LandNewGamesOutcome`.

Cross-module dependencies:

- `judge-games`/`land-new-games` import `buildRepertoire`/`judgmentType`
  directly from `@velachess/repertoires` — module-level pure policies, no
  composition needed.
- `judge-games` imports `engineSignalForDeviation` directly from
  `@velachess/analysis` — same reason.
- `land-new-games` declares `EnsureCandidateRepertoires` and
  `SeedDrillsFromJudgments`, wired at composition from `repertoires` and
  `drills` respectively. It is external to every caller, including its own
  module-mate `import-pgn` — see root `AGENTS.md`'s sharing rule.

Depended on by `accounts` (`LandNewGames`, wired from this module's
`landNewGames`) and `analysis` (test-only, fixture setup).
