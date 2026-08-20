# apps/worker

**pg-boss consumers, thin over `libs/application`.** A consumer
unpacks job data, calls an application service, and lets thrown errors
drive pg-boss's retry → dead-letter path. No domain logic lives here.

## Consumers

Each consumer answers exactly one question — "which use case does this
job trigger?" — and nothing else:

- **sync** → `processAccountSync` (application): pull what's new, insist
  on completeness (partial saves kept, cursor not advanced, delivery
  fails and retries), then judge the owner's games and seed the exercises
  their severities allow. Judging is replay: refreshing an archive of
  hundreds of games costs hundreds of replays, not hundreds of engine
  runs. The worker never learns what follows sync.
- **analysis** → `completeAnalysis` (application): returns only on
  terminal truth (run by us, cached, or game gone) and THROWS when a live
  executor owns the run — pg-boss's retry schedule decides when the
  delivery is attempted again. The advisory lock stays an application
  invariant, not a queue one: pg-boss stately dedup only covers execution
  that flows through pg-boss; the lock also covers HTTP-vs-worker and any
  out-of-queue caller.

## Lifecycle

`index.ts`: `boss.start()` → `ensureQueues` (idempotent: policies,
retry, DLQs, expiration + heartbeat, send-path warm-up) → `await
registerConsumers` — registration is awaited, so a consumer that cannot
register kills the process instead of logging "consuming" over dead
workers. SIGTERM/SIGINT → `boss.stop({ graceful: true })` (in-flight
jobs finish, new fetches stop), then the pinned lock connection drains
(`sql.end`), then exit. Its image recipe lives in `apps/worker/Dockerfile`
(same base recipe as the api's, different command); the global composition
— postgres + api + worker — is `docker/docker-compose.yml`.

## Observability

Every job logs start / done / failed with its id, payload, and duration
(injectable `log` in `WorkerDeps`; console by default, silent in tests).
There are deliberately NO DLQ consumers: consuming a dead letter completes
it and destroys the redrive option — dead jobs stay queryable in
`pgboss.job` and observable operationally. Queue-level
`heartbeatSeconds` means a worker that dies mid-job is detected by the
monitor and the job retried, without handler cooperation (`boss.work`
auto-refreshes heartbeats).

## Tests

`__tests__/worker.test.ts` over the real harness: the background loop (one
sync job → games → judgments, with the engine untouched), a deliberately
enqueued analysis producing a real report, analysis
idempotence on an already-analyzed game, the throw-to-retry path for a
missing account, and both sides of the running-is-not-terminal contract
(take-over after a vanished holder; timeout → throw). Polling against
real deliveries is deliberate over pg-boss's test spies — the suites
assert observable state, not delivery internals.
