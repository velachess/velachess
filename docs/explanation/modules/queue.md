# libs/infra/queue

**[QUEUE] — job delivery behind ports (pg-boss + Postgres).**
Owns everything pg-boss: queue creation, send, state reads, the adapter
over pg-boss's own `pgboss.job` table. Nothing else in the codebase
imports pg-boss — `libs/application` sees only the `AnalysisQueue`
and `SyncQueue` ports.

## Why a library, and not part of the worker

Reviewed and kept deliberately. The queue is not worker-private: the api
**produces** (enqueue inside the caller's transaction, plus the state read
behind 202/409 on the interactive routes), the worker **consumes**, and the
test harness starts both against PGlite. Three consumers across two
deployables is a reusable boundary, not organizational tidiness.

Folding it into `apps/worker` would make `apps/server` import worker
internals to send a job — the one dependency the two-process split exists
to prevent. So the line is drawn by responsibility, not by package:

| Lives here (`libs/infra/queue`)           | Lives in `apps/worker`         |
| ----------------------------------------- | ------------------------------ |
| pg-boss client and test client            | handlers (`consumers/`)        |
| topology: names, payloads, `ensureQueues` | registration (`boss.work`)     |
| send + state adapters                     | consumer concurrency           |
| the ports application sees                | runtime bootstrap and shutdown |

Queue _policy_ (retry schedule, expiry, heartbeat, dead-letter) is declared
with the topology rather than with the worker, because the producer creates
these queues too and a policy that depends on which process booted first is
a race. The numbers are documented in `queues.ts` as what they are: the
consumer's constraints, written down where both sides can honour them.

Two architecture tests hold the line — `apps/server` and `apps/worker` may
never import each other (tests included), and `boss.work` may not appear
outside `apps/worker`. An acceptance test that needs both apps lives at
`e2e/`, belonging to neither.

## Why a queue in Postgres

One database is already the system of record; pg-boss adds delivery
(retry, backoff, dead-lettering, dedup) without a second piece of
infrastructure. The same property makes the whole stack testable
in-process: PGlite runs both the domain schema and the `pgboss` schema.

## Two dedup layers, two concerns

- **Delivery** — queues use policy `stately` with the domain id as
  `singletonKey`: at most one queued-or-active job per game/account.
  Double-POSTing a sync is a no-op by construction. Accepted caveat,
  straight from pg-boss's docs: with stately, a failing job whose key
  already has a job in retry state can skip remaining retries and land in
  failed. Acceptable here because delivery state is not domain truth —
  recovery is a fresh enqueue, which stately permits once nothing is
  queued or active.
- **Execution** — owning an analysis run is decided by a session advisory
  lock in `libs/infra/db`, invoked by application rather than by the queue. A job being delivered
  twice (crash-retry) or a user clicking while a worker runs can never
  produce two engine runs.

## Truth split

pg-boss's job state is _delivery_ truth (queued/active/failed). Domain
success lives in `game_analyses` — `getState` deliberately ignores
completed jobs and reports the newest non-completed one, so a re-enqueue
after history is invisible to callers who should be looking at the domain
table instead.

## Transactional enqueue

`enqueue(dbOrTx, id)` accepts a Drizzle database _or transaction_ and
routes pg-boss's insert through it (`fromDrizzle`). Judgment persistence
and analysis enqueue commit or roll back together — no judged-but-never-
analyzed limbo.

`ensureQueues` warms pg-boss's send path per queue (a real send +
immediate delete). Without it, the first send does an own-connection
queue lookup, which deadlocks on single-connection backends (PGlite) when
that send happens inside a caller transaction. Verified empirically;
`getQueue()` alone does not warm that path.

## Layout

```
ports.ts            AnalysisQueue / SyncQueue — what application sees
queues.ts           topology: queue names, job payloads, per-queue
                    delivery policy (stately, retry/backoff, DLQs,
                    expireInSeconds, heartbeatSeconds), ensureQueues
                    and its send-path warm-up
pgboss-adapter.ts   makeAnalysisQueue / makeSyncQueue — send + typed
                    reads of pgboss.job (declared via pgSchema)
client.ts           createBoss (postgres) / createTestBoss (PGlite)
tests/              stately dedup, getState, tx-rollback atomicity,
                    retry → DLQ, first-send-inside-tx regression
index.ts            public surface
```
