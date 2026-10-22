# @velachess/chess

The chess-rules library. chessops decides the rules; this package exposes
what chessops does not answer, and re-exports what it does unchanged. It
should not evaluate positions, talk to engines, persist games, or know
application workflows.

Three things are its own, and `index.ts` lists the public surface name by
name:

- `replayMainline(game)` — a parsed PGN's mainline played through the rules
  and handed back as plain, serializable data (`ReplayedGame`). This is the
  one interpretation of a game: the review screen and the analysis pass both
  read it, so neither parses the movetext again. `isPlayableGame` /
  `hasPlayableGame` are the one statement of what counts as a game.
- `legalDestinations`, `playMove`, `squaresOfSan`, `squaresOfUci` — what a
  board needs: where a piece may go and whether it would capture there,
  applying a move without mutating the position, and the castling square a
  board draws and an engine speaks rather than chessops'
  king-takes-own-rook.
- `resolveGamePerspective`, `gameOutcomeFor`, `timeClassOf` — not chess
  rules at all. They live here because the server and the browser must
  agree on them and this is the one pure package every module may import;
  each states its rule in its own file.

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
