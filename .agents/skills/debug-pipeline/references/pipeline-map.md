# Pipeline search map

Use this only to find the next boundary. Canonical behavior lives in the linked
normal docs, live code, schema, and tests.

```text
provider fetch -> normalization -> game persistence -> list/open
  -> analysis enqueue -> Stockfish -> report transaction -> SSE/read
```

- account refresh: `libs/accounts/sync-account` fetches through
  `libs/infra/platforms`, which normalizes; the games are saved with the
  owner's id.
- manual import: `libs/games/import-pgn` parses and normalizes in-request, then
  saves.
- list/open: `libs/games/list-games`, `libs/games/get-game`.
- analysis: `libs/analysis/request-analysis` enqueues, the worker's analysis
  consumer calls `process-analysis`, which runs Stockfish and commits the report
  to `game_analyses` in one transaction. `watch-analysis` and `get-analysis`
  read persisted state, including `analysis_progress`, for SSE and plain reads.

Import and refresh do not run Stockfish. Queue history is delivery evidence;
`game_analyses` is completion truth. The database session advisory lock owns
analysis execution across HTTP/worker callers even when queue delivery is
deduplicated.

Useful starting points:

- `libs/accounts/sync-account/`
- `libs/games/`
- `libs/analysis/`
- `libs/infra/db/queries/status.ts`
- `libs/infra/queue/`
- `apps/worker/src/consumers/`

Canonical detail:

- `docs/reference/ingestion.md`
- `docs/reference/analysis.md`
- `docs/explanation/modules/queue.md`
