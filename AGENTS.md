# VelaChess — Agent Guide

Durable repository-wide guidance for coding agents. Read the nearest nested
`AGENTS.md` when working inside a repository subtree; it owns rules that are always
relevant in that subtree.

## Product

VelaChess imports a player's chess.com and Lichess history, derives a personal
opening repertoire, detects departures from habitual lines, confirms harmful
mistakes with Stockfish, and schedules training with FSRS.

The same core must work in local development, self-hosted installations, and
hosted deployments. Keep domain behavior portable and environment/provider
adapters thin. Do not introduce a mandatory proprietary service or an
abstraction for a hypothetical provider.

## Repository map

```text
apps/server       Hono HTTP composition root
apps/worker       pg-boss consumer composition root
apps/web          TanStack Start product SPA
apps/site         Next.js static public site

libs/accounts     tracked-account lifecycle: connect, list, refresh
libs/games        the game record and replay-against-repertoire behavior
libs/repertoires  the repertoire/chapter aggregate and its adherence stats
libs/analysis     the Stockfish job lifecycle: request, watch, process, get
libs/drills       exercise identity, FSRS card state, the training queue
libs/insights     cross-module reporting aggregates
libs/deviations   the judgment-table read
libs/overview     the dashboard aggregate
libs/auth         user bootstrap (package @velachess/auth)
libs/infra        db, queue, engine, logger, platforms, and auth adapters
libs/chess        chess rules and notation
libs/scheduler    FSRS wrapper
libs/ui           shared design system and chess presentation
libs/fixtures     pure test data
libs/test-utils   shared test harness
```

Backend dependency direction:

```text
apps/server, apps/worker -> libs/<module> -> libs/infra + domain libs
```

Nothing under `libs/` imports from `apps/`. A business module imports ports,
not Hono or pg-boss. Infra does not import a business module. The enforced
boundary and documented exceptions live in `docs/explanation/architecture.md`
and `.dependency-cruiser.cjs`.

A boundary that is structural — which directory may import which — belongs in
`.dependency-cruiser.cjs`. A boundary that is semantic — intent, public vs.
private usage inside a slice, one file legitimately serving two purposes —
belongs in the nearest `AGENTS.md` and is enforced by code review, not a
regex. Do not add a dependency-cruiser rule that approximates a semantic
boundary; a false positive on a legitimate case is worse than an unenforced
rule stated in `AGENTS.md`.

## Modules and slices

The backend is organized as vertical slices grouped into flat business
modules (see `docs/explanation/architecture.md` for the full rationale).
This section is the precise model; when code and this section disagree,
fix whichever is wrong.

- **Slice** — owns one behavior (e.g. `sync-account`, `judge-games`).
  Declares its own narrow dependency function types, in its own
  vocabulary, for everything external: DB reads/writes, queue enqueue,
  provider HTTP, and any other slice's behavior. A slice never imports or
  receives a `Database`, `AnalysisQueue`, `SyncQueue`, `Scheduler`, or
  another slice's handler directly.
- **Module** — a package under `libs/<module>` grouping slices that change
  together (e.g. `games` owns `judge-games`, `import-pgn`,
  `land-new-games`). May hold shared **pure** policies/calculators at the
  module root (no DB/queue/provider dependency of their own — e.g.
  `libs/repertoires/tree.ts`).
- **Module API (`index.ts`)** — what the module offers the rest of the
  system. The only file reachable from outside the module, structurally
  (package `exports`, non-wildcard `tsconfig.json` paths) and by
  dependency-cruiser rule. Not a convenience barrel: an export exists
  there iff a route/worker consumer calls it directly, or composition-root
  wiring needs it.
- **Slice-declared dependency** — the narrow function type a slice writes
  for each external need, named in its own vocabulary rather than
  imported from whatever satisfies it. Duplicating this _type_ across
  every caller is expected and fine; duplicating the real _implementation_
  is not.
- **Composition root** (`apps/server/src/composition/*.ts`,
  `apps/worker/src/composition/*.ts`) — maps DB clients, queue clients,
  provider HTTP clients, and other modules' `index.ts` capabilities onto
  the exact narrow function types slices declared. This is also how one
  slice's need for a _sibling_ slice's behavior gets satisfied, same
  module or not — never a direct import.
- **Dependency rule** — the one distinction that resolves every case:

  | From → to                                | Allowed?                | Mechanism                                                                                                     |
  | ---------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
  | slice A → slice B's handler              | **No**                  | A declares a dependency type; composition wires the real B handler in, whether A and B share a module or not. |
  | slice A → a module-level pure policy     | **Yes**, direct import  | Deterministic, no I/O of its own — no trust boundary to protect, so no ceremony.                              |
  | slice A needs a capability from module B | Via declared dependency | Composition sources the real implementation from B's `index.ts`.                                              |

- **Sharing rule** — a slice never imports a sibling slice's handler
  directly, **same module or not**. The only thing safe to import
  directly, without a Deps type or composition, is a module-root pure
  policy (no DB/queue/provider parameter). A stateful workflow that
  happens to sit next to other slices in the same module (e.g.
  `games/land-new-games`) does not qualify as a pure policy and gets no
  same-package exemption — it is external to every caller, including its
  own module-mates.

### Module → package → path

