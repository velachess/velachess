# @velachess/chess

The chess-rules library. It exposes typed entry points for FEN, PGN, SAN,
legal moves, position replay, and chess vocabulary; it should not evaluate
positions, talk to engines, persist games, or know application workflows.

## Dependencies

- Internal: none at runtime; tests use `@velachess/fixtures`.
- External runtime: `chessops` for chess rules and `@badrap/result` for typed
  parse/validation results.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Workspace lint: `pnpm --filter @velachess/chess lint`
- Workspace format check: `pnpm --filter @velachess/chess fmt:check`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

See [Chess module](../../docs/explanation/modules/chess.md).
