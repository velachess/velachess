# VelaChess

VelaChess turns your own games into practice. It syncs your chess.com and
Lichess games, derives your opening repertoire from the moves you actually
play, finds where you left those lines, confirms the cost with Stockfish,
and schedules the mistakes that matter as spaced-repetition exercises.

Self-hosted, open source, no account on anyone else's server.

## Overview

```
your games (chess.com / lichess)
      ↓ sync
book extracted from your own play
      ↓ judge (per repertoire)
deviations from your lines
      ↓ Stockfish confirms severity
harmful mistakes → exercises
      ↓ FSRS schedules review
you stop repeating the mistake
```

- **Sync** — chess.com and Lichess accounts, cursor-based, background worker
- **Extract** — your repertoire derived from your games, no manual entry
- **Judge** — every game compared against your book, per repertoire
- **Analyze** — Stockfish per-move classification (win%-based), streamed live over SSE
- **Drill** — harmful deviations become exercises on an FSRS schedule

## Quick start

Requires **Node.js 22+**, **pnpm** (via corepack) and **Docker**.

```bash
cp .env.example .env
pnpm dev:setup   # install, start Postgres, run migrations
pnpm dev         # web on :5173, API on :3000, worker alongside
```

Open `http://localhost:5173`. The first user is created from the
`VELACHESS_BOOTSTRAP_USER_*` values in `.env` on first boot into an empty
database; sign-up is closed by default.

Running the whole stack in containers instead:

```bash
docker compose -f docker/docker-compose.yml up --build
```

More: [running locally](docs/how-to/run-locally.md) for the development
loop and its options, [self-hosting](docs/how-to/self-host.md) for a real
deployment.

## Usage

The web app is the product: connect an account, let the sync and the
worker do their work, then study your repertoire and practise what is due.

The API is a typed HTTP surface underneath it. Two endpoints are public:

```bash
curl localhost:3000/health
curl localhost:3000/openapi.json   # the full API surface
```

Everything else — accounts, games, repertoires, drills — requires a
session cookie, so it is reached through the app or an authenticated
client rather than a bare `curl`.

## Architecture

pnpm monorepo. `apps/server` (Hono) and `apps/worker` (pg-boss consumers)
are thin shells over `libs/application`, which orchestrates pure domain
packages (`chess`, `repertoire`, `analysis`, `scheduler`) and
infrastructure ports (`db` — Drizzle/Postgres, `queue` — pg-boss, `engine`
— Stockfish). One Postgres holds both the domain data and the job queue.
`apps/web` (TanStack Start) talks to the API through a client typed
straight from its `AppType`, with the design system in `libs/ui`.

Deep dives live in [`docs/`](docs/README.md).

## Development

```bash
pnpm test        # vitest, per workspace — real migrations, real Stockfish
pnpm check       # typecheck + lint + knip
pnpm fmt         # oxfmt
```

Tests run in-process against PGlite and a shallow-depth engine: no mocks
of the database or of Stockfish. Details in
[verify a change](docs/how-to/verify-a-change.md).

## Contributing

1. Fork the repository and create a branch
2. Make your change, with tests for behaviour
3. `pnpm test` and `pnpm check` must pass
4. Open a pull request

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, repository structure,
commit conventions and review expectations. Coding agents: see
[AGENTS.md](AGENTS.md).

## Security

Found a vulnerability? Please do not open a public issue — see
[SECURITY.md](SECURITY.md) for how to report it privately.

## License

GPL-3.0-or-later. VelaChess builds on GPL software — notably
[chessops](https://github.com/niklasf/chessops) for the chess rules and
[Stockfish](https://stockfishchess.org/) for analysis.

If you distribute a modified version, it has to stay GPL-compatible and
ship its source. See [LICENSE](LICENSE) for the full terms and
[NOTICE](NOTICE) for third-party attributions.
