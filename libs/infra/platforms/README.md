# @velachess/platforms

The ingestion library. It fetches or accepts external game sources and
normalizes them into the shape persisted by `@velachess/db`; it should not
store rows, judge repertoires, analyze moves, or own user-facing workflows.

## Dependencies

- Internal: `@velachess/chess`; tests use `@velachess/fixtures`.
- External runtime: Zod for source and normalized-data schemas.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Workspace lint: `pnpm --filter @velachess/platforms lint`
- Workspace format check: `pnpm --filter @velachess/platforms fmt:check`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

See [Ingestion](../../../docs/reference/ingestion.md).
