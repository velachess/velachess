# @velachess/auth

The authentication library. It builds the process-scoped Better Auth instance
(`createAuth`) and resolves its environment (`resolveAuthEnv`); authorization,
tenant scoping, and route mounting stay with `libs/application`, `libs/infra/db`,
and `apps/server`.

## Dependencies

- Internal: `@velachess/db` for the Drizzle adapter and schema.
- External runtime: Better Auth, `@better-auth/drizzle-adapter`, Drizzle ORM,
  and envalid.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Workspace lint: `pnpm --filter @velachess/auth lint`
- Workspace format check: `pnpm --filter @velachess/auth fmt:check`
- Workspace tests: `pnpm --filter @velachess/auth test`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`
- This library has no standalone runtime script; `apps/server` mounts it.

## Documentation

No dedicated `/docs` page exists for `@velachess/auth` yet. The library's
conventions live in [AGENTS.md](AGENTS.md); the HTTP side is in
[API](../../../docs/explanation/apps/api.md).
