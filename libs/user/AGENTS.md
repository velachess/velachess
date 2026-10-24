# Agent Guide — `libs/user`

Extends `../../AGENTS.md`. Owns the VelaChess person: who they are here and
what they look like. Three behaviors today — first-user bootstrap (creating
the first user from env-var credentials), the profile avatar, and account
deletion.

Packaged as `@velachess/user` — distinct from `libs/infra/auth`'s
`@velachess/infra-auth`, which owns the Better Auth mechanism itself, not
these behaviors.

`index.ts` exports: `bootstrapUser`, `bootstrapCredentialsFromEnv`,
`setAvatar`, `removeAvatar`, `readAvatar`, `deleteAccount`,
`AVATAR_MAX_BYTES`; types `BootstrapUserCredentials`, `BootstrapOutcome`,
`BootstrapUserDeps`, `CountUsers`, `SignUpEmail`, `SignUpEmailInput`,
`SignUpEmailResult`, `MarkEmailVerified`, `TryAcquireLock`, `AvatarMediaType`,
`AvatarSource`, `SetAvatarDeps`, `SetAvatarOutcome`, `RemoveAvatarDeps`,
`ReadAvatarDeps`, `StoredAvatar`, `DeleteAccountDeps`.

`deleteAccount` is Better Auth's `user.deleteUser.beforeDelete`, wired
through `AuthConfig.deleteAccount` in the composition root, so identity
proof (password or a fresh session) stays Better Auth's. It removes the
avatar object first and then the user in one transaction; any user may
delete themselves, the only user of an instance included.

Does not own, and must not grow: the Better Auth configuration and session
resolution (`libs/infra/auth`, `apps/server/src/middleware/session.ts`), or
the chess.com/Lichess handles a person tracks (`libs/accounts` — a public
handle is a data source, never identity or proof of ownership).

No dependency on, and no dependent from, any other business module.
`auth-stays-identity-only` in `.dependency-cruiser.cjs` enforces the edge
that matters: `libs/infra/auth` may not import this module back.

This module is deliberately **absent** from
`better-auth-stays-at-auth-boundary`'s hand-enumerated from-list. Do not add
it. Bootstrap exists precisely to go through Better Auth's own sign-up path
rather than a hand-rolled INSERT, so hashing matches verification. What keeps
the boundary honest here is the convention, not the regex: the slice declares
a `SignUpEmail` function type and the composition root
(`apps/server/src/composition/user.ts`) wires `auth.api.signUpEmail` into it,
so no file under `libs/user/` imports `better-auth` or `@velachess/infra-auth`.
