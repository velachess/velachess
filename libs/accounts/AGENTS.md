# Agent Guide — `libs/accounts`

Extends `../../AGENTS.md`. Owns tracked-account lifecycle: connect,
disconnect, list, and sync (request, status, process) — change together
whenever a provider integration changes.

A user tracks at most one handle per provider (`(user_id, platform)` is
unique at the schema level) — `connect-account` enforces it before
`disconnect-account` or the sync slices ever see a row.

Sync never fetches inside a request: `request-sync` and `connect-account`
write a `sync_jobs` row and enqueue it under the row's id in one
transaction; `sync-account` (the worker) takes the pg-boss job as
delivered, stamps the row as its attempt, fetches, then commits games,
cursor and outcome conditional on that stamp. pg-boss settles the
delivery. See `docs/reference/ingestion.md` "Sync jobs".

A settled job is announced on the `sync_job_changed` Postgres channel from
the transaction that settles it (infra-db's `finishSyncJob` / `abandonSyncJob`);
`watch-syncs` turns those signals into the owner's settled syncs for the
API's `GET /syncs/events` stream, resolving every id against the row — the
signal proves nothing and is not durable. See `docs/reference/ingestion.md`.

`index.ts` exports: `importAccount`, `disconnectAccount`, `listAccounts`,
`listGamesWithStatus`, `requestSync`, `getSync`, `watchSyncs`, `syncAccount`;
types `ConnectAccountDeps`, `ConnectOutcome`, `Platform`,
`DisconnectAccountDeps`, `DisconnectOutcome`, `ListAccountsDeps`,
`TrackedAccountSummary`, `GameWithStatus`, `ListAccountGamesDeps`,
`RequestSyncDeps`, `RequestSyncOutcome`, `GetSyncDeps`, `WatchSyncsDeps`,
`SyncSettled`, `SyncAccountDeps`, `SyncDelivery`, `SyncDeps`.

Cross-module dependencies: none. Provider HTTP, the database and the queue
are all reached through dependency types the composition root satisfies.

No other business module depends on `@velachess/accounts`.

See root `AGENTS.md`'s "Modules and slices" for the sharing rule: slices
here reach each other only through a declared dependency and the
composition root.
