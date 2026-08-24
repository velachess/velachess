# libs/infra/db

**[DB] — persists what libs/infra/platforms produces and what
libs/repertoire judges (Postgres + Drizzle).**
Doesn't fetch, doesn't normalize, doesn't judge a move. Doesn't know who's
calling it — a Next.js server action, a future `apps/server`, and a future
MCP server process all import it the same way, no HTTP hop between them.

## Schema

Twelve tables across seven domains — sync (what ingest produces),
identity (public provider metadata for any player), repertoire (what the
user prepares), judgment (how a game compared against that preparation),
analysis (what the engine said), drilling (which mistakes became
exercises and how they were answered), scheduling (when each exercise
comes back). Job delivery is NOT here: since cycle 5 it lives in pg-boss's own `pgboss` schema, owned by `libs/infra/queue`
(migration 0008 dropped `analysis_jobs`, `sync_jobs` and the
`job_status` enum):

```
users ─────────────┬──────────────────────────────┐
  (ownership       │ set null                     │ cascade
   anchor, no      ▼                              ▼
   credentials)  tracked_accounts              repertoires
                   │ set null                    │ cascade        ▲
                   ▼                             ▼                │ owner
                 games                        repertoire_chapters │ chain
                   │ cascade                     │ (pgn text —    │
                   │                             │  tree rebuilt  │
                   │                             │  on read)      │
                   ▼           set null          ▼                │
                 deviations ◄────────────── (repertoire_id,
                   one judgment per              chapter_id nullable;
                   (game, repertoire) —          name snapshots NOT NULL —
                   type: deviation | gap |       history survives
                   book-ended | completed        repertoire deletion)

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

users ── exercises   one per (user, position_key) — dedup enforced by unique
  cascade  │
           ├── exercise_sources ── deviations   provenance, composite pk,
           │     cascade both ways              N deviations → 1 exercise
           └── training_responses   correct + grade (4-value enum from day
                 cascade            one) + response_time_ms (collected, not
                                    yet used by the grade mapping)

exercises ── cards   1:1 (unique exercise_id), indexed on due — the review
  cascade            queue is `due <= now`; "is it due" is derived, never
                     stored. Full CardState persisted (incl. learning_steps /
                     elapsed_days / scheduled_days — dropping any corrupts
                     future intervals)
```

Enums are derived from
`libs/infra/platforms`'s own zod schemas (`gameSourceSchema.options`,
`perspectiveSchema.options`, `resultSchema.options`) rather than retyped by
hand — the day ingest adds a fourth source, this file fails to typecheck
instead of silently drifting out of sync. `platform` is its own smaller
enum (`chess_com | lichess`) since a pasted PGN has no account to sync
from.

