# Pipeline search map

Use this only to find the next boundary. Canonical behavior lives in the linked
normal docs, live code, schema, and tests.

```text
provider fetch -> normalization -> game persistence -> list/open
  -> (browser) Stockfish WASM -> session-only result, never persisted
```

- account sync: `libs/accounts/request-sync` records and enqueues a
  `sync_jobs` row; `libs/accounts/sync-account` (worker) fetches through
  `libs/infra/platforms`, which normalizes; the games are saved with the
  owner's id.
- manual import: `libs/games/import-pgn` parses and normalizes in-request, then
  saves.
- list/open: `libs/games/list-games`, `libs/games/get-game`.
- analysis: opening a game runs `apps/web/src/games/browser-analysis/` against
  `libs/analysis`'s pure `analyzeGame`, entirely client-side. No queue leg,
  no server leg, no persisted row — a failed or stale analysis is a browser
  problem, not a pipeline one.

Import and refresh never run Stockfish.

Useful starting points:

- `libs/accounts/request-sync/`, `libs/accounts/sync-account/`
- `libs/games/`
- `libs/analysis/`, `apps/web/src/games/browser-analysis/`
- `libs/infra/db/queries/status.ts`
- `libs/infra/queue/`
- `apps/worker/src/worker.ts`

Canonical detail:

- `docs/reference/ingestion.md`
- `docs/reference/analysis.md`
