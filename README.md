<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="libs/ui/src/brand/logo/velachess-horizontal-dark-bg.svg">
    <img src="libs/ui/src/brand/logo/velachess-horizontal-light-bg.svg" alt="VelaChess" width="260">
  </picture>
</p>

<h1 align="center">Turn your games into training</h1>

<p align="center">
  VelaChess imports your chess games, builds a repertoire from your play,
  and turns useful positions into spaced-repetition exercises.
</p>

<p align="center">
  <a href="https://app.velachess.com">Try VelaChess</a> ·
  <a href="docs/README.md">Documentation</a> ·
  <a href="docs/how-to/self-host.md">Self-host</a>
</p>

## How it works

```text
Chess.com / Lichess games
  ├─→ Repertoire → decision positions and deviations ───────────────┐
  └─→ Open a game → Stockfish (on demand) → engine-flagged mistakes ┤
                                                                    ↓
                                                                Exercises
                                                                    ↓
                                                                FSRS review
```

## Quick start

Requires Node.js 22 or later, pnpm via Corepack, and Docker.

```bash
cp .env.example .env

pnpm dev:setup
pnpm dev
```

Open <http://localhost:5173>. See [Running locally](docs/how-to/run-locally.md)
for the full development setup or [Self-hosting](docs/how-to/self-host.md) for
deployment.

## Documentation

Start with the [documentation index](docs/README.md), or go directly to:

- [Guided first run](docs/tutorials/build-and-run-locally.md)
- [Architecture and repository layout](docs/explanation/architecture.md)
- [Domain reference](docs/README.md#reference) and
  [API design](docs/explanation/apps/api.md)
- [Self-hosting](docs/how-to/self-host.md)
- [Verifying a change](docs/how-to/verify-a-change.md)

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
conventions, and contribution guidelines.

## Security

Found a vulnerability? Please follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## All Contributors

Thanks to everyone who helps make VelaChess better.

<a href="https://github.com/velachess/velachess/graphs/contributors">
  <img src="https://stg.contrib.rocks/image?repo=velachess/velachess&columns=8" alt="VelaChess contributors">
</a>

## License

See the [LICENSE](./LICENSE) file for licensing information.
