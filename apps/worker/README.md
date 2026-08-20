# @velachess/worker

The background worker process for VelaChess. It registers pg-boss consumers and
adapts queue deliveries to `@velachess/application` use cases; retry, delivery,
and dead-letter behavior belong to pg-boss, and domain logic should not live in
consumer handlers.

## Dependencies

- Internal: `@velachess/application`, `@velachess/db`, `@velachess/engine`,
  `@velachess/logger`, `@velachess/queue`.
- External runtime: `postgres` and `stockfish`.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Run locally: `pnpm dev:worker`
- Run the package entrypoint: `pnpm --filter @velachess/worker dev`
- Run with Docker: `docker compose -f docker/docker-compose.yml up --build`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

See [Worker architecture](../../docs/explanation/apps/worker.md).
