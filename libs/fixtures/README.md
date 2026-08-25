# @velachess/fixtures

The shared test-data library. It contains named PGNs, positions, provider
payloads, and scenarios used by tests; behavior, harnesses, mocks, and
production code should not live here.

## Dependencies

- Internal: none.
- External runtime: none.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Workspace lint: `pnpm --filter @velachess/fixtures lint`
- Workspace format check: `pnpm --filter @velachess/fixtures fmt:check`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

See [Fixtures module](../../docs/explanation/modules/fixtures.md).
