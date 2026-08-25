# Ingestion

Facts about tracked-account ownership, provider synchronization, normalization,
cursors, and game deduplication as they ship today. Architectural reasoning
lives in `docs/explanation/apps/api.md` and `docs/explanation/modules/db.md`.
Verify volatile provider details against the live clients and tests.

## Ownership and identity

Chess.com and Lichess handles identify public data; they do not authenticate a
VelaChess user. A tracked account belongs to the authenticated user and is
unique by user, platform, and normalized username. Two users may therefore
track the same public handle with independent cursors and game histories.

Provider profile metadata is public cache data keyed by platform and username.
It does not own games, a cursor, or a user identity.

Games remain scoped to their tracked account. Provider identity is unique by
account, source, and external id when one exists; movetext deduplication is also
account-scoped. `saveGames` uses conflict-ignore semantics, so a lower inserted
count is expected deduplication rather than an application error. Current
constraints live in `libs/infra/db/schema.ts`.

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

Import and refresh fetch, persist, extract candidate repertoires, judge by
replay, and seed from evidence already present. They do not run Stockfish.

## Provider cursors

Chess.com starts from the provider's archive index, processes archive months
sequentially, and records the last fully processed month position. The initial
bootstrap window is defined by the provider client, not this document.

Lichess requests PGN ordered from its timestamp boundary. A successful empty
response is a complete pass with no new games. The next timestamp derives from
successfully normalized games and is stored only after a complete pass.

Current cursor shapes, bootstrap limits, request headers, cooldowns, and rate
behavior can change. Inspect the provider clients, sync application slice, and
their tests before changing or documenting one of those values.