`tracked_accounts.username` is stored lowercase — both Chess.com and
Lichess usernames are case-insensitive, and normalizing at the query layer
keeps the unique constraint a plain column pair, which Drizzle can target
with a typed `onConflictDoUpdate` (a case-insensitive expression index
can't be one). `sync_cursor` is `jsonb`, typed `ChessComCursor |
LichessCursor` at compile time only — the two providers' cursors are
structurally different shapes, and this package never reads inside
either one, only stores and returns it opaquely.

`provider_profiles` holds the same kind of key but nobody's ownership:
avatar and flair are public metadata about a _player_, so the table has
no `user_id` — an opponent gets a row because a game was opened against
them, not because anyone tracked them, and two users reviewing games
against the same opponent share one row and one refresh budget. The
columns the connection rows used to carry (migration 0016 moved them
here) were per-connection copies of what is really a per-handle fact,
which is why they could disagree between users tracking the same handle.
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
rating-at-game-time isn't the same thing as current rating.

`raw_pgn` is literal `text`, not a compact per-move encoding. Both En
Croissant (1 byte per move, its rank in the legal-move list) and Lichess
(Huffman-coded move rank against a frequency table drilled on real
Lichess-scale data) encode moves compactly and derive PGN on read — this
package doesn't, deliberately: `libs/infra/platforms` already ships `rawPgn` as
its committed source of truth, and Lichess's approach only works because
it's drilled on data volume this project doesn't have. The upgrade path,
if size or volume ever becomes a _measured_ problem, is En Croissant's
simpler scheme, not Lichess's.

Every foreign key has an explicit `onDelete`, and every FK gets an explicit
index (Drizzle does not auto-index FKs — a join on an unindexed FK column
is a full table scan). The delete policies encode product decisions:

| FK                                       | onDelete | Why                                                                                              |
| ---------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `games.account_id`                       | set null | untracking an account keeps its games                                                            |
| `tracked_accounts.user_id`               | set null | deleting a user keeps sync data                                                                  |
| `repertoires.user_id`                    | cascade  | a repertoire without an owner is meaningless                                                     |
| `repertoire_chapters.repertoire_id`      | cascade  | a chapter without its repertoire is meaningless                                                  |
| `deviations.game_id`                     | cascade  | a judgment without its game is meaningless                                                       |
| `deviations.repertoire_id`, `chapter_id` | set null | judgment history survives repertoire deletion — the name snapshot columns exist exactly for this |

## Repertoire and judgments

`repertoire_chapters.pgn` is the source of truth for the tree — text,
rebuilt on read by `libs/repertoire`'s `buildRepertoire`. Same
tradeoff as `raw_pgn` on games: materialized nodes are the upgrade path if
authored-content scale ever becomes real, not before.

`deviations` stores **one judgment per (game, repertoire)** — not "one
deviation". The enum's fourth value `completed` represents
`DeviationResult.event === null` (the whole game stayed in book); event
columns (`ply`, `position_key`, `played_san`, `expected_sans`) are null
exactly in that case. Without this, "judged and faithful" and "never
judged" would be indistinguishable, and adherence metrics would be
uncomputable. A unique index on `(game_id, repertoire_id)` makes
re-judging an upsert, never a duplicate — matching the current
`findDeviation` contract of at most one event per game.

`game_plies` (nullable — judgments predating the column) records the
judged game's total mainline plies at judgment time; the adherence floor
("too short to count") needs it, and re-parsing PGN at read time would be
the wrong place to get it. `getJudgmentRows` joins judgments with each
game's `result` + `perspective` and translates them into the owner's
win/draw/loss — schema knowledge stays here; the metric math lives in
`libs/repertoire`'s pure `adherenceMetrics`.

`cp_loss` and `engine_category` are nullable columns that ship **before**
the analysis cycle exists — adding them later would mean a retrofit
migration in the middle of the cycle that needs them. `drillable` defaults
false; the drilling cycle decides when it flips.

The dependency direction is enforced by type only:
`queries/deviations.ts` does `import type { DeviationResult }` from
`@velachess/repertoire` (a devDependency — erased at compile time, zero
runtime coupling). `libs/repertoire` never imports this package; the
orchestration layer that reads a chapter's PGN and feeds
`buildRepertoire` lives above both.

## Dedup

Both constraints are scoped to the tracked account, not global: a
partial unique index on `(account_id, source, external_id) WHERE
external_id IS NOT NULL` catches every Chess.com/Lichess re-sync for
free, no hashing, within that account. A table-level unique constraint
on `(account_id, movetext_hash)` with `NULLS NOT DISTINCT` catches a
pasted PGN re-pasted with no linked account — Postgres treats `NULL` as
distinct from itself by default, which would silently defeat this exact
case without that clause. `saveGames` inserts with a bare
`onConflictDoNothing()` (no target), which lets one statement satisfy
both constraints at once, and reads the actual inserted count off what
Postgres returns rather than pre-selecting to check.

Each tracked account owns a complete, independent copy of whatever it
imports. Two accounts (any two users, or the same user twice) tracking
the same real chess.com/Lichess handle each get their own full history
— dedup only ever happens within one account, never across two. This
duplicates storage when that happens, deliberately: simple, correct
isolation over global storage dedup. A `game_accounts` join table is
the upgrade path if duplication ever becomes a measured problem.

## Client

`client.ts` exports one module-scope singleton, created once and held for
the process lifetime — right for a long-lived Node process, which is what
every current and planned consumer is (`apps/web` on the Node.js runtime,
a future `apps/server`, a future MCP server). `schema` is exported
separately so a consumer with a genuinely different runtime profile later
(an edge route, a worker wanting its own tuned pool) can build a second
client from the same table definitions without forking them — no second
client exists yet, because nothing needs one yet.

## Query layer

`queries/*.ts`, one file per domain. Every function takes `db` as an
explicit first parameter rather than importing the singleton internally —
this is what lets a future MCP tool inject its own context, and what lets
a test pass a transaction instead of always hitting the module-scope
client. `listGames` excludes `raw_pgn` and `movetext_hash` from its
projection — a game-list view doesn't need the full PGN text or the
internal dedup key; fetching a single game with its PGN is a different,
not-yet-written query. `judgmentToRow` in `queries/deviations.ts` is
exported separately from `upsertJudgment` so the result→row mapping has
pure unit tests with no database.

## Migrations

`drizzle.config.ts` lives inside this package, not at the monorepo root —
`generate`/`migrate`/`studio` are this package's own scripts, run via
`pnpm --filter @velachess/db <script>`. Migrations are generated and
applied against a real Postgres before being considered done, not just
typechecked.

## Testing

No fake transport or injected fetch here, unlike `libs/infra/engine` or
`libs/infra/platforms` — this package's entire job is real SQL constraints
(partial indexes, `NULLS NOT DISTINCT`, cascades), and a fake would only
prove Drizzle built the SQL string it was told to build. One cheap
assertion checks the `game_source` enum's values against
`gameSourceSchema.options` directly — the test that would have caught a
schema drift bug outright.

Everything else runs against a real Postgres via `__tests__/test-db.ts`:
`DATABASE_URL` when set (the docker-compose instance), PGlite (in-process
Postgres) otherwise — either way the suite applies the real migrations
from `./migrations` first, so the schema under test is the schema that
ships, and no environment skips the suite. `__tests__/repertoire-flow.test.ts`
is the cycle's acceptance test: user → repertoire → chapter PGN → read
back → `buildRepertoire` → `findDeviation` → `upsertJudgment` → read
back, plus every constraint above exercised for real (partial-unique
email, cascade chains, set-null + snapshots, upsert idempotency, all four
judgment types).

## Layout

```
schema.ts                    users, tracked_accounts, games, repertoires,
                             repertoire_chapters, deviations — enums, indexes, inferred types
client.ts                    module-scope singleton + exported schema
queries/
  tracked-accounts.ts        upsertTrackedAccount, getTrackedAccountCursor, updateTrackedAccountCursor
  games.ts                   saveGames, listGames, getGame
  users.ts                   createUser, linkAccountToUser, ensureUser (race-safe get-or-create)
  repertoires.ts             createRepertoire, addChapter, getRepertoireWithChapters, listRepertoiresByUser
  deviations.ts              judgmentToRow, upsertJudgment, listJudgmentsByGame, listJudgmentsByRepertoire
  analysis.ts                saveAnalysis, getAnalysis, applyEngineSignal (queue delivery moved to libs/infra/queue)
  adherence.ts               getJudgmentRows — join + result×perspective translation for adherenceMetrics
  drill.ts                   setDrillable, upsertExercise (merge + provenance), recordResponse,
                             listExercisesByUser, getExerciseWithSources
  scheduler.ts               getCard, getOrCreateCard, saveCard, listDueExercises, listCardsByUser
  status.ts                  listGamesWithStatus (DISTINCT ON: one row per game,
                             deviation-first), listTriageCandidates,
                             listUnjudgedGames (PER REPERTOIRE since cycle 6 —
                             judgments accumulate on (game, repertoire)),
                             listGamesForExtraction, getNewExercise, getOverview
drizzle.config.ts            schema/out paths, dbCredentials from DATABASE_URL
migrations/                  0000 sync · 0001 users · 0002 repertoires · 0003 deviations
                             0004 analysis · 0005 adherence · 0006 drill · 0007 scheduler
                             0008 pgboss — drops the SQL job queues (pg-boss owns delivery)
__tests__/
  test-db.ts                 DATABASE_URL or PGlite — real migrations either way
index.ts                     public surface
```
