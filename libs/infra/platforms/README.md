# @velachess/platforms

The ingestion package. It fetches or accepts external game sources and
normalizes them into the shape persisted by `@velachess/db`; it should not
store rows, judge repertoires, analyze moves, or own user-facing workflows.

## Dependencies

- Internal: `@velachess/chess`; tests use `@velachess/fixtures`.
- External runtime: Zod for source and normalized-data schemas.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Package lint: `pnpm --filter @velachess/platforms lint`
- Package format check: `pnpm --filter @velachess/platforms fmt:check`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

No dedicated `/docs` page exists for `@velachess/platforms` yet.
