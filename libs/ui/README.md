# @velachess/ui

The shared design-system package. It owns theme tokens, shadcn/base-ui
primitives, layout components, icons, charts, and the reusable chess board; app
screens, routes, translated copy, and product-specific workflows belong in
`@velachess/web`.

## Dependencies

- Internal: `@velachess/chess` is used by chess-board types.
- External runtime: React, Base UI, lucide-react, react-chessboard, Recharts,
  Tailwind/shadcn styling utilities, and flag-icons.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`
- Add or update registry components from this package's shadcn setup; do not
  add reusable primitives under `apps/web`.

## Documentation

See [UI module](../../docs/explanation/modules/ui.md).
