# Agent Guide — `libs/games`

Extends `../../AGENTS.md`. Owns the game record: reading one game for review,
listing the library, and importing a PGN file.

`index.ts` exports: `getGameForReview`, `openLibrary`, `importPgnForUser`;
types `GetGameDeps`, `SeatIdentity`, `Library`, `ListGamesDeps`,
`ImportPgnDeps`, `ImportPgnInput`, `ImportPgnOutcome`.

Cross-module dependencies: none. The database arrives through declared
dependency types satisfied at composition.

No other business module depends on `@velachess/games`.
