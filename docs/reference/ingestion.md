# Ingestion

Facts about tracked-account ownership, provider synchronization, normalization,
cursors, and game deduplication as they ship today. Architectural reasoning
lives in `docs/explanation/apps/api.md` and `docs/explanation/modules/db.md`.
Verify volatile provider details against the live clients and tests.

## Sources

Three sources land in one games table:

- **Chess.com / Lichess** — connected accounts (`tracked_accounts`) with
  repeated syncs and provider cursors.
- **PGN** — a manual upload (`POST /games/import`). No account row, no
  cursor, no sync lifecycle; the same file may be uploaded again at any
  time. It never runs the engine.

## Ownership and identity

Chess.com and Lichess handles identify public data; they do not authenticate a
VelaChess user. A tracked account belongs to the authenticated user and is
unique by user, platform, and normalized username. Two users may therefore
track the same public handle with independent cursors and game histories.

Games are owned directly: `games.user_id` is not null and every read scopes on
it. `games.account_id` is provenance only — which connected handle produced
the row — and is null for manually imported PGNs. Disconnecting an account
deletes the games it imported (manual PGNs stay); deleting a user takes them
all.

Provider profile metadata is public cache data keyed by platform and username.
It does not own games, a cursor, or a user identity.

Provider identity is unique by account, source, and external id when one
exists — each account owns a complete, independent copy of whatever it
imports. Movetext deduplication is scoped by `(user_id, account_id)` with
`nullsNotDistinct`, so a re-import by the same user is a no-op while another
user importing the very same PGN keeps their own copy. `saveGames` uses
conflict-ignore semantics, so a lower inserted count is expected deduplication
rather than an application error. Current constraints live in
`libs/infra/db/schema.ts`.

## Sync jobs

A sync runs as a `sync_jobs` row delivered by the pg-boss `sync` queue; the
queue job shares the row's id. Connecting a handle and pressing sync each
create one (`trigger` `connect` or `manual`); an account holds at most one
active job, and a repeat request gets that one. Manual requests rest 60 s
after the account's newest job.

- Status: `queued` → `running` → `succeeded` | `failed`; `running` →
  `retrying` → `running` while pg-boss retries an incomplete pass.
- Errors: `incomplete` (a page, month or game failed — retried by the queue
  policy, `failed` once retries are spent), `internal` (an unexpected throw,
  retried the same way; or a job whose delivery pg-boss ended without the
  worker, closed as `failed` for the next request to replace), `not-found` (the handle is gone at the provider — permanent, no retry;
  the account and its games stay).
- Progress: `gamesFetched` counts normalized games from the pass,
  `gamesInserted` the rows actually inserted; the difference is
  deduplication. `unitsDone` / `unitsTotal` are `null` until sync works in
  units.
- Games, cursor and outcome commit in one transaction, conditional on the
  `started_at` stamp the delivery took when it marked the job running: a
  retry re-stamps, so a delivery pg-boss timed out or handed to a retry, or
  one whose account was deleted, writes nothing. The cursor and
  `lastSyncedAt` advance only on a complete pass; a partial one keeps its
  games and retries from the same cursor.
- The worker never writes a retryable `failed`: pg-boss owns the retry
  schedule and its exhaustion. A job left active after pg-boss ended its
  delivery (retries spent, or a worker crash) is closed as `failed` by the
  next `GET /syncs/:id` or sync request — keeping the error the last pass
  recorded (`incomplete`), `internal` when it left none — so polling never
  follows a job nothing runs.
- Two connects racing for one provider slot create one account: the loser
  answers like a repeat connect (`201` with `syncId: null` for the same
  handle, `409` for a different one).

## Synchronization contract

Provider clients in `libs/infra/platforms/providers` fetch public archives and
normalize them through the shared PGN path. Provider response shapes do not
escape that library.

A pass may persist successfully normalized games even when another page, month,
or game fails. It advances the stored cursor and `lastSyncedAt` only when the
whole pass completes. Retrying from the previous cursor is safe because the
database constraints make persistence idempotent.

Empty success, not found, rate limiting, invalid response, unsupported variant,
and partial failure are distinct outcomes. Unsupported variants are reported;
they are never coerced into standard chess.

Import and refresh fetch and persist. They do not run Stockfish; analysis is
requested separately per game. A PGN import has no fetch half: normalization
happens in the request, per game, resolving the named player's seat against
White/Black so one file may mix colors.

## Provider cursors

Chess.com starts from the provider's archive index, processes archive months
sequentially, and records the last fully processed month position. The initial
bootstrap window is defined by the provider client, not this document.

Lichess requests PGN ordered from its timestamp boundary. A successful empty
response is a complete pass with no new games. The next timestamp derives from
successfully normalized games and is stored only after a complete pass.

Current cursor shapes, bootstrap limits, request headers, cooldowns, and rate
behavior can change. Inspect the provider clients, the sync slices
(`request-sync`, `process-sync`), and their tests before changing or
documenting one of those values.
