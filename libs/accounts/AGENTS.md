# Agent Guide — `libs/accounts`

Extends `../../AGENTS.md`. Owns tracked-account lifecycle: connect,
disconnect, list, refresh — change together whenever a provider
integration changes.

A user tracks at most one handle per provider (`(user_id, platform)` is
unique at the schema level) — `connect-account` enforces it before
`disconnect-account` or `sync-account` ever see a row.

`index.ts` exports: `importAccount`, `disconnectAccount`, `listAccounts`,
`listGamesWithStatus`, `processAccountSync`, `refreshAccount`,
`secondsUntilRefreshAllowed`, `syncAccount`, `SYNC_COOLDOWN_SECONDS`; types
`ConnectAccountDeps`, `ConnectOutcome`, `Platform`, `DisconnectAccountDeps`,
`DisconnectOutcome`, `ListAccountsDeps`, `SyncState`,
`TrackedAccountSummary`, `GameWithStatus`, `ListAccountGamesDeps`,
`RefreshOutcome`, `SyncAccountDeps`, `SyncDeps`, `SyncOutcome`.

Cross-module dependencies: none. Provider HTTP, the database and the queue
are all reached through dependency types the composition root satisfies.

No other business module depends on `@velachess/accounts`.

See root `AGENTS.md`'s "Modules and slices" for the sharing rule: even
`syncAccount` and `importAccount`, both slices here, reach each other only
through a declared dependency and the composition root.
