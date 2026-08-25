# Tracked accounts and deduplication

Tracked accounts are user-owned. Their uniqueness is
`(user_id, platform, normalized username)`, so two VelaChess users may track the
same public provider handle without transferring ownership or sharing cursors.

Games preserve the same independence:

- provider identity is unique within a tracked account through
  `(account_id, source, external_id)` when an external id exists;
- movetext deduplication is also account-scoped;
- the same real provider game imported by two independently owned tracked
  accounts produces two owned rows;
- HTTP reads join through `games.account_id -> tracked_accounts.user_id` in the
  query. Do not fetch an unscoped row and authorize afterward.

Provider profile metadata is different: avatar/flair for a public handle is
cached globally by `(platform, username)`. A public profile cache is not
tracked-account ownership and must not carry a user id or sync cursor.

`saveGames` uses conflict-ignore semantics. A lower inserted count is expected
deduplication, not an exception. A second fixture intended to insert distinct
games needs distinct account scope and identity/movetext evidence matching the
case under test.

Confirm current constraints in `libs/infra/db/schema.ts` and persistence in
`libs/infra/db/queries/games.ts`; migrations and constraints are the authority.
