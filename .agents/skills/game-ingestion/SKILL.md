---
name: game-ingestion
description: Change or debug VelaChess public-game import and account sync across Chess.com, Lichess, PGN normalization, provider cursors, tracked-account ownership, game identity, deduplication, rate limits, profiles, partial failures, and idempotency. Use for provider clients, normalized game storage, sync routes/workers, or ingestion fixtures.
---

# Work on game ingestion

Trace one tracked account from provider input through normalization, cursor
advance, persistence, and user-scoped reads. A public handle identifies provider
data; the authenticated session owns the tracked account.

At each boundary, ask whether ownership, identity, completeness, and retry
position remain explicit. Normalize provider shapes once, preserve successful
rows from a partial pass without claiming completion, and rely on database
constraints plus cursors for idempotency rather than prechecking existence.

Canonical provider, cursor, ownership, and deduplication behavior lives in
`docs/reference/ingestion.md`, live provider clients, database constraints, and
their tests. Verify those owners before depending on a current bootstrap window,
cooldown, response shape, or cursor value. Import and refresh do not run
Stockfish.

Use `chess-domain` for notation/perspective semantics, `security-review` for
outbound URL/auth/rate-limit changes, and `debug-pipeline` when persisted state
is inconsistent across boundaries.
