# @velachess/logger

The shared logging library. It centralizes the pino logger used by runtime
processes; application logic, transport concerns, and area-specific logging
policy stay with their owner.

## Dependencies

- Internal: none.
- External runtime: pino.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`
- This library has no standalone runtime script.

## Documentation

No dedicated `/docs` page exists for `@velachess/logger` yet.
