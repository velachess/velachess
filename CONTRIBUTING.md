# Contributing

## Before you start

Small bugs and docs: open a PR directly. New features or architectural
changes: open an issue first — significant work should be discussed
before implementation.

By opening a pull request you agree that your contribution is licensed
under the **GNU General Public License, version 3 or later**, the same
licence as the rest of the project ([LICENSE](LICENSE)) — inbound matches
outbound, and no separate agreement is needed.

Sign your commits off with `git commit -s`. That adds a `Signed-off-by:`
line, which is you asserting the
[Developer Certificate of Origin](https://developercertificate.org/): that
you wrote the change, or have the right to submit it under this licence.

Please do not paste code from a project under an incompatible licence, and
be careful with generated code whose provenance you cannot vouch for. A
contribution nobody can trace is one we may have to remove later.

## Participation

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). Security
problems go through [SECURITY.md](SECURITY.md), never a public issue.

## Setup

VS Code: "Reopen in Container" gets Node, pnpm and Postgres wired
together with no manual install — see the README's "Dev Container"
section.

Manual setup:

```bash
pnpm install
docker compose -f docker/docker-compose.yml up --build
```

Postgres, migrations, API (`:3000`) and worker come up together.
Migrations run as part of `up` (the one-shot `migrate` service).

The web app runs alongside them:

```bash
pnpm dev          # Vite on :5173, /api proxied to the API on :3000
```

UI components come from the registry into `libs/ui`, never into the
app. Run `pnpm exec shadcn add <component>` from `libs/ui`, review the
generated source, then export it through that package.

Frontend text is translated: declare strings as Lingui messages with the
`msg` macro next to where they're used, and run
`pnpm --filter @velachess/web i18n:extract` after changing copy. The
conventions — domain slices, state ownership, styling rules — are in
[`docs/explanation/apps/web.md`](docs/explanation/apps/web.md) and
[`docs/explanation/modules/ui.md`](docs/explanation/modules/ui.md).

## Repository structure

```
apps/server              HTTP API (Hono) — routes are thin, logic lives below
apps/worker           pg-boss consumers — one-line adapters over use cases
apps/web              TanStack Start SPA — one folder per domain slice
libs/ui           design system — theme, shadcn primitives, chess board
libs/application  use-case orchestration
libs/chess        chess rules, PGN, FEN/EPD
libs/infra/platforms       chess.com / Lichess sync
libs/infra/engine       Stockfish UCI
libs/analysis     move classification, game analysis
libs/repertoire   book building, judgment, extraction
libs/application/drills        exercise rules
libs/scheduler    FSRS spaced repetition
libs/infra/db           Drizzle schema, migrations, queries
libs/infra/queue        pg-boss behind ports
libs/test-utils   shared test harness (test-only)
libs/fixtures     pure test data
docs/                 architecture and module docs (Diátaxis)
```

## Checks

```bash
pnpm test        # turbo, one vitest project per app/package — must pass, no skips
pnpm lint        # oxlint
pnpm typecheck   # tsc --noEmit
pnpm fmt:check   # oxfmt
pnpm knip        # unused files, exports and dependencies
```

Tests run in-process against real migrations (PGlite) and real Stockfish
at shallow depth — no mocks of the database or the engine.

## Commits

Use Conventional Commits: `type(scope): subject`. Scopes are workspace
names plus `agents`, `specs`, `docs`, `ci`, `deps` and `repo`; the exact
list lives in `commitlint.config.mjs`. `LEFTHOOK=0 git commit` bypasses
local hooks when you mean to.

## Pull requests

- One concern per PR. No unrelated refactors.
- Behavior changes come with tests.
- New API routes must be documented in `apps/server/src/openapi.ts` — the
  anti-drift test fails the suite otherwise.
- Contract changes update the matching doc under `docs/explanation/`.

## Pull request evidence

Include enough relevant evidence for reviewers to validate the change
without reproducing the entire flow locally. Keep it proportional to the
PR; do not include evidence that does not apply.

- Frontend/UI: screenshot or screen recording.
- API/server: request/response example, preferably with `curl`.
- Database: proof that the migration applies and a relevant verification.
- Bug fix: before/after evidence, when applicable.
- Worker/infra: relevant logs or command output.
- Changes without visible or runtime behavior: `N/A`.

## Architecture principles

Dependency direction is `apps → application → domain + ports`. Domain
decisions are pure; pg-boss owns delivery/retry/concurrency; workers are
adapters. Full rules and rationale: [AGENTS.md](AGENTS.md) and
[`docs/explanation/`](docs/README.md) — don't duplicate them here.
