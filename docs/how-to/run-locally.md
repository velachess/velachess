# How to run VelaChess locally

The short version lives in the README. This is everything else: the ways
to run the pieces apart, how `DATABASE_URL` resolves, the Dev Container,
and the one failure that reliably confuses people.

## The development loop

```bash
cp .env.example .env
pnpm dev:setup   # pnpm install + Postgres on 5434 + migrations
pnpm dev         # web :5173, API :3000, worker — all three, watching
```

`pnpm dev` runs every app's `dev` script through Turborepo. The web app
proxies `/api` to the API on `:3000`, so the browser only ever talks to
`:5173`.

Run them apart when you want quieter output, or only need one:

```bash
pnpm dev:web      # Vite on :5173
pnpm dev:server   # API on :3000
pnpm dev:worker   # queue consumers
```

Postgres alone, without the apps:

```bash
pnpm infra:dev:up     # published on 5434
pnpm infra:dev:down   # stop it
pnpm infra:dev:prune  # stop it and delete the volume
```

After adding a migration, apply it with `pnpm db:migrate` — see
[add a migration](add-a-migration.md).

## Everything in containers

`docker/docker-compose.yml` is the full stack: Postgres, a one-shot
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

## How `DATABASE_URL` resolves

No script hardcodes it. `dev:server`, `dev:worker`, `db:generate` and
`db:migrate` each load `.env` then `.env.local` from the repository root
(via Node's `--env-file-if-exists`, the later file winning) before running.
Same scripts, same names, on the host or inside the Dev Container — only
the file supplying the value differs:

| Where | File | Value |
| --- | --- | --- |
| Host | `.env`, copied from `.env.example` | `...@localhost:5434/...` — the port `infra:dev:up` publishes |
| Dev Container | `.env.local`, written once by `postCreateCommand` | `...@postgres:5432/...` — the compose service name |

`.env.local` is git-ignored and never committed.

**Tests read neither file.** `libs/infra/db/__tests__/test-db.ts` falls
back to an isolated in-process PGlite per run when `DATABASE_URL` is absent
from the environment, which is what every suite is written against. That is
also why the Dev Container does not set it container-wide — only the
specific scripts above opt into reading it.

## Dev Container

Open the repository in VS Code and choose "Reopen in Container" to get
Node, pnpm and Postgres wired together with nothing to install:

- `.devcontainer/` builds the tool image
- `docker/docker-compose.dev.yml` starts Postgres alongside it
- `postCreateCommand` writes `.env.local` and runs the first migration

`pnpm dev`, `pnpm test`, `pnpm check`, `pnpm dev:server` and
`pnpm dev:worker` all work unchanged inside it — nothing to prefix.

## Environment variables

`.env.example` is the complete list. The ones that matter on a first run:

- `DATABASE_URL` — see above
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
