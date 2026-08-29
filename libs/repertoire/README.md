# @velachess/repertoire

The repertoire domain library. It builds and indexes opening books, replays
games against prepared lines, measures adherence, extracts repertoire lines,
and ranks repertoire findings; it should not fetch games, persist rows, run
engines, or know HTTP/UI workflows.

## Dependencies

- Internal: `@velachess/chess`; tests use `@velachess/fixtures`.
- External runtime: `@badrap/result` for typed repertoire-building outcomes.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Workspace lint: `pnpm --filter @velachess/repertoire lint`
- Workspace format check: `pnpm --filter @velachess/repertoire fmt:check`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

See [Repertoire module](../../docs/explanation/modules/repertoire.md).
