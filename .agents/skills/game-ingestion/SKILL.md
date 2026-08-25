---
name: game-ingestion
description: Change or debug VelaChess public-game import and account sync across Chess.com, Lichess, PGN normalization, provider cursors, tracked-account ownership, game identity, deduplication, rate limits, profiles, partial failures, and idempotency. Use for provider clients, normalized game storage, sync routes/workers, or ingestion fixtures.
---

# Work on game ingestion

Trace one tracked account from provider input through normalization, cursor
advance, persistence, and user-scoped reads. A public handle identifies provider
data; the authenticated session owns the tracked account.

Read the relevant detail:

- [references/accounts-and-deduplication.md](references/accounts-and-deduplication.md)
  for user ownership, game identity, independent histories, and fixtures.
- [references/providers-and-cursors.md](references/providers-and-cursors.md)
  for current Chess.com/Lichess fetch, cursor, failure, and rate-limit semantics.

Preserve these workflow rules:

- Normalize provider inputs once in `libs/infra/platforms`; do not leak provider
  response shapes into application or UI.
- Save successful games from a partial pass, but advance the cursor and mark the
  account synced only after a complete pass.
- Import and refresh do not run Stockfish. They may extract candidate
  repertoires, judge replay, and seed from severity already persisted.
- Keep sync idempotent through database constraints and provider cursors rather
  than an application-side existence precheck.
- Treat empty success, not-found, rate-limited, invalid response, unsupported
  variant, and partial failure as distinct observable states.

Use `chess-domain` for notation/perspective semantics, `security-review` for
outbound URL/auth/rate-limit changes, and `debug-pipeline` when persisted state
is inconsistent across boundaries.
