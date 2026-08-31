# Agent Guide — `libs/accounts`

Extends `../../AGENTS.md`. Owns tracked-account lifecycle: connect, list,
refresh — change together whenever a provider integration changes.

`index.ts` exports: `importAccount`, `listAccounts`, `listGamesWithStatus`,
`processAccountSync`, `refreshAccount`, `secondsUntilRefreshAllowed`,
`syncAccount`, `SYNC_COOLDOWN_SECONDS`; types `ConnectAccountDeps`,
`Platform`, `ListAccountsDeps`, `SyncState`, `TrackedAccountSummary`,
`GameWithStatus`, `ListAccountGamesDeps`, `RefreshOutcome`,
`SyncAccountDeps`, `SyncDeps`, `SyncOutcome`.

Cross-module dependencies (all satisfied at the composition root, never a
direct package import):

- Declares `EnsureCandidateRepertoires`, wired from `repertoires`'
  `ensureCandidateRepertoires`.
- Declares `LandNewGames`, wired from `games`' `landNewGames` — the same
  real handler `games/import-pgn`'s own composition uses.

No other business module depends on `@velachess/accounts`.

See root `AGENTS.md`'s "Modules and slices" for the sharing rule: even
`syncAccount` and `importAccount`, both slices here, reach each other only
through a declared dependency and the composition root.
