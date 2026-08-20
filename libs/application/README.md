# @velachess/application

The application orchestration layer. It composes database queries, pure domain
packages, engine sessions, schedulers, and queue ports into use cases for the
API and worker; HTTP, pg-boss consumer wiring, SQL schema ownership, and domain
math should not live here.

## Dependencies

- Internal: `@velachess/analysis`, `@velachess/chess`, `@velachess/db`,
  `@velachess/drill`, `@velachess/engine`, `@velachess/platforms`,
  `@velachess/queue`, `@velachess/repertoire`, `@velachess/scheduler`.
- Important boundary: queue usage goes through ports; application code must not
  import pg-boss directly.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`
- Run application flows through the API/worker or the shared test harness; this
  package has no standalone runtime script.

## Documentation

See [Application module](../../docs/explanation/modules/application.md).
