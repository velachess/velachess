# @velachess/scheduler

The spaced-repetition scheduler package. It wraps FSRS over plain card state
and exposes review, preview, due-status, and forecast behavior; it should not
know about chess, exercises, database tables, or UI wording.

## Dependencies

- Internal: none.
- External runtime: `ts-fsrs`.

## Usage / Development

Bootstrap from the monorepo root with `pnpm install`.

- Package lint: `pnpm --filter @velachess/scheduler lint`
- Package format check: `pnpm --filter @velachess/scheduler fmt:check`
- Validate from the root: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Documentation

See [Scheduler module](../../docs/explanation/modules/scheduler.md).
