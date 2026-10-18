# @velachess/infra-engine

The UCI engine library, exposed in the workspace as `@velachess/infra-engine`. It
parses and builds UCI protocol messages, abstracts Stockfish transport, exposes
engine sessions, and owns evaluation reliability — search watchdog, grace
period, and retry on a fresh session. It should not classify moves, persist
reports, or decide when an engine run starts.

Asynchronous lifecycle is Effection: sessions and transports are resources, so
leaving the scope that opened one quits the engine and releases it.

## Dependencies

- Internal: none at runtime; tests use `@velachess/fixtures`.
- External/runtime: `effection`. Transport consumers provide the Stockfish
  process or worker; tests use the `stockfish` package.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Workspace lint: `pnpm --filter @velachess/infra-engine lint`
- Workspace format check: `pnpm --filter @velachess/infra-engine fmt:check`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

See [Engine module](../../../docs/explanation/modules/engine.md).
