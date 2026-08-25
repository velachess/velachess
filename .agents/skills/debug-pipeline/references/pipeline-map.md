# Current pipeline map

Verify these names against live code before acting; this reference is a search
map, not authority over implementation.

```text
account refresh
  apps/server account route or apps/worker account consumer
  -> libs/application/accounts/sync-account
  -> libs/infra/platforms normalization
  -> libs/infra/db game persistence
  -> candidate repertoire extraction
  -> repertoire judgment
  -> exercise seeding from already-known severity

interactive game analysis
  apps/server game analyze route
  -> libs/application/analysis/request-analysis
  -> libs/infra/queue delivery
  -> apps/worker analysis consumer
  -> libs/application/analysis/process-analysis
  -> libs/infra/engine Stockfish session
  -> report + severity transaction
  -> exercise seeding

training
  repertoire deviation or engine-classified ply
  -> exercise source
  -> card
  -> next drill
  -> answer + FSRS reschedule
```

Import and refresh do not run Stockfish. Queue history is delivery evidence;
`game_analyses` is completion truth. The database session advisory lock owns
analysis execution across HTTP/worker callers even when queue delivery is
deduplicated.

Useful starting points:

- `libs/application/accounts/sync-account/`
- `libs/application/games/judge-games/`
- `libs/application/analysis/`
- `libs/application/drills/seed-exercises/`
- `libs/infra/db/queries/status.ts`
- `libs/infra/db/queries/engine-drills.ts`
- `libs/infra/queue/`
- `apps/worker/src/consumers/`
