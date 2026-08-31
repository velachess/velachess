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

Read `docs/explanation/apps/worker.md` and
`docs/explanation/modules/queue.md` before changing registration or delivery.
Use `engine-analysis` for Stockfish execution and `debug-pipeline` for a stuck
or inconsistent job flow.
