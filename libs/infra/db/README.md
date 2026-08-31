# @velachess/infra-db

The persistence library. It owns Drizzle schema, migrations, and database
queries for normalized game data and derived domain state; fetching,
normalizing, chess rules, application orchestration, and HTTP contracts belong
outside this library.

## Dependencies

- Internal: `@velachess/infra-platforms` for source schemas; dev/test coverage also
  exercises `@velachess/analysis`, `@velachess/chess`, `@velachess/infra-engine`,
  `@velachess/repertoires`, and `@velachess/scheduler`.
- External runtime: Drizzle ORM and `postgres`; migrations use `drizzle-kit`.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Generate migrations: `pnpm db:generate` (or `pnpm --filter @velachess/infra-db db:generate`)
- Run migrations: `pnpm db:migrate` (or `pnpm --filter @velachess/infra-db db:migrate`)
- Open Drizzle Studio: `pnpm --filter @velachess/infra-db studio`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

See [Database module](../../../docs/explanation/modules/db.md).
