# @velachess/web

The TanStack Start SPA for VelaChess. It owns routes, screens, client-side
state, i18n wiring, and API queries; reusable UI primitives and theme tokens
belong in `@velachess/ui`, while business rules stay in the backend/domain
packages.

## Dependencies

- Internal: `@velachess/ui`, `@velachess/chess`, `@velachess/analysis`, and
  `@velachess/server` for type-only client shape.
- External runtime: React, TanStack Router/Start/Query/Form/Table, Lingui,
  Hono client, Zustand, Zod.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Run locally: `pnpm dev`
- Build: `pnpm build`
- Extract copy after UI text changes: `pnpm --filter @velachess/web i18n:extract`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

See [Web architecture](../../docs/explanation/apps/web.md).
