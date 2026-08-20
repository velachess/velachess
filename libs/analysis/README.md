# @velachess/analysis

The move-analysis domain package. It converts engine evaluations into
per-move classifications and can drive a caller-provided engine session through
a game; it does not persist data, fetch games, own Stockfish processes, or
decide when analysis should run.

## Dependencies

- Internal: `@velachess/chess`, `@velachess/engine`.
- External/runtime: no production runtime dependency beyond those internal
  boundaries; tests use `stockfish`.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Package lint: `pnpm --filter @velachess/analysis lint`
- Package format check: `pnpm --filter @velachess/analysis fmt:check`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

See [Analysis module](../../docs/explanation/modules/analysis.md).
