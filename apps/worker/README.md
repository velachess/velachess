# @velachess/worker

The background worker process for VelaChess. It registers pg-boss consumers and
adapts queue deliveries to the business modules' use cases (`@velachess/accounts`,
`@velachess/games`, `@velachess/analysis`, …); retry, delivery, and
dead-letter behavior belong to pg-boss, and domain logic should not live in
consumer handlers.

## Dependencies

- Internal: the business modules it consumes (`@velachess/accounts`,
  `@velachess/games`, `@velachess/analysis`, `@velachess/drills`,
  `@velachess/repertoires`), `@velachess/infra-db`, `@velachess/infra-engine`,
  `@velachess/infra-logger`, `@velachess/infra-queue`.
- External runtime: `postgres` and `stockfish`.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Run locally: `pnpm dev:worker`
- Run the package entrypoint: `pnpm --filter @velachess/worker dev`
- Run with Docker: `docker compose -f docker/docker-compose.yml up --build`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

See [Worker architecture](../../docs/explanation/apps/worker.md).