| Module      | Package                  | Path                |
| ----------- | ------------------------ | ------------------- |
| accounts    | `@velachess/accounts`    | `libs/accounts/`    |
| games       | `@velachess/games`       | `libs/games/`       |
| repertoires | `@velachess/repertoires` | `libs/repertoires/` |
| analysis    | `@velachess/analysis`    | `libs/analysis/`    |
| drills      | `@velachess/drills`      | `libs/drills/`      |
| insights    | `@velachess/insights`    | `libs/insights/`    |
| deviations  | `@velachess/deviations`  | `libs/deviations/`  |
| overview    | `@velachess/overview`    | `libs/overview/`    |
| auth        | `@velachess/auth`        | `libs/auth/`        |

`libs/infra/*`'s six packages are `@velachess/infra-db`,
`@velachess/infra-queue`, `@velachess/infra-engine`,
`@velachess/infra-logger`, `@velachess/infra-platforms`, and
`@velachess/infra-auth` — the `infra-` prefix keeps them visually distinct
from business modules at the import site, including from the business
`@velachess/auth` above.

## Principles

- Prefer explicit code, deletion, and local duplication over speculative
  abstractions. A cohesive function is not a refactor target because it is
  long.
- Before building infrastructure, ask whether the current library or platform
  already owns it. Prefer native Better Auth, Hono, Postgres, Drizzle,
  pg-boss, Turborepo, TanStack, React, chessops, Stockfish, and FSRS
  primitives over local replacements.
- Domain decisions are pure; effects belong at application/infra boundaries.
  Do not duplicate server state or derive the same fact through competing
  expressions.
- Preserve user isolation in every read and write. A public chess handle is a
  data source, not identity or proof of ownership.
- Tests assert observable behavior through the repository's supported seams.
  A fixture is evidence only of fields it actually contains, and a test must
  be capable of failing when the behavior is wrong.
- Everything committed is English: code comments, docs, test names, commit
  messages, and user-facing source copy. Conversations may use any language.
- Comments carry a decision, external constraint, or prevented bug that code
  cannot express. Put maintained reasoning in `docs/` rather than expanding an
  inline explanation into a second specification.

## Critical invariants

- The engine has one product trigger: opening a game. Importing and refreshing
  fetch, persist, judge, and seed; they do not fan Stockfish analysis across an
  archive.
- Judgment plus any requested analysis enqueue commit together. An analysis
  report plus the severity it fills commit together.
- pg-boss owns delivery, retry, backoff, concurrency, heartbeat, and dead
  letters. The database session advisory lock owns analysis execution across
  HTTP and worker callers.
- Derived game perspective, result, and time class use one semantic rule across
  filters, lists, analysis, and training.
- Public and authenticated behavior must remain valid behind local, self-hosted,
  and hosted origins. Never weaken cookies, redirects, authorization, or tenant
  scoping for one deployment mode.

## Commands

```bash
pnpm check       # typecheck + lint + architecture + knip
pnpm architecture # dependency and cycle boundaries
pnpm fmt:check   # formatting gate
pnpm test        # unit and integration projects through Turbo
pnpm e2e         # root cross-system acceptance flows
pnpm build       # deployable apps
```

Read `docs/how-to/verify-a-change.md` before claiming a change is complete and
`docs/how-to/write-a-test.md` before adding tests. Read
`docs/how-to/turborepo.md` before changing task orchestration, caching, filters,
or affected-package behavior.

## Guidance routing

Always-relevant subtree rules belong in the nearest `AGENTS.md`:

- `apps/web/AGENTS.md` — frontend slices, state, i18n, routing, and rendering.
- `apps/site/AGENTS.md` — static public-site boundary.
- `apps/server/AGENTS.md` — HTTP, validation, auth middleware, and OpenAPI.
- `apps/worker/AGENTS.md` — delivery consumer ownership.
- `libs/<module>/AGENTS.md` — one per business module (`accounts`, `games`,
  `repertoires`, `analysis`, `drills`, `insights`, `deviations`, `overview`,
  `auth`) — what it owns, its `index.ts` surface, and its cross-module
  dependency edges.
- `libs/infra/AGENTS.md` — technical adapters and portability.
- `libs/ui/AGENTS.md` — design-system ownership.

Task-dependent procedures live under `.agents/skills/`:

- Architecture, ownership, abstraction, or slice placement:
  `architecture-review`.
- Chess rules or representation: `chess-domain`.
- Import, sync, providers, identity, or deduplication: `game-ingestion`.
- Stockfish, evaluations, classification, or analysis persistence:
  `engine-analysis`.
- Repertoires, deviations, exercises, or FSRS: `repertoire-training`.
- Cross-boundary inconsistent data: `debug-pipeline`.
- Change review: `code-review`, which routes to the relevant domain skills.
- Auth, OAuth, secrets, redirects, authorization, or outbound HTTP:
  `security-review`.
- UI primitives or screen composition: `ui-before-you-build`.
- Creating, restructuring, or retiring agent guidance: `skill-creator`.

Skill and reference content is guidance, not truth over the live system.
Verify paths, APIs, schemas, dependency versions, and provider behavior in the
current code before acting. When a change makes an `AGENTS.md`, skill, or
reference false, redundant, or unnecessary, update or delete it in the same
change. Do not keep `legacy-*`, `deprecated-*`, or compatibility copies without
a current consumer.

## Agent infrastructure

`AGENTS.md` is the standard instruction surface. `.agents/skills` is the
canonical source for reusable skills; vendor directories are symlink adapters
only. See `.agents/README.md` before changing this infrastructure.
