# Agent Guide — `apps/worker`

Extends `../../AGENTS.md`. This app is the queue-consumer composition root.

- The handler unpacks a typed job and invokes a business-module slice through
  its `index.ts`. It does not own retry, backoff, heartbeat, deadlines,
  deduplication, polling, dead letters, or settlement: a handler that
  returns completes its job, one that throws fails it.
- A job payload is validated before any domain call, not asserted. `boss.work<T>`
  and a `!` on `job.data` are compile-time claims: the queue carries whatever an
  older deploy, a warm-up send, or a hand-inserted row left there. A payload that
  fails validation throws so pg-boss routes it to retry then the dead-letter
  queue; it never reaches a slice, and it is not spread into a log line first.
  See `docs/explanation/data-boundaries.md`.
- The one thing the worker owns beyond consuming: the scheduled
  reconciliation pass (`sync-reconcile`, every minute and once at startup).
  Nothing consumes the sync dead-letter queue, so a job whose delivery
  pg-boss ended would stay active with nothing running it, and
  `sync_jobs_one_active_per_account` would hold every later sync out of that
  account. The pass closes those rows; it still does not decide "last
  attempt" for a delivery, and the dead letter stays unconsumed so an
  operator keeps the dashboard. Once a row is closed, reviving its delivery
  finds a settled job and resolves without work — recovery is a fresh sync
  request.
- pg-boss topology and delivery policy live in `libs/infra/queue`; behavior
  lives in the business modules under `libs/`.
- The worker owns process lifecycle, dependency construction, consumer
  registration, and graceful shutdown. It does not become a second business
  layer.
- No engine runs here. Analysis executes entirely in the browser (Stockfish
  WASM, `apps/web/src/games/analysis/`) — see PR #155 and
  `docs/reference/analysis.md`. This app registers the `sync` consumer and
  the `sync-reconcile` pass, and nothing else.

## Composition root files

`src/composition/<module>.ts` (currently `accounts`) — the worker's own
composition root, parallel to `apps/server`'s but never shared with it
(`no-cross-app-runtime-imports` forbids one app importing the other's
composition, even for identical-looking adapter code — see
`apps/server/src/composition/accounts.ts` and this app's own
`composition/accounts.ts` for the duplicated-by-design pair). Each file
adapts `main.ts`'s real infra (`db`, the sync queue) and other modules'
`index.ts` capabilities into the narrow dependency shape a handler's
slice declared. The handler in `worker.ts` calls the composed builder,
never constructs a slice's deps inline.

Read `docs/explanation/apps/worker.md` and
`docs/explanation/modules/queue.md` before changing registration or delivery.
Use `debug-pipeline` for a stuck or inconsistent sync job flow.
