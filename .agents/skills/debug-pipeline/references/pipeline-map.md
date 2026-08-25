# Pipeline search map

Use this only to find the next boundary. Canonical behavior lives in the linked
normal docs, live code, schema, and tests.

```text
account refresh
  -> libs/application/accounts/sync-account
  -> libs/infra/platforms normalization
  -> game persistence -> repertoire extraction/judgment -> exercise seeding

interactive game analysis
  -> request-analysis -> queue -> worker consumer -> process-analysis
  -> Stockfish -> report/severity transaction -> exercise seeding

training
  repertoire or engine evidence -> exercise source -> exercise/card
  -> next drill -> answer + FSRS reschedule
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

Canonical detail:

- `docs/reference/ingestion.md`
- `docs/reference/analysis.md`
- `docs/reference/repertoire.md`
- `docs/reference/drills.md`
- `docs/explanation/modules/queue.md`
