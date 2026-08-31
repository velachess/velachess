# Agent Guide — `apps/worker`

Extends `../../AGENTS.md`. This app is the queue-consumer composition root.

- Consumers unpack a typed job and invoke a business-module slice through its
  `index.ts`. They do not own retry, backoff, heartbeat, deadlines,
  deduplication, polling, or dead letters.
- pg-boss topology and delivery policy live in `libs/infra/queue`; behavior
  lives in the business modules under `libs/`.
- The worker owns process lifecycle, dependency construction, consumer
  registration, and graceful shutdown. It does not become a second business
  layer.
- Analysis execution is protected by the database session advisory lock even
  when pg-boss delivery is deduplicated; the two mechanisms solve different
  problems.

## Composition root files

`src/composition/<module>.ts` (currently `accounts`, `analysis`) — the
worker's own composition root, parallel to `apps/server`'s but never
shared with it (`no-cross-app-runtime-imports` forbids one app importing
the other's composition, even for identical-looking adapter code — see
`apps/server/src/composition/accounts.ts` and this app's own
`composition/accounts.ts` for the duplicated-by-design pair). Each file
adapts `main.ts`'s real infra (`db`, `analysisQueue`, the engine session
factory) and other modules' `index.ts` capabilities into the narrow
dependency shape a consumer's slice declared. `consumers/*.ts` call the
composed builder, never construct a slice's deps inline.

Read `docs/explanation/apps/worker.md` and
`docs/explanation/modules/queue.md` before changing registration or delivery.
Use `engine-analysis` for Stockfish execution and `debug-pipeline` for a stuck
or inconsistent job flow.
