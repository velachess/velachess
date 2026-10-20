# libs/infra/queue

**[QUEUE] — job delivery behind ports (pg-boss + Postgres).**
Owns everything pg-boss: queue creation, send, state reads, the adapter
over pg-boss's own `pgboss.job` table. Nothing else in the codebase
imports pg-boss — a business-module slice sees only the `SyncQueue`
port, and even that only via its own composition root,
never a slice-held field (`module-no-queue-object`). `sync` is the only
topology today; analysis runs entirely in the browser and has no queue
leg (`docs/reference/analysis.md`).

## Why a library, and not part of the worker

Reviewed and kept deliberately. The queue is not worker-private: the api
**produces** (enqueue inside the caller's transaction, plus the state read
behind 202/409 on the interactive routes), the worker **consumes**, and the
test harness starts both against PGlite. Two consumers across two
deployables is a reusable boundary, not organizational tidiness.

Folding it into `apps/worker` would make `apps/server` import worker
internals to send a job — the one dependency the two-process split exists
to prevent. So the line is drawn by responsibility, not by package:

| Lives here (`libs/infra/queue`)           | Lives in `apps/worker`         |
| ----------------------------------------- | ------------------------------ |
| pg-boss client and test client            | handlers (`worker.ts`)         |
| topology: names, payloads, `ensureQueues` | registration (`boss.work`)     |
| send + state adapters                     | consumer concurrency           |
| the ports application sees                | runtime bootstrap and shutdown |

Queue _policy_ (retry schedule, expiry, heartbeat, dead-letter) is declared
with the topology rather than with the worker, because the producer creates
these queues too and a policy that depends on which process booted first is
a race. The numbers are documented in `queues.ts` as what they are: the
consumer's constraints, written down where both sides can honour them.
`createQueue` ignores a queue that already exists, so `ensureQueues` also
re-applies every option except the policy (fixed at creation) with
`updateQueue`: a changed number reaches existing deployments on the next boot.

Two architecture tests hold the line — `apps/server` and `apps/worker` may
never import each other (tests included), and `boss.work` may not appear
outside `apps/worker`. An acceptance test that needs both apps lives at
`e2e/`, belonging to neither.

## Why a queue in Postgres

One database is already the system of record; pg-boss adds delivery
(retry, backoff, dead-lettering, dedup) without a second piece of
infrastructure. The same property makes the whole stack testable
in-process: PGlite runs both the domain schema and the `pgboss` schema.

## Delivery dedup

Queues use policy `stately` with the domain id as `singletonKey`: at most
one queued-or-active job per account. A sync job is sent under its
`sync_jobs` id, inside the transaction that writes that row, and the send
throws when pg-boss accepts nothing — the row and its delivery commit
together or not at all. `isLive` reads whether pg-boss may still deliver a
job; its terminal states never change, so a sync request or a status read
can safely close a job whose delivery ended without the worker. The worker
settles nothing: a handler that returns completes its job, one that throws
fails it. The sync slice fences its own writes to the attempt instead —
`sync_jobs.started_at` is stamped by the delivery that marks the job
running, and every later write of that attempt is conditional on the
stamp, so a delivery a retry replaced writes nothing. Not
`work({ transactional: true })`: pg-boss opens that transaction before the
handler, so it would wrap the provider fetch, the handler's `tx` is
pg-boss's own `IDatabase` rather than a drizzle transaction, a throw would
roll back the partial pass and its `retrying` status, and `fromPglite`
implements no `beginTransaction`, so the test harness could not register
such a worker at all. Accepted caveat,
straight from pg-boss's docs: with stately, a failing job whose key
already has a job in retry state can skip remaining retries and land in
failed. Acceptable here because delivery state is not domain truth —
recovery is a fresh enqueue, which stately permits once nothing is
queued or active, or an operator's retry of the failed job from the
dashboard (`pnpm queue:dashboard`; a sync job must be retried, not
redriven, because its id is the `sync_jobs` id).

## Truth split

pg-boss's job state is _delivery_ truth (queued/active/failed). Domain
truth is the `sync_jobs` row itself (`status`, `started_at`, `error`) —
`isLive` only answers whether pg-boss may still attempt a delivery, never
whether the sync succeeded.

## Transactional enqueue

`enqueue(dbOrTx, id)` accepts a Drizzle database _or transaction_ and
routes pg-boss's insert through it (`fromDrizzle`). An enqueue made inside a
caller's transaction commits or rolls back together with that
transaction's other writes.

`ensureQueues` warms pg-boss's send path per queue (a real send +
immediate delete). Without it, the first send does an own-connection
queue lookup, which deadlocks on single-connection backends (PGlite) when
that send happens inside a caller transaction. Verified empirically;
`getQueue()` alone does not warm that path.

## Layout

```
ports.ts            SyncQueue — what application sees
queues.ts           topology: queue names, per-queue delivery policy
                    (stately, retry/backoff, DLQ, expireInSeconds,
                    heartbeatSeconds), ensureQueues and its send-path
                    warm-up
pgboss-adapter.ts   makeSyncQueue — send + typed reads of pgboss.job
                    (declared via pgSchema)
client.ts           createBoss (postgres) / createTestBoss (PGlite)
tests/              stately dedup, isLive, tx-rollback atomicity,
                    retry → DLQ, first-send-inside-tx regression
index.ts            public surface
```
