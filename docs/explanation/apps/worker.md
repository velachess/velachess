# apps/worker

**One `Worker` class, one pg-boss handler, thin over the business modules
under `libs/`.** The handler composes a slice's deps, calls the slice through
its module's `index.ts`, and lets pg-boss settle the job: a handler that
returns completes it, one that throws fails it, and the queue's policy
decides retry, backoff and dead letter. No domain logic lives here, and no
settlement either.

## Handler

- **sync** → `syncAccount` (`@velachess/accounts`), handed the pg-boss job
  as fetched: its id is the `sync_jobs` id and it carries no payload. The
  slice marks the row running — stamping `started_at` as this attempt's
  claim — pulls what's new, checkpointing each completed Chess.com month,
  then persists the rest of the games and the outcome; every write is
  conditional on that stamp, so a delivery a retry replaced writes nothing.
  Sync jobs are grouped by provider and consumed with `groupConcurrency: 1`,
  one job per provider across every node. An incomplete pass keeps its games and
  throws so pg-boss retries; a handle gone from the provider records
  `failed` and returns, so pg-boss completes the delivery; a job whose row
  is gone (its account was disconnected) returns the same way. Retry
  exhaustion is pg-boss's: the row learns it on the next `GET /syncs/:id`
  or sync request, which closes a job whose delivery is no longer live.
  Sync persists games and never runs Stockfish. The worker never learns
  what follows sync.

No engine runs here. Analysis executes entirely in the browser (Stockfish
WASM, `apps/web/src/games/analysis/`) — see `docs/reference/analysis.md`.

## Lifecycle

`src/main.ts` builds the real deps and hands them to `Worker`.
`worker.start()`: `boss.start()` → `ensureQueues` (idempotent: policies,
retry, DLQs, expiration + heartbeat, send-path warm-up) → the `sync`
`boss.work` registration, awaited, so a handler that cannot register
kills the process instead of logging "consuming" over a dead one.
Once it is registered, `serveLiveness` (`src/liveness.ts`) answers
`GET /health/live` on `WORKER_HEALTH_PORT` (default `3003`). SIGTERM/SIGINT → `worker.stop()` (`boss.stop({ graceful: true })`:
in-flight jobs finish, new fetches stop), then the liveness probe closes,
then exit. Its image recipe lives in `apps/worker/Dockerfile`
(same base recipe as the api's, different command); the global composition
— postgres + api + worker — is `docker/docker-compose.yml`.

## Observability

Every job logs start and failure with its queue and id — injectable `log` in
`WorkerDeps`; console by default, silent in tests. pg-boss's own job table
records the rest (state, output, timings).
There are deliberately NO DLQ handlers: consuming a dead letter completes
it and destroys the operator's options — dead jobs stay queryable in
`pgboss.job` and visible in the pg-boss dashboard (`pnpm queue:dashboard`,
see [run locally](../../how-to/run-locally.md#queue-dashboard)). Reviving a
failed **sync** job is _retried_ (same id, which is the `sync_jobs` id, so
the row recovers on its own); a _redrive_ of the `sync-dlq` copy mints a new
id the slice resolves to nothing. Queue-level `heartbeatSeconds` means a
worker that dies mid-job is detected by the monitor and the job retried,
without handler cooperation (`boss.work` auto-refreshes heartbeats).

## Tests

`tests/worker.test.ts` over the real harness: the background loop (one
sync job → games), the throw-to-retry path for a missing account, and both
sides of the running-is-not-terminal contract (take-over after a vanished
holder; timeout → throw). Polling against real deliveries is deliberate
over pg-boss's test spies — the suites assert observable state, not
delivery internals.
