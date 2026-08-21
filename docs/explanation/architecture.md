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
invokes a slice:

```
HTTP  → apps/server → libs/application/<area>/<slice>
job   → apps/worker → libs/application/<area>/<slice>
```

`libs/` splits in two, plus a small set of justified domain libraries:

```
libs/
  application/      behavior, as vertical slices        (one workspace package)
  infra/            technical mechanisms, one package each
    db/             drizzle client, schema, migrations, shared queries, advisory lock
    queue/          pg-boss behind ports
    stockfish/      the engine session          (package name @velachess/engine)
    observability/  the pino logger             (package name @velachess/logger)
    providers/      chess.com/Lichess clients   (package name @velachess/platforms)
    auth/           Better Auth configuration   (identity mechanism, not behavior)
  chess/            rules, PGN, FEN — shared by many slices AND apps/web
  analysis/         move classification math — shared by process-analysis AND apps/web
  repertoire/       book building and judgment — shared by judge, extract, insights
  scheduler/        the FSRS wrapper
  ui/               the design system (apps/web and apps/site primitives)
  fixtures/, test-utils/   test infrastructure
```

The domain libraries are the audited survivors of the old `packages/*`
layer: each is a stable domain concept used across several slices (and,
for chess and analysis, by the frontend), which is the one justification
this document accepts for shared business code. Anything that turned out
to be single-slice moved into its slice — the old `packages/drill` no longer
exists; its eligibility, selection and seeding rules live in
`drills/seed-exercises/`, its answer grading in `drills/submit-answer/`.

## A slice

```
libs/application/
  accounts/   connect-account/  sync-account/
  games/      list-games/  judge-games/
  analysis/   request-analysis/  process-analysis/  get-analysis/  watch-analysis/
  drills/     seed-exercises/  get-drill-queue/  get-next-drill/  submit-answer/
  repertoires/ extract-repertoire/  list-repertoires/ …
  insights/   get-insights/
  overview/   get-overview/
  deviations/ list-deviations/
  auth/       bootstrap-user/
```

The area directories (`accounts/`, `drills/`, …) are navigation. The
architectural unit is one level down. A slice contains whatever that
behavior needs — a single file for a trivial read, several for a complex
process — and there is **no mandatory internal template**. `get-overview`
is one file holding its own SQL; `process-analysis` is an execution
engine with locking and streaming. That difference is intentional.

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

- `libs/application/perspective.ts` — the "which side is you" rule, used
  by judge-games and extract-repertoire; one rule, two areas.
- Cross-slice calls into `drills/seed-exercises` from judge-games,
  sync-account and process-analysis: seeding is an event-reaction
  behavior with three triggers, kept as one slice rather than three
  copies.
- `sync-account` exposes both the HTTP trigger (`refreshAccount`) and the
  delivery-agnostic core (`processAccountSync`) the worker invokes — one
  behavior, two entry points.
- Multi-consumer queries stay in `libs/infra/db/queries/` (tracked
  accounts, games, deviations, analysis, cards). A query used by exactly
  one slice belongs in the slice — `get-overview`, `list-deviations`,
  `seed-exercises` and `get-next-drill` carry their own.

## Dependency direction, enforced

```
apps/*  →  libs/application  →  libs/infra + domain libs
```

Forbidden, and failing the build via `__tests__/architecture.test.ts`:

- anything under `libs/` importing from `apps/`
- `libs/application` importing `hono` or `pg-boss` (transports belong to
  the apps; the queue is reached through `@velachess/queue/ports`)
- `libs/infra/db` importing application code
- domain logic importing Better Auth (see `__tests__/auth-boundaries.test.ts`)

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
