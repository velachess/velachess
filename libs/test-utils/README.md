# @velachess/test-utils

The shared test harness library. It provides PGlite database setup, queue
startup, Stockfish sessions, fixture fetchers, and polling helpers for tests;
production code must not import it, and pure fixture data belongs in
`@velachess/fixtures`.

## Dependencies

- Internal: `@velachess/infra-db`, `@velachess/infra-engine`,
  `@velachess/fixtures`, `@velachess/infra-queue`.
- External test/runtime: PGlite, Drizzle ORM, and `stockfish`.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Workspace lint: `pnpm --filter @velachess/test-utils lint`
- Workspace format check: `pnpm --filter @velachess/test-utils fmt:check`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

See [Test utilities module](../../docs/explanation/modules/test-utils.md).
