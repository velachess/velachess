# `libs/application`

Application owns what VelaChess does. It is one workspace package organized by
vertical slice: each request or system event owns its orchestration, local
queries, decisions at effect boundaries, errors, and tests.

```text
accounts/      connect, list, sync, and list account games
games/         list/open and judge games
analysis/      request, execute, read, and watch analysis
repertoires/   extract, list, read, and add chapters
drills/        seed exercises, select the next drill, submit an answer
overview/      dashboard read model
insights/      user-facing derived insights
deviations/    deviation read model
auth/          bootstrap the first configured user
```

The area directory is navigation. The architectural unit is the slice beneath
it; there is no internal template and no service/repository layer.

## Boundaries

Application knows database and queue port types but not Hono, pg-boss, process
environment, or deployment topology. `apps/server` and `apps/worker` translate
delivery and call slices. Technical mechanisms live in `libs/infra`; pure
chess, analysis, repertoire, and scheduling rules live in their domain
libraries.

Queries used by one behavior stay in that slice. Multi-consumer queries may
live in `libs/infra/db/queries` when the shared ownership is real and documented.
Slices do not call one another except for the allowlisted event-reaction paths
enforced by `__tests__/architecture.test.ts`.

## Account sync and judgment

`accounts/connect-account` creates a user-owned tracked account and performs the
first public archive import. `accounts/sync-account` has an interactive refresh
entry point and a delivery-agnostic worker entry point. Both fetch and persist
through provider/db adapters; cursor and `lastSyncedAt` advance only after a
complete pass.

A complete sync updates candidate repertoires, judges games, and seeds exercises
from evidence already stored. It does not run Stockfish. Judgment is replay
against one repertoire; it remains independent per `(game, repertoire)`.

## Analysis

`analysis/request-analysis` maps persisted report and queue delivery state for
HTTP. `analysis/process-analysis` owns execution: it checks cached completion,
uses the database session advisory lock to establish one owner, drives the
engine, records progress, and persists the result. The queue deduplicates
delivery; the lock deduplicates execution.

An analysis report and the judgment severity it fills commit together. A
watcher observes persisted progress/report state; disconnecting a watcher does
not cancel execution.

## Training

`drills/seed-exercises` turns eligible repertoire or engine evidence into
idempotent exercise sources. `get-next-drill` selects due cards before unseen
exercises. `submit-answer` checks the move, records the response, and delegates
FSRS scheduling to `libs/scheduler`.

Product vocabulary remains distinct: analysis is engine judgment, repertoire
judgment is replay, a drill is the exercise shown to the user, and a review is
one scheduled FSRS event.

## Verification

The package test project uses real migrations and, where required, real
Stockfish at shallow depth. Cross-app behavior belongs in root `__e2e__`; the
architecture rules belong in the root architecture test. See
`docs/how-to/verify-a-change.md`.
