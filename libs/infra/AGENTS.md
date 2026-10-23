# Agent Guide — `libs/infra`

Extends `../../AGENTS.md`. Each child library owns one technical mechanism
behind a narrow public surface: database, queue, engine, logger, platforms,
file storage, authentication, or transactional email.

- Infra does not import any business module (`libs/accounts`, `libs/games`, …)
  or any app. Composition roots wire adapters to the narrow types a
  module's slices declared.
- Prefer the native library/platform primitive before wrapping or replacing it.
  A wrapper must express a VelaChess boundary, not hide a dependency.
- Keep local, self-hosted, and hosted deployments on the same conceptual core.
  Environment-specific behavior enters through validated configuration at a
  composition root.
- Do not add a provider abstraction for an imagined future implementation.
  Existing adapters are justified by current deployment or protocol boundaries.
- Database constraints, transactions, queue policies, protocol parsing, and
  auth configuration are mechanical truth. Guidance explains decisions but
  does not replace those guarantees.
- `$type<>()` on a column and `sql<T>` on a projection are compile-time claims,
  never runtime guards. A `jsonb` column whose contents a caller reads inside,
  or a `text` column carrying a closed set with no constraint behind it, is
  `unknown` until something validates it — and the validator belongs to the
  module that owns the concept, not to this package. Infra may not import a
  business module, so where the literal has to be declared here, the drift guard
  runs from the owning module's tests.
- Every `pgEnum` is derived from a zod schema's `.options` and asserted against
  it in `libs/infra/db/tests/schema.test.ts` — a new or changed one adds both,
  or it drifts silently. See `docs/explanation/data-boundaries.md`.

Read the relevant module documentation before changing a mechanism. Use
`security-review` for auth or outbound HTTP, `game-ingestion` for platform
archives, and `engine-analysis` for Stockfish integration.
