# Agent Guide — `libs/auth`

Extends `../../AGENTS.md`. Owns user bootstrap: creating the first user
from env-var credentials. Packaged as `@velachess/auth` — distinct from
`libs/infra/auth`'s `@velachess/infra-auth`, which owns the Better Auth
mechanism itself, not this behavior.

`index.ts` exports: `bootstrapUser`, `bootstrapCredentialsFromEnv`; types
`BootstrapUserCredentials`, `BootstrapOutcome`, `BootstrapUserDeps`,
`CountUsers`, `SignUpEmail`, `SignUpEmailInput`, `SignUpEmailResult`,
`MarkEmailVerified`, `TryAcquireLock`.

No dependency on, and no dependent from, any other business module —
isolated by the existing `better-auth-stays-at-auth-boundary` rule (only
`libs/infra/auth` may import `better-auth`/`@better-auth`, so this module
never does) and `auth-stays-identity-only` (`libs/infra/auth` may not
import this or any other business module back), both scoped in
`.dependency-cruiser.cjs`.
