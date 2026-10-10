<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="libs/ui/src/brand/logo/velachess-horizontal-dark-bg.svg">
    <img src="libs/ui/src/brand/logo/velachess-horizontal-light-bg.svg" alt="VelaChess" width="260">
  </picture>
</p>

<h1 align="center">Review your games with Stockfish</h1>

<p align="center">
  VelaChess imports your Chess.com and Lichess games, or a PGN file, and
  grades every move with Stockfish so you can review each game on the board.
</p>

<p align="center">
  <a href="https://app.velachess.com">Try VelaChess</a> ·
  <a href="docs/README.md">Documentation</a> ·
  <a href="docs/how-to/self-host.md">Self-host</a>
</p>

## How it works

```text
Chess.com / Lichess / PGN file
  └─→ Games library → open a game → Stockfish (on demand) → saved review
```

## Quick start

Requires Node.js 24 or later, pnpm via Corepack, and Docker.

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

## License

See the [LICENSE](./LICENSE) file for licensing information.
