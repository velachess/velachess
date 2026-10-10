# libs/infra/db

**[DB] — persists what libs/infra/platforms produces and what libs/analysis
reports (Postgres + Drizzle).**
Doesn't fetch, doesn't normalize, doesn't grade a move. Doesn't know who's
calling it — `apps/server` and `apps/worker` import it directly, no HTTP hop in between.

## Schema

Eleven tables across four domains — identity (who signs in), sync (what
platforms produce), games (what the user reviews), analysis (what the
engine said). Job delivery is NOT here: it lives in pg-boss's own `pgboss`
schema, owned by `libs/infra/queue`.

```
users ─────────────┬──────────────────────────────┐
  (ownership       │ cascade                      │ cascade
   anchor)         ▼                              ▼
              tracked_accounts                  games
                   │ set null                     ▲
                   └──────────────────────────────┘
                     games.account_id (provenance)

users ── sessions         cascade   Better Auth session, one row per browser
users ── auth_accounts    cascade   password hash or external identity link
verifications                       short-lived proofs, keyed by identifier
auth_rate_limits                    Better Auth's rate-limit store, keyed by key
rate_limits                         the API's rate limiter, one row per key
provider_profiles                   avatar + flair per (platform, username),
                                    no owner

games ──── game_analyses   one row per analyzed game (unique game_id):
             cascade        jsonb per-ply report — row existence = analyzed,
                            row = whole-report cache (delivery state lives
                            in pg-boss; this row is the domain truth)

games ──── analysis_progress   a run's graded positions as they land, so a
             cascade            watcher can see work in flight. Committed one
                                at a time and deleted when the report lands —
                                deliberately NOT in the report's transaction,
                                because an uncommitted row cannot be read by
                                the connection streaming it. Scoped by run_id
                                and ordered by a serial, so a crashed attempt's
                                leftovers never blend into its replacement.
```

Enums are derived from
`libs/infra/platforms`'s own zod schemas (`gameSourceSchema.options`,
`perspectiveSchema.options`, `resultSchema.options`) rather than retyped by
hand — the day a fourth source is added, this file fails to typecheck
instead of silently drifting out of sync. `platform` is its own smaller
enum (`chess_com | lichess`) since a pasted PGN has no account to sync
from.

`users` is the ownership anchor, not a chess.com or Lichess account. Better
Auth owns its columns and writes them through its Drizzle adapter; the
primary key stays a `uuid` so `tracked_accounts` and `games` can reference
it. `avatar_source` records who last set `image` (`custom` for an upload,
`none` for a deliberate removal, null when untouched), since `image IS NULL`
alone cannot tell "never had a picture" from "deleted theirs". The
credential table is named `auth_accounts` so "account" keeps one meaning:
a `tracked_accounts` row is a chess.com or Lichess handle.

