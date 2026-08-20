# @velachess/queue

The queue package. It hides pg-boss behind analysis and sync queue ports,
ensures queue policies, and provides send/status adapters; application code
should depend on ports and should not reimplement delivery, retry, backoff, or
dead-letter handling.

## Placement

A library on purpose: the api produces jobs, the worker consumes them, and
the test harness runs both — so this cannot live inside either app without
one importing the other. Handlers, registration and concurrency belong to
`apps/worker` and are kept out by `tests/architecture.test.ts`.

## Dependencies

- Internal: `@velachess/db` for queue adapter transaction integration.
- External runtime: pg-boss and Drizzle ORM; tests may use PGlite.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`
- Run queue behavior through the worker/API or package tests; this package has
  no standalone runtime script.

## Documentation

See [Queue module](../../docs/explanation/modules/queue.md).
