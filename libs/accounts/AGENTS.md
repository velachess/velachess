# Agent Guide — `libs/accounts`

Extends `../../AGENTS.md`. Owns tracked-account lifecycle: connect, list,
refresh — change together whenever a provider integration changes.

`index.ts` exports: `importAccount`, `listAccounts`, `listGamesWithStatus`,
`processAccountSync`, `refreshAccount`, `secondsUntilRefreshAllowed`,
`syncAccount`, `SYNC_COOLDOWN_SECONDS`; types `ConnectAccountDeps`,
`Platform`, `ListAccountsDeps`, `SyncState`, `TrackedAccountSummary`,
`GameWithStatus`, `ListAccountGamesDeps`, `RefreshOutcome`,
`SyncAccountDeps`, `SyncDeps`, `SyncOutcome`.

Cross-module dependencies: none. Provider HTTP, the database and the queue
are all reached through dependency types the composition root satisfies.

No other business module depends on `@velachess/accounts`.

See root `AGENTS.md`'s "Modules and slices" for the sharing rule: even
`syncAccount` and `importAccount`, both slices here, reach each other only
through a declared dependency and the composition root.
