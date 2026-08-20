# How to add a migration

Migrations are generated from the schema, never written by hand, and they
run as a release step — never at boot.

## Steps

**1. Edit the schema.** `libs/infra/db/schema.ts` is the single source.
Add the table or column there, with the constraints you actually mean:
a unique index, a foreign key with its `onDelete`, an enum rather than
free text.

**2. Generate.**

```bash
pnpm db:generate
```

Drizzle writes `libs/infra/db/migrations/NNNN_<name>.sql` and updates
`migrations/meta/`. Both are committed.

**3. Read the generated SQL before committing it.** This is the step
people skip. Drizzle infers intent from a diff, and a rename looks
exactly like a drop plus an add — which silently deletes data. If the
SQL says `DROP COLUMN` and you meant `RENAME`, fix the file by hand.

**4. Apply it locally.**

```bash
pnpm infra:dev:up  # if Postgres isn't running
pnpm db:migrate
```

**5. Write the query beside it.** A migration with no query is a column
nobody reads. Queries live in `libs/infra/db/queries/`, grouped by concern
(`games.ts`, `status.ts`, `drill.ts`, …), not one file per table.

**6. Test it over the real migrations.** The `db` project boots PGlite
and runs every migration before the first assertion, so a test that
passes has exercised your SQL. Add the case to the matching file in
`libs/infra/db/__tests__/`.

## Conventions

- **Name for the change, not the table.** `0006_train.sql`,
  `0008_pgboss.sql` — the file says what became possible.
- **Nullable from day one** for anything a later cycle fills. Columns
  the analysis cycle populates exist as `null` long before it runs.
- **The column stores a fact; the query answers a question.** Do not add
  a column that duplicates something derivable. `perspective` looked
  like a column and turned out to be a derivation from the tracked
  account's username — storing it would have needed a backfill every
  time an account was renamed.
- **No migration runs at boot.** `docker/docker-compose.yml` has a
  one-shot `migrate` service that api and worker wait on.

## After

Run the gates in `docs/how-to/verify-a-change.md`. A schema change that
typechecks can still break a query the compiler cannot see into.
