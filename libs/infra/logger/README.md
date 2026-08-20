# @velachess/logger

The shared logging package. It centralizes the pino logger used by runtime
processes; application logic, transport concerns, and package-specific logging
policy should stay with their owning package.

## Dependencies

- Internal: none.
- External runtime: pino.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`
- This package has no standalone runtime script.

## Documentation

No dedicated `/docs` page exists for `@velachess/logger` yet.
