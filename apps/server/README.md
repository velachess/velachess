# @velachess/server

The HTTP API for VelaChess. It owns Hono routes, request validation, response
mapping, OpenAPI publication, and production wiring; domain decisions belong in
`@velachess/application` or lower packages, and no frontend or worker logic
should live here.

## Dependencies

- Internal: `@velachess/application`, `@velachess/db`, `@velachess/queue`,
  `@velachess/logger`, `@velachess/scheduler`, plus narrow chess/engine types.
- External runtime: Hono, `@hono/node-server`, `postgres`, `zod`.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Run locally: `pnpm dev:server`
- Run the package entrypoint: `pnpm --filter @velachess/server dev`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

See [API architecture](../../docs/explanation/apps/api.md).
