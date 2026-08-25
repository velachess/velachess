# Agent Guide — `libs/infra/auth`

Extends `../AGENTS.md`, which extends the repository guide. This file only
states what is different or additional for the authentication library.

## Purpose

Owns Better Auth config, session bootstrap, and process-scoped auth
instance construction. Authorization ("may this user touch this game")
lives in `libs/application`/`libs/infra/db`, not here —
`.dependency-cruiser.cjs` enforces the direction. No dedicated
`docs/explanation` page exists; this file is the source for this library's
durable conventions. Verify the live config and its tests before changing a
current Better Auth option.

## Better Auth wiring — non-obvious, don't change without reading the why

- `basePath: "/auth"`, not Better Auth's default `/api/auth` — matches the
  `/api` prefix the browser already sees. Changing it breaks every client
  call without a matching client-side change.
- `disableSignUp: !config.allowSignUp` — closed by default. A
  network-reachable self-host must not accept signups from anyone who
  finds it; the first user comes from env-var bootstrap via a separate
  signup-enabled instance never mounted on HTTP (`apps/server/src/main.ts`).
  Don't flip the default.
- `generateId: "uuid"` — matches `users.id`'s column type in the Drizzle
  schema. Changing it breaks the schema contract, not just this library.
- `modelName`/`fields` on each model (`users`, `sessions`, `authAccounts`,
  `verifications`) remap Better Auth's own table/column names onto this
  schema's existing ones — Better Auth's defaults don't match `libs/infra/db`'s
  table names.
- `useSecureCookies: config.secureCookies` — must never be hardcoded
  `true`/`false`; it's threaded from the caller so only local dev can pass
  `false`. Never weaken it in a production code path.
- One `Auth` instance per process, built from injected deps
  (`AuthConfig`), never from ambient env reads inside this library — env
  resolution belongs to the composition root (`apps/server`).
