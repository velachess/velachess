# Agent Guide — `libs/infra/auth`

Extends `../AGENTS.md`, which extends the repository guide. This file only
states what is different or additional for the authentication library.

## Purpose

Owns Better Auth config, session bootstrap, and process-scoped auth
instance construction. Authorization ("may this user touch this game")
lives in the business modules (`libs/accounts`, `libs/games`, …) and
`libs/infra/db`, not here — `.dependency-cruiser.cjs` enforces the
direction. No dedicated
`docs/explanation` page exists; this file is the source for this library's
durable conventions. Verify the live config and its tests before changing a
current Better Auth option.

## Better Auth wiring — non-obvious, don't change without reading the why

- `basePath: "/auth"`, not Better Auth's default `/api/auth` — matches the
  `/api` prefix the browser already sees. Changing it breaks every client
  call without a matching client-side change.
- `disableSignUp: !config.allowSignUp` — password sign-up is closed on
  the mounted instance, always. The first user comes from env-var
  bootstrap via a separate signup-enabled instance never mounted on HTTP
  (`apps/server/src/main.ts`). Public registration exists only through
  Google and the magic link, each an explicit operator choice. Don't flip
  the default.
- `passwordSignIn` maps to `emailAndPassword.enabled` and defaults to on;
  the bootstrap twin never passes it, so provisioning is independent of it.
- `magicLink` adds Better Auth's plugin only when `sendEmail` is present.
  Tokens are stored hashed (`storeToken: "hashed"`), live 5 minutes and
  are consumed on first use; the link is rebuilt under `/api` like the
  verification link. Verifying an unconfirmed account strips its earlier
  accounts and sessions (Better Auth's `revokeUnprovenAccountAccess`).
- `accountLinking.requireLocalEmailVerified: true` is stated, not
  inherited: a Google sign-in must never join an account whose address
  nobody proved. `apps/server/tests/account-linking.test.ts` fails without
  it.
- `session` states Better Auth's defaults (7 days, extended daily, fresh
  for a day) so an upgrade cannot move them silently. No `cookieCache` and
  no `secondaryStorage`: revoking a session must refuse its very next
  request.
- `GET /config` reads `auth.$context` — the resolved options, social
  providers and plugins — so the capability flags cannot drift from what
  this file configured.
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
- Email is optional and arrives as `AuthConfig.sendEmail`. Present, it turns
  on Better Auth's `sendResetPassword` and `sendVerificationEmail`
  (`requireEmailVerification`, `sendOnSignIn`, `revokeSessionsOnPasswordReset`);
  absent, none of those options exist. Links are built here under the `/api`
  proxy, not taken from Better Auth's `url`, whose `/auth` base the browser
  cannot reach. Sends are not awaited: Better Auth awaits the callback, and
  latency would reveal whether an address has an account. The bootstrap twin
  gets no sender.
- `deleteAccount`, when passed, enables `POST /auth/delete-user` and runs as
  `beforeDelete`. It deletes everything itself in one transaction: Better
  Auth's own delete runs sessions, accounts and the user as separate
  statements outside any transaction, and finds nothing left after it.
  Identity proof is Better Auth's (password, or a session younger than
  `freshAge`). The bootstrap twin gets no `deleteAccount`.
