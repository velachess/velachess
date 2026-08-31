# Agent Guide — `apps/server`

Extends `../../AGENTS.md`. This app is the Hono HTTP composition root and
the only place transport concerns belong.

- Routes validate and translate HTTP, invoke one business-module slice
  (through its module's `index.ts`), and map its outcome. Business
  workflows do not live here.
- HTTP-shape Zod stays in the route so the exported `AppType` client remains
  typed. Error responses follow `apps/server/src/validation.ts`'s `{ error,
details? }` contract.
- Every route must be represented in `src/openapi.ts`; the anti-drift suite in
  `tests/openapi.test.ts` checks both directions.
- Better Auth owns `/auth/*`. Session middleware resolves `userId`; downstream
  routes and slices never infer identity from a chess handle.
- Composition reads environment and constructs dependencies. Libraries receive
  validated injected configuration rather than reading ambient environment.
- Read `docs/explanation/apps/api.md` before changing the HTTP surface, auth
  order, analysis endpoints, or stream behavior.

## Composition root files

`src/composition/<module>.ts` — one file per business module that needs
wiring (currently `accounts`, `analysis`, `auth`, `deviations`, `drills`,
`games`, `insights`, `overview`, `repertoires`). Each exports one
`build<Module>Deps(...)` function per route handler that adapts real infra
(`deps.db`, `deps.analysisQueue`, `deps.scheduler`, ...) and other modules'
`index.ts` capabilities into the exact narrow dependency shape that
module's slice declared — this is the composition root, in the sense
root `AGENTS.md`'s "Modules and slices" section defines it. `server.ts`
calls the builder inline at the route-mount line
(`.route("/overview", overviewRoutes(buildOverviewDeps(deps.db)))`) — a
route file receives only the narrow composed object, never `deps` (the
whole `ApiDeps` bag) itself. Read `src/composition/games.ts` for the
richest example: it composes both `games`' own route handlers and the
cross-module dependencies `accounts`' composition needs from `games`
(`landNewGames`), since a module's composition file is also where a
sibling module sources a capability it depends on.

When a module needs something from another module, its composition
builder imports that module's `index.ts` (never a deep path) and adapts
the real function into the declared type — same rule as any other
consumer, composition root included. Adding a new route or worker
consumer for an already-migrated module means adding to (or creating) its
composition file, not constructing dependencies ad hoc inside the route.

## Route → module usage

`pnpm architecture` blocks a route from reaching `libs/infra` directly
(`routes-no-direct-infra`), from executing chess/scheduler domain behavior
itself (`routes-no-direct-domain-behavior`), and from deep-importing a
business module's internals (`routes-no-module-internals`) — a module's
`index.ts` is the only structurally reachable file, both by package
`exports` and by `tsconfig.json`'s non-wildcard `paths` entry, so there is
no `"./*"` escape hatch to review around.

- A module may deliberately expose more than one entry point (e.g.
  `analysis`'s `getAnalysisReport` alongside `drillSummaryFor`) — a route
  composing both is normal, not a violation.
- If a route needs something not currently exported, that's a module-design
  decision, not a route workaround: the module's `index.ts` grows an
  explicit new export, or the behavior belongs somewhere else entirely. See
  the target module's own `AGENTS.md` and `architecture-review`.

Use `security-review` for auth, CORS, redirects, cookies, authorization, rate
limits, or outbound URLs. Use `architecture-review` when a route needs new
behavior rather than transport translation.
