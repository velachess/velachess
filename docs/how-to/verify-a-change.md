# How to verify a change

Read this first. Every other guide ends here, and "green" in this repo
means more than one command.

## The gates

```bash
pnpm typecheck    # tsc --noEmit at the root
pnpm lint         # oxlint
pnpm architecture # dependency-cruiser boundaries and cycles
pnpm fmt:check    # oxfmt
pnpm knip         # unused files, exports and dependencies
pnpm test         # unit and integration projects
pnpm e2e          # cross-system acceptance flows
pnpm build        # when apps/web or apps/site moved
```

`pnpm check` runs typecheck, lint, architecture and knip together — the fast static
gate. Formatting is its own check because `pnpm fmt` is the fixer and
pre-commit formats staged files automatically.

## Git hooks

`lefthook.yml` at the repository root drives them, and `pnpm install`
installs the hooks through the `prepare` script. Pre-commit formats and
lints what you staged, pre-push typechecks, and commit-msg runs
commitlint. `LEFTHOOK=0 git commit` skips them when you mean to.

**If `lefthook.yml` is missing, the hooks do not exist** and nothing
warns you — `prepare` reports the miss and carries on so that a Docker
build without a `.git` still installs. Check with
`pnpm exec lefthook validate`.

`pnpm test` runs **one Vitest project per app and library**, plus the root
repository checks. The root
`vitest.config.ts` discovers each `vitest.config.ts` under `apps/*` and
`libs/**`, so running one proves nothing about another:

- Every `libs/*` and `libs/infra/*` library, plus `apps/server` and
  `apps/worker`, over PGlite with the real migrations and real Stockfish
  at shallow depth. Slow (about a minute) and worth every second: nothing
  is mocked away.
- **`root`** — `tests/`: repository-owned checks that belong to no workspace.
- **`ui`** — `libs/ui` alone, jsdom + Testing Library, no Lingui
  transform.
- **`web`** — `apps/web` alone, because it compiles Lingui macros and
  needs its own transform.
- **`site`** — `apps/site` alone, with the same Lingui transform and its
  Next.js landing composition.

To run one: `pnpm exec vitest run --project db` (or any unit/integration
project name — `server`, `root`, `web`, `ui`, and so on).

`pnpm e2e` runs only `e2e/*.spec.ts`. These flows compose `apps/server` and
`apps/worker` at the repository root because they belong to neither app.

The `web` project renders screens: Testing Library drives them and MSW
answers the network, so a test there exercises the app's own fetch rather
than a client written to be testable. What to reach for, and what never
to assert on, is `docs/how-to/write-a-test.md`.

## Typecheck the workspace you touched

The root `tsc --noEmit` covers the workspace, but an app or library with its own
`tsconfig.json` can still be wrong in isolation — `apps/web` once
compiled zero files because it inherited an `exclude` that matched
itself, and the root pass said nothing. When you change one app or library:

```bash
cd apps/web && pnpm exec tsc --noEmit
cd apps/site && pnpm exec tsc --noEmit
```

## If you touched copy

Any `msg` string added, changed or removed:

```bash
pnpm --filter @velachess/web i18n:extract
pnpm --filter @velachess/site i18n:extract
```

Commit the `.po` files with the change. A catalogue that drifts from the
source is a translation nobody can finish.

## If you touched the backend

The api and worker images **copy the source in**. A code change does not
reach a running container until you rebuild:

```bash
docker compose -f docker/docker-compose.yml up -d --build api worker
```

The tell that you are talking to a stale container: a route you just
wrote answers `{"error":"not found"}` — the _global_ 404, not the
route's own message.

To avoid rebuilds entirely, run the backend on the host:

```bash
pnpm infra:dev:up  # Postgres alone, on 5434
pnpm db:migrate    # once, and after every new migration
pnpm dev:server    # localhost:3000 — where pnpm dev proxies /api
pnpm dev:worker
```

## What "verified" does not mean

- **Not** "the suite is green". Ask what a test would have to see in
  order to fail. A unit test fed hand-made rows passes happily while the
  pipeline delivers `null` — that is how the games list shipped calling
  every game unfinished.
- **Not** "typecheck passed". Types cannot tell you a column is empty in
  production.
- **Not** "it renders". Layout constraints (`min-h-0`, `shrink-0` on a
  clipping wrapper) fail visually and silently in tests.

## Related

- `docs/how-to/add-a-migration.md`
- `docs/how-to/add-a-package.md`
- `AGENTS.md` — the invariants a reviewer checks by name
