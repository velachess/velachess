# Agent Guide — `libs/infra`

Extends `../../AGENTS.md`. Each child library owns one technical mechanism
behind a narrow public surface: database, queue, engine, logger, platforms, or
authentication.

- Infra does not import `libs/application` or any app. Composition roots wire
  adapters to application ports.
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

Read the relevant module documentation before changing a mechanism. Use
`security-review` for auth or outbound HTTP, `game-ingestion` for platform
archives, and `engine-analysis` for Stockfish integration.
