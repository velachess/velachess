# Architecture: vertical slices

The backend is organized as Vertical Slice Architecture as Jimmy Bogard
describes it — <https://www.jimmybogard.com/vertical-slice-architecture/>
is the source of truth for the principles. This page records how those
principles map onto this repository, and where our conventions are ours
rather than his.

## The one rule everything else derives from

> Couple along the axis of change.

The unit of the application is a **request/use case** — RequestAnalysis,
SyncAccount, SubmitAnswer — not a technical layer. Code that changes with
one behavior lives with that behavior. Changing a behavior should touch
its slice, not a stack of global layers.

Two corollaries, stated as the daily test:

- **maximize cohesion inside a slice** — its validation, queries, errors,
  calculations and tests live in its directory;
- **minimize coupling between slices** — a slice does not call another
  slice as a service, and similar-looking code in two slices is not
  automatically extracted.

## The monorepo, three meanings

```
apps/*      how a process runs        (composition roots, deployable)
libs/*      what the system is        (private internal code)
packages/*  what we intentionally publish   (empty until that is a product decision)
```

`apps/server` and `apps/worker` own runtime concerns — HTTP framework,
queue consumers, configuration, dependency construction, lifecycle — and
**no business workflows**. A route or consumer unpacks the transport and
invokes a slice through its module's public surface:

```
HTTP  → apps/server → libs/<module> (index.ts) → <slice>
job   → apps/worker → libs/<module> (index.ts) → <slice>
```

`libs/` splits into flat business modules, technical infra, and a small
set of justified domain libraries. See root `AGENTS.md`'s "Modules and
slices" for the full module → package → path table; the layout:

```
libs/
  accounts/, games/, repertoires/, analysis/, drills/,
  insights/, deviations/, overview/, auth/
                    one package per business module — see root AGENTS.md
  infra/            technical mechanisms, one library each
    db/             drizzle client, schema, migrations, shared queries, advisory lock
    queue/          pg-boss behind ports
    engine/         the Stockfish session       (workspace import @velachess/infra-engine)
    logger/         structured logging          (workspace import @velachess/infra-logger)
    platforms/      chess.com/Lichess clients   (workspace import @velachess/infra-platforms)
    auth/           Better Auth configuration   (identity mechanism, not behavior)
  chess/            rules, PGN, FEN — shared by many modules AND apps/web
  scheduler/        the FSRS wrapper
  ui/               the design system (apps/web and apps/site primitives)
  fixtures/, test-utils/   test infrastructure
```

Each domain library (`chess`, `scheduler`) is a stable concept with no
DB/queue/provider dependency of its own, used across several modules and,
for chess, by the frontend too. A module-level pure policy that only one
module's slices need (e.g. `libs/repertoires/tree.ts`) lives at that
module's root instead of a separate domain library — see the module doc
comments for the current set.

## A slice

```
libs/accounts/     connect-account/  sync-account/  list-accounts/  list-account-games/
libs/games/        list-games/  judge-games/  import-pgn/  get-game/  land-new-games/
libs/analysis/     request-analysis/  process-analysis/  get-analysis/  watch-analysis/
libs/drills/       seed-exercises/  get-next-drill/  submit-answer/  count-drill-queue/
libs/repertoires/  extract-repertoire/  list-repertoires/  add-chapter/ …
libs/insights/     get-insights/
libs/overview/     get-overview/
libs/deviations/   list-deviations/
libs/auth/         bootstrap-user/
```

Each top-level module is its own workspace package (`@velachess/accounts`,
`@velachess/games`, …), with `index.ts` as its only reachable surface —
see root `AGENTS.md`. A slice contains whatever that behavior needs — a
single file for a trivial read, several for a complex process — and there
is **no mandatory internal template**. `get-overview` is one file holding
its own SQL; `process-analysis` is an execution engine with locking and
streaming. That difference is intentional.

Slices start as the simplest thing that works — usually a transaction
script over Drizzle directly. Richer patterns are earned by observed
complexity, never installed in advance.

## What is deliberately absent

- No `controllers/`, `services/`, `repositories/`, `use-cases/` — no
  horizontal layer, and no layered architecture rebuilt inside each area.
- No repository interface per entity, no service class per noun. The two
  questions from Bogard's article replace them: which requests use this,
  and which code changes together?
- No `core/`, `common/`, `shared/`, `utils/` buckets.
- No mediator/command-bus. Commands and queries are separated by being
  different slices (`request-analysis` vs `get-analysis`), not by a
  framework.