`tracked_accounts.username` is stored lowercase — both Chess.com and
Lichess usernames are case-insensitive, and normalizing at the query layer
keeps the unique constraint a plain column pair
`(user_id, platform, username)`, which Drizzle can target with a typed
`onConflictDoUpdate` (a case-insensitive expression index can't be one).
`sync_cursor` is `jsonb`, typed `ChessComCursor | LichessCursor` at compile
time only — the two providers' cursors are structurally different shapes,
and this package never reads inside either one, only stores and returns it
opaquely.

`provider_profiles` holds the same kind of key but nobody's ownership:
avatar and flair are public metadata about a _player_, so the table has
no `user_id` — an opponent gets a row because a game was opened against
them, not because anyone tracked them, and two users reviewing games
against the same opponent share one row and one refresh budget.
`fetched_at` is stamped on every attempt, failed ones included: it is a
refresh cursor, not a success log, so a dead provider is retried at the
cadence instead of on every game open.

`games` has no normalized `players`/`events`/`sites` tables. Real-world
comparison (En Croissant's SQLite schema) normalizes those because it
dedupes and searches across a bulk-imported corpus of arbitrary
third-party games at opening-explorer scale — this package's only
dedup/lookup need is on `tracked_accounts`, the app's own users, not every
opponent ever faced. Denormalized `white_name`/`white_rating` columns are
right-sized, not a missing normalization. Rating is still stored per-game
rather than only on an account, for the same reason En Croissant keeps
`WhiteElo`/`BlackElo` on `Games` even though `Players.Elo` exists:
rating-at-game-time isn't the same thing as current rating. Opening
information (`opening_eco`, `opening_name`, `opening_url`) is stored on the
row as the platform reported it.

`raw_pgn` is literal `text`, not a compact per-move encoding. Both En
Croissant (1 byte per move, its rank in the legal-move list) and Lichess
(Huffman-coded move rank against a frequency table built from real
Lichess-scale data) encode moves compactly and derive PGN on read — this
package doesn't, deliberately: `libs/infra/platforms` already ships `rawPgn` as
its committed source of truth, and Lichess's approach only works because
it's built on data volume this project doesn't have. The upgrade path,
if size or volume ever becomes a _measured_ problem, is En Croissant's
simpler scheme, not Lichess's.

`game_analyses.positions` is a `jsonb` array of `StoredGradedPly`, a
structural mirror of `libs/analysis`'s `GradedPly` declared locally so
drizzle-kit's schema loader never touches the chess toolchain and infra
never imports a business module (`no-infra-to-modules`). A test asserts the
two stay assignable in both directions. `analysis_progress` has a unique
index on `(run_id, index)`, so a retried job replaying an index is a no-op,
and an index on `(game_id, seq desc)` for "newest run first" reads.

Every foreign key has an explicit `onDelete`, and every FK gets an explicit
index (Drizzle does not auto-index FKs — a join on an unindexed FK column
is a full table scan). The delete policies encode product decisions:

| FK                          | onDelete | Why                                                                              |
| --------------------------- | -------- | -------------------------------------------------------------------------------- |
| `sessions.user_id`          | cascade  | a session without a user cannot authenticate anyone                              |
| `auth_accounts.user_id`     | cascade  | a credential without a user is meaningless                                       |
| `tracked_accounts.user_id`  | cascade  | a connected handle belongs to one user                                           |
| `games.user_id`             | cascade  | a game without an owner is unreadable — ownership is direct, not inferred        |
| `games.account_id`          | set null | untracking an account keeps its games (provenance only, null for manual imports) |
| `game_analyses.game_id`     | cascade  | a report without its game is meaningless                                         |
| `analysis_progress.game_id` | cascade  | in-flight progress without its game is meaningless                               |

## Ownership

Games hang directly from their user (`games.user_id`, not null) — a manual
PGN import has no account to infer ownership from, so every read scopes on
the column instead of joining through `tracked_accounts`. The account is
provenance: which connected handle produced the row.

## Dedup

External-id dedup stays scoped to the tracked account: a partial unique
index on `(account_id, source, external_id) WHERE external_id IS NOT NULL`
catches every Chess.com/Lichess re-sync for free, no hashing, within that
account — and each account still owns an independent copy of whatever it
imports, so two accounts tracking the same real handle keep both histories.
A table-level unique constraint on `(user_id, account_id, movetext_hash)`
with `NULLS NOT DISTINCT` is the PGN half: `NULL` account ids compare equal
within one user, so re-uploading the same file inserts nothing, while
another user importing it keeps their own row. Postgres treats `NULL` as
distinct from itself by default, which would silently defeat this exact
case without that clause. `saveGames` inserts with a bare
`onConflictDoNothing()` (no target), which lets one statement satisfy
both constraints at once, and reads the actual inserted count off what
Postgres returns rather than pre-selecting to check.

## Client

`client.ts` exports one module-scope singleton, created once and held for
the process lifetime — right for a long-lived Node process, which is what
`apps/server` and `apps/worker` are. `schema` is exported separately so a consumer with a
genuinely different runtime profile later can build a second client from
the same table definitions without forking them.

## Advisory lock

`advisory-lock.ts` provides `sessionAdvisoryLock`, an `ExecutionLock` built
on `pg_try_advisory_lock`. The acquisition is the check — no separate
inspect step, so no TOCTOU — and session locks die with the connection, so
a crashed executor never leaves a stale claim. An in-process set closes the
gap that session locks are reentrant within one session. Analysis execution
takes `analysis:<gameId>`, so one game is analyzed at a time; first-user
bootstrap takes `bootstrap:first-user`.

## Query layer

`queries/*.ts`, one file per domain. Every function takes `db` as an
explicit first parameter rather than importing the singleton internally —
this is what lets a test pass a transaction instead of always hitting the
module-scope client. `listGamesPage` excludes `raw_pgn` and `movetext_hash`
from its projection — a game-list view doesn't need the full PGN text or
the internal dedup key; `getGame` and `getGameForUser` fetch a single game
with its PGN. The seat a game is read from ("which side was you") is
decided in SQL by `perspectiveSql`, so every read that hands a game's
perspective to a caller applies the same rule.

## Migrations

`drizzle.config.ts` lives inside this package, not at the monorepo root —
`db:generate`/`db:migrate`/`studio` are this package's own scripts, run via
`pnpm --filter @velachess/infra-db <script>`. Migrations are numbered
`NNNN_name.sql` files in `migrations/` (`0000` through
`0021_games_and_analysis.sql`) with a `meta/` journal and snapshots.
Migrations are generated and applied against a real Postgres before being
considered done, not just typechecked.

## Testing

No fake transport or injected fetch here, unlike `libs/infra/engine` or
`libs/infra/platforms` — this package's entire job is real SQL constraints
(partial indexes, `NULLS NOT DISTINCT`, cascades), and a fake would only
prove Drizzle built the SQL string it was told to build. One cheap
assertion checks the `game_source` enum's values against
`gameSourceSchema.options` directly — the test that would have caught a
schema drift bug outright.

Everything else runs against a real Postgres via `tests/test-db.ts`:
`DATABASE_URL` when set (the docker-compose instance), PGlite (in-process
Postgres) otherwise — either way the suite applies the real migrations
from `./migrations` first, so the schema under test is the schema that
ships, and no environment skips the suite. The tests cover game dedup and
cascades (`queries.test.ts`), the analysis cache (`analysis-flow.test.ts`),
in-flight progress (`analysis-progress.test.ts`), perspective derivation
(`game-perspective.test.ts`), the game list (`status-flow.test.ts`) and the
API rate limiter (`rate-limit.test.ts`).

## Layout

```
schema.ts                    users, sessions, auth_accounts, verifications,
                             auth_rate_limits, rate_limits, tracked_accounts,
                             provider_profiles, games, game_analyses,
                             analysis_progress — enums, indexes, inferred types
client.ts                    module-scope singleton + exported schema
advisory-lock.ts             sessionAdvisoryLock (pg_try_advisory_lock)
queries/
  tracked-accounts.ts        upsertTrackedAccount, getTrackedAccountCursor, updateTrackedAccountCursor,
                             markTrackedAccountSynced, getTrackedAccount, getTrackedAccountForUser,
                             listTrackedAccountsByUser, findTrackedAccount
  games.ts                   saveGames, listGames, getGame, getGameForUser, listGamesWithStatusForAccount
  status.ts                  listGamesPage — filtered, paged library read
  pagination.ts              withPagination
  perspective.ts             perspectiveSql — which side was you
  users.ts                   countUsers, markEmailVerified, writeAvatarState, createUser, ensureUser
  provider-profiles.ts       isProfileFresh, findProviderProfiles, upsertProviderProfile
  analysis.ts                saveAnalysis, getAnalysis, appendProgress, listProgress, countProgress, clearProgress
  rate-limit.ts              consumeRateLimit
drizzle.config.ts            schema/out paths, dbCredentials from DATABASE_URL
migrations/                  NNNN_name.sql, 0000 … 0021_games_and_analysis.sql
tests/
  test-db.ts                 DATABASE_URL or PGlite — real migrations either way
index.ts                     public surface
```
