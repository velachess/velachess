# How to run VelaChess locally

The short version lives in the README. This is everything else: the ways
to run the pieces apart, how `DATABASE_URL`/`REDIS_URL` resolve, the Dev
Container, and the one failure that reliably confuses people.

## The development loop

```bash
cp .env.example .env
pnpm dev:setup   # pnpm install + Postgres on 5434 + Redis on 6380 + migrations
pnpm dev         # site :3001, web :5173, API :3000, worker — all watching
```

`pnpm dev` runs every app's `dev` script through Turborepo. The public
site is independent on `:3001`. The web app
proxies `/api` to the API on `:3000`, so the browser only ever talks to
`:5173`.

Run them apart when you want quieter output, or only need one:

```bash
pnpm dev:web      # Vite on :5173
pnpm dev:site     # Next.js on :3001
pnpm dev:server   # API on :3000
pnpm dev:worker   # queue consumers
```

Postgres and Redis alone, without the apps:

```bash
pnpm infra:dev:up     # Postgres on 5434, Redis on 6380
pnpm infra:dev:down   # stop them
pnpm infra:dev:prune  # stop them and delete the volumes
```

After adding a migration, apply it with `pnpm db:migrate` — see
[add a migration](add-a-migration.md).

## Queue dashboard

```bash
pnpm queue:dashboard   # http://127.0.0.1:3002
```

[`@pg-boss/dashboard`](https://pgboss.io/dashboard) over the same
`DATABASE_URL` the apps read (`.env`, then `.env.local`), bound to
loopback. It is a root dev dependency and never part of an app or image:
queues, job states, attempts, errors and the `sync-dlq` / `analysis-dlq`
copies, with retry, cancel, resume and delete per job. Each dashboard
release pairs with one pg-boss schema version — 1.11.x with pg-boss
12.37.1 — so bump the two together.

Locally the dashboard is mutable, so retries can be exercised. The same
binary serves a later deployment with no code of ours: the dashboard reads
`PGBOSS_DASHBOARD_READ_ONLY=1` (every non-GET answers 403, destructive
controls hidden) and `PGBOSS_DASHBOARD_AUTH_USERNAME` /
`PGBOSS_DASHBOARD_AUTH_PASSWORD` (basic auth, both or neither), and the
script passes the environment through. Read-only plus credentials is the
intended production default; lifting read-only is the controlled step for
a recovery.

To revive a dead-lettered **sync** job, retry the `failed` job in the
`sync` queue: its id is the `sync_jobs` id, and the row (still `retrying`,
or already closed by a poll — then the retry is a no-op) recovers through
the normal delivery. Redriving the `sync-dlq` copy creates a job with a
new id, which the worker cannot resolve to a sync. An **analysis** job
carries its `gameId`, so retry and redrive both work.

## Everything in containers

`docker/docker-compose.yml` is the full stack: Postgres, Redis, a one-shot
`migrate` service, the API and the worker.

```bash
docker compose -f docker/docker-compose.yml up --build
```

The images copy the source in, so **a code change only reaches them
through a rebuild**. That is the difference from `pnpm dev`, and it is the
cause of the confusion below.

### `{"error":"not found"}` from a route you just wrote

That is the global 404, not the route's own — which means a built image is
answering, and the image predates your route. Rebuild, or use `pnpm dev`
for iteration and keep compose for verifying the deployed shape.

## How `DATABASE_URL` and `REDIS_URL` resolve

No script hardcodes either. `dev:server`, `dev:worker`, `db:generate` and
`db:migrate` each load `.env` then `.env.local` from the repository root
(via Node's `--env-file-if-exists`, the later file winning) before running.
Same scripts, same names, on the host or inside the Dev Container — only
the file supplying the value differs:

| Where         | File                                              | `DATABASE_URL`                                               | `REDIS_URL`                 |
| ------------- | ------------------------------------------------- | ------------------------------------------------------------ | --------------------------- |
| Host          | `.env`, copied from `.env.example`                | `...@localhost:5434/...` — the port `infra:dev:up` publishes | `...@localhost:6380` — same |
| Dev Container | `.env.local`, written once by `postCreateCommand` | `...@postgres:5432/...` — the compose service name           | `...@redis:6379` — same     |

`.env.local` is git-ignored and never committed.

**Tests read neither file.** `libs/infra/db/tests/test-db.ts` falls
back to an isolated in-process PGlite per run when `DATABASE_URL` is absent
from the environment, which is what every suite is written against. There
is no PGlite-equivalent fallback for Redis: the suites that need one
(`apps/server/tests/rate-limit.test.ts` and `security.test.ts`'s "rate
limiting" block) gate on `REDIS_URL` with `describe.skipIf` instead and
CI's Redis job sets it; every other suite's rate limiter fails open when
Redis is unreachable, which is also why the Dev Container does not set
either variable container-wide — only the specific scripts above opt into
reading them.

## Dev Container

Open the repository in VS Code and choose "Reopen in Container" to get
Node, pnpm and Postgres wired together with nothing to install:

- `.devcontainer/` builds the tool image
- `docker/docker-compose.dev.yml` starts Postgres and Redis alongside it
- `postCreateCommand` writes `.env.local` and runs the first migration

`pnpm dev`, `pnpm test`, `pnpm check`, `pnpm dev:site`, `pnpm dev:server`
and `pnpm dev:worker` all work unchanged inside it — nothing to prefix.

## Environment variables

`.env.example` is the complete list. The ones that matter on a first run:

- `DATABASE_URL` / `REDIS_URL` — see above
- `VELACHESS_AUTH_SECRET` — signs session tokens; 32+ characters
  (`openssl rand -base64 32`)
- `VELACHESS_BASE_URL` — the origin the browser is on; `:5173` in
  development
- `VELACHESS_BOOTSTRAP_USER_EMAIL` / `_PASSWORD` — the first user, created
  once into an empty database, then ignored

For a real deployment — where those last two have a lifecycle worth
respecting — follow [self-hosting](self-host.md) instead.

## Verifying a change

```bash
pnpm test    # every workspace
pnpm check   # typecheck + lint + knip
```

[Verify a change](verify-a-change.md) explains what "green" actually
requires, which is more than one command.