## Sharing, and when it is legitimate

Order of preference when code seems shared:

1. **It changes with one request** → it lives in that slice, even if a
   near-copy exists elsewhere. Small duplication between slices is
   cheaper than coupling.
2. **It is a technical mechanism** (a connection, a protocol, a logger)
   → `libs/infra`.
3. **It is a stable domain concept used by several slices** → one of the
   named domain libraries, with the justification written down.
4. **It is intentionally public** → `packages/*`, as a product decision.

Documented exceptions that exist today, each with its reason at the
definition site:

- `libs/chess/perspective.ts` — the "which side is you" rule, used by
  `games/judge-games`, `repertoires/extract-repertoire`, and `insights`;
  one rule, several modules, no DB/queue dependency of its own.
- `games/land-new-games` — the shared post-import/post-sync tail
  (`ensureCandidateRepertoires` → `judgeGamesForUser` → seed) that
  `accounts/sync-account` and `games/import-pgn` both need: a single real
  slice, external to every caller including its own module-mate
  `import-pgn`, wired through each caller's own declared dependency and
  the composition root — never a same-package shortcut. See root
  `AGENTS.md`'s "Modules and slices".
- `sync-account` exposes both the HTTP trigger (`refreshAccount`) and the
  delivery-agnostic core (`processAccountSync`) the worker invokes — one
  behavior, two entry points.
- Multi-consumer queries stay in `libs/infra/db/queries/` (tracked
  accounts, games, deviations, analysis, cards). A query used by exactly
  one slice belongs in the slice — `get-overview`, `list-deviations`,
  `seed-exercises` and `get-next-drill` carry their own.

## Dependency direction, enforced

```
apps/*  →  libs/<module>  →  libs/infra + domain libs
```

A slice never calls another slice's handler directly, same module or
not — it declares its own narrow dependency type and the composition root
wires the real implementation in, sourced from the callee module's
`index.ts`. See root `AGENTS.md`'s "Modules and slices" for the full model.

Forbidden, and failing `pnpm architecture` via `.dependency-cruiser.cjs`:

- anything under `libs/` importing from `apps/`
- a business module importing `hono` or `pg-boss` (transports belong to
  the apps; the queue is reached through `@velachess/infra-queue`'s ports)
- a module deep-importing another module's internals, or a sibling
  slice's handler within its own module (`index.ts` is the only reachable
  surface, inside or outside the module)
- `libs/infra/db` importing business-module code
- domain logic importing Better Auth

Cross-app imports are forbidden except for the web client's type-only
`AppType` contract from `apps/server/src/server.ts`; it preserves Hono's typed
transport without creating a runtime dependency between deployables.

The repository currently runs TypeScript 7, while dependency-cruiser 18's
TypeScript extractor supports versions below 7. `package.json` therefore gives
dependency-cruiser its own TypeScript 6 through pnpm `packageExtensions`; keep
that compatibility dependency until the installed cruiser supports the root
compiler, because type-only boundary checks depend on its extractor.

HTTP-shape validation (zod at the route) stays in `apps/server`: it is
transport translation, and it is what keeps the `hc<AppType>` client
typed end to end. The slice's exported input types are the contract the
route translates into.

## The frontend follows the same idea

`apps/web/src` groups by area (`games/`, `drill/`, `insights/`,
`repertoire/`, `auth/`) with **no global `components/`, `hooks/`,
`utils/` buckets** — that has been the rule here since before this
document. As areas grow, organize within them by user behavior
(`games/import-game/`, `drill/submit-drill-move/`) rather than by
technical kind. Presentation primitives stay in `libs/ui`; the query
client, router and HTTP client stay global as shared technical
infrastructure. Business behavior never migrates into generic helpers.

`apps/site` uses the same vocabulary with a smaller surface: `app/` owns
Next.js routes and composition, `landing/` owns the public marketing
vertical, and `shared/` holds only cross-vertical infrastructure. It
imports no application or chess behavior. Product fixtures stay in
`apps/web`; Playwright captures the real screens; `apps/site/public`
receives only the resulting marketing assets.

## Deciding where code goes

1. What request causes this code to execute?
2. Does it change specifically with that request? → keep it in the slice.
3. Is it a concrete technical capability used across behaviors? → `libs/infra`.
4. Is it intentionally public API? → `packages/*`.
5. Is it shared only because two implementations look similar today? →
   do not extract it.
6. Is an abstraction justified by observed complexity? If not, prefer the
   simpler implementation.

Default: **keep behavior close to the request that owns it.**
