# @velachess/application

The application orchestration library. It composes database queries, pure domain
libraries, engine sessions, schedulers, and queue ports into use cases for the
server and worker; HTTP, pg-boss consumer wiring, SQL schema ownership, and domain
math should not live here.

## Dependencies

- Internal: `@velachess/analysis`, `@velachess/chess`, `@velachess/db`,
  `@velachess/engine`, `@velachess/platforms`, `@velachess/queue`,
  `@velachess/repertoire`, `@velachess/scheduler`, and `@velachess/auth`.
- Important boundary: queue usage goes through ports; application code must not
  import pg-boss directly.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`
- Run application flows through the server/worker or shared test harness; this
  library has no standalone runtime script.

## Documentation

See [Application module](../../docs/explanation/modules/application.md).
