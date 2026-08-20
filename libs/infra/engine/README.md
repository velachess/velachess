# @velachess/engine

The UCI engine package. It parses and builds UCI protocol messages, abstracts
Stockfish transport, and exposes engine sessions; it should not classify moves,
judge repertoires, persist reports, or decide when an engine run starts.

## Dependencies

- Internal: none at runtime; tests use `@velachess/fixtures`.
- External/runtime: transport consumers provide the Stockfish process or worker;
  tests use the `stockfish` package.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Package lint: `pnpm --filter @velachess/engine lint`
- Package format check: `pnpm --filter @velachess/engine fmt:check`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

See [Engine module](../../docs/explanation/modules/engine.md).
