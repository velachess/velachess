# VelaChess — Agent Guide

Persistent repository context for coding agents. `CLAUDE.md` is a symlink
to this file.

## Start here

1. This file — invariants and conventions, all of it.
2. `docs/how-to/verify-a-change.md` — what "done" means, and what a green
   suite does not prove.
3. `openspec/README.md` — when a change deserves a written intent, and
   how to write one.

No MCP servers are configured, and none are needed: the work here is
files, a shell and a database. If an external tool or data source ever
becomes part of the loop, that is when MCP earns a place — not before.

## Project

VelaChess syncs your chess.com/Lichess games, derives your opening book
from your own play, detects where you leave your habitual lines, confirms
the cost with Stockfish, and turns harmful mistakes into FSRS-scheduled
drilling exercises.

## Map

The backend is Vertical Slice Architecture — Jimmy Bogard's, not a
reinterpretation. Read `docs/explanation/architecture.md` before moving
or creating backend code; `__tests__/architecture.test.ts` fails the build
when a boundary breaks. `.agents/skills/vertical-slice-architecture` is
the working procedure.

```
apps/server         HTTP composition root — the only place hono exists; thin routes invoke slices
apps/worker         queue composition root — thin consumers invoke slices
apps/web            TanStack Start SPA — behavior slices per area, no components/hooks/utils folders

libs/application    what the system does: one vertical slice per request/use case
                    accounts/{connect-account,sync-account}  games/{list-games,get-game? via db,judge-games}
                    analysis/{request-analysis,process-analysis,get-analysis,watch-analysis}
                    drills/{seed-exercises,get-drill-queue,get-next-drill,submit-answer}
                    repertoires/{extract-repertoire,list-repertoires,…}  insights/  overview/  deviations/  auth/
libs/infra          technical mechanisms, one package each
                    db (drizzle schema/migrations/shared queries/advisory lock), queue (pg-boss behind ports),
                    stockfish (@velachess/engine), observability (@velachess/logger),
                    providers (@velachess/platforms), auth (Better Auth config)
libs/chess          rules, PGN, FEN/EPD, SAN — shared by many slices and apps/web
libs/analysis       per-move classification (win%-based) — shared by process-analysis and apps/web
libs/repertoire     book building, judgment, adherence (pure)
libs/scheduler      FSRS wrapper (ts-fsrs)
libs/ui             design system: theme tokens, shadcn primitives, chess board
libs/fixtures       pure test data      libs/test-utils   shared test harness (test-only)

packages/           intentionally public packages only — empty until that is a product decision
```

## Vertical slice rules

- The unit is the request/use case, never the technical layer. New
  behavior = new slice directory under its area; the area is navigation,
  the slice is the architecture.
- A slice owns its validation, queries, errors, calculations and tests.
  A query used by one slice lives in the slice; multi-slice queries stay
  in `libs/infra/db` with the justification written down.
- No Controller→Service→Repository pipeline, no repository interface per
  entity, no service class per noun, no `commands/`/`queries/` buckets,
  no `core/`/`common/`/`shared/`/`utils/` dumping grounds. The
  architecture test rejects `services/`, `repositories/` etc. inside
  application by path.
- Slices do not import other slices. The documented exceptions live in
  the allowlist in `__tests__/architecture.test.ts`; extending it is an
  architecture decision recorded in `docs/explanation/architecture.md`.
- Do not extract shared code because two slices look similar — small
  duplication between slices is cheaper than coupling. Extract only for
  infra, a stable domain concept, or an intentional public package.
- Start every slice as the simplest thing (a transaction script over
  Drizzle is fine); richer patterns are earned by observed complexity.
- Different slices may use different internal patterns. Do not normalize
  them for visual consistency.

## Dependency direction

```
apps/server, apps/worker → libs/application → libs/infra + domain libs
```

Nothing under `libs/` may import from `apps/` — enforced. Application
never imports hono or pg-boss (ports only). Infra never imports
application. Worker consumers are thin delivery adapters over slices.
HTTP-shape zod stays in `apps/server` (transport translation; it is what
keeps the `hc<AppType>` client typed).

## Rules

- Explicit over clever. Optimize the number of concepts a reader holds at
  once, not function length.
- YAGNI. Functions over classes. No factory/strategy/registry patterns
  without proven need. Two implementations don't justify an abstraction.
- No magic strings — typed constants (e.g. `EXTRACTED_REPERTOIRE_NAME`).
- Frontend: `libs/ui` owns every design token; `apps/web` inherits the
  theme and never declares one. Third-party component code (shadcn, Trophy
  registry) is installed into `libs/ui` and re-exported from there.
  `apps/web/src` groups by vertical (what code does), never by technical
  type — no `components/`, `hooks/`, `utils/` folders.
- Two vocabularies, one boundary. Data keeps the domain's name (a
  `deviation` is a deviation, `engineCategory` stays `engineCategory`);
  screens, routes and folders are named after the user's job — `mistakes`,
  `drill`, `repertoire`. A module usually spans several endpoints, so it is
  named for the job, not the endpoint. The mapping lives in the vertical's
  `queries.ts` and its message constants, and nowhere else.
- A vertical is a domain, and everything of that domain lives inside it:
  importing and analysing are things you do _to games_, so they are
  `games/import/` and `games/analysis/`, not siblings of `games/`.
- No literal text in the frontend. Strings are Lingui messages declared
  with the `msg` macro, in the file that uses them, rendered through
  `i18n._(…)`. `aria-label`, `title` and `placeholder` count. Numbers and
  dates go through `Intl`. Run `pnpm --filter @velachess/web i18n:extract`
  after touching copy.
- No ternaries in JSX. Render with short-circuit `&&`, one condition per
  outcome, and make mutually exclusive cases say so
  (`{due > 0 && …}` / `{due === 0 && fresh > 0 && …}`) rather than
  chaining `? :`. Guard the `&&` with a real boolean — `x !== null`,
  `list.length > 0` — because `0` and `""` render as themselves. When the
  branches are whole trees, give them a component with early returns; a
  ternary in a prop or a plain expression is fine, a nested one never is.
  Extract a complex condition into a named variable that says what it
  means.
- Shape the response for the screen, not for the database. The API
  returns what a component renders — labels resolved, positions playable,
  order decided — and the client maps over it. Rebuilding a graph in
  React with nested loops, `while` walks or mutable traversal means the
  interpretation is in the wrong layer: move it to the domain library
  where it is pure and tested (`libs/repertoire/chapter-view.ts` is the
  worked example).
- State has four owners and they don't overlap: React Query for anything
  from the API, the URL for selection and filters, zustand for client-only
  preference that outlives a screen, `useState` for what dies with the
  component. Derive rather than store — no `useEffect` to keep two copies
  of the same fact in sync.
- Structure enters a layout component through a slot, content through
  children. A screen returns content and never positions itself.
- `libs/ui` knows nothing about chess: no domain word, no router
  import. `Card` is a widget container; records go in rows.
- Tailwind: token utilities only. No arbitrary values, no `dark:` in a
  screen (that means a token is missing), no class built by concatenation
  — Tailwind reads source as text, so `bg-move-${x}` does not exist.
- Domain decisions are pure functions; effects live in application/db.
- Preserve transactional invariants: judgment + analysis-enqueue commit
  together; analysis report + severity fill commit together.
- The engine has ONE trigger: opening a game. Importing (`GET /games`) and
  refreshing (`POST /accounts/:id/sync`) fetch, save and judge — judging
  is replay, never Stockfish. Never fan analysis out over an archive.
- pg-boss owns delivery, retry, backoff, concurrency, DLQ, heartbeat —
  never reimplement these in consumers (no polling loops, no deadlines).
- Analysis execution ownership is the session advisory lock in
  `libs/infra/db/advisory-lock.ts` — an application invariant (covers
  HTTP-vs-worker), not queue dedup. Don't remove either layer.
- Every new API route must be added to `apps/server/src/openapi.ts` — the
  anti-drift test in `apps/server/__tests__/openapi.test.ts` fails otherwise.
- A fixture is only evidence of what it contains. When a screen starts
  reading a field, check the fixture carries it — a unit test over
  hand-made rows passes happily while the pipeline delivers null.
- Two seams, two disciplines. The backend is tested through an HTTP
  request against the real process; the frontend is tested through an
  HTTP response, rendering the screen and asserting on what a person
  would read. A frontend test never asserts on the request it made, and
  never reaches for a test id — see `docs/how-to/write-a-test.md`.
- Error responses follow the `{ error }` contract (`apps/server/src/validation.ts`).
- Don't refactor code merely because it is long. A cohesive 50-line
  function beats five fragments.

## Code Review Rules

Flag these in review; they are the invariants this repository has already
broken once each.

### The engine has one trigger

- Analysis starts only when someone opens a game. Importing, refreshing
  and judging must not reach Stockfish, and nothing may fan analysis out
  over an archive.
  Safe path: enqueue from the interactive route only.

### Derived values are read one way

- A value computed from other columns (which side was "you", won/lost,
  time class) must be derived by the same expression everywhere. A filter
  reading a stored column while a list reads a derived one returns
  nothing and looks correct.

### A guard cannot reject

- Anything in a route's `beforeLoad` runs before a component exists, so a
  rejection there has no boundary below it and blanks the app. Reads in a
  guard must swallow failure and resolve to a defined state.

### A test must be able to fail

- A test fed hand-made rows proves nothing about data the pipeline
  delivers. When a change reads a new field, the fixture must carry it.
  Flag any new assertion whose only oracle was written after the
  implementation.

### Transactional pairs

- Judgment and its analysis-enqueue commit together; an analysis report
  and the severity it fills commit together. Splitting either is a bug
  even when tests pass.

## Commands

```
pnpm install       # also installs git hooks (lefthook, via `prepare`)
pnpm check         # typecheck + lint + knip
pnpm fmt:check     # formatting gate; pnpm fmt fixes the tree
pnpm test          # turbo-orchestrated: one vitest project per app/package, plus root and e2e
pnpm build         # turbo run build — apps/web plus the static apps/site export
docker compose -f docker/docker-compose.yml up --build   # postgres + migrate + api (:3000) + worker
```

Turbo (`turbo.json`) owns task orchestration and caching — `test`,
`typecheck`, `lint`, `build` all run through it. `docs/how-to/verify-a-change.md`
lists every project name.

Hooks come from `lefthook.yml`; if that file is absent the hooks do not
exist and nothing warns you. Pre-commit formats and lints staged files,
pre-push typechecks, commit-msg runs commitlint. Commits follow Conventional Commits
(`type(scope): subject`) with workspace names as scopes — see
`commitlint.config.mjs`. `LEFTHOOK=0 git commit` bypasses, deliberately.

Tests never skip: every suite runs against real migrations and, where the
engine is involved, real Stockfish at shallow depth.

Comments carry what the code cannot say — a decision and its alternative,
an outside constraint, a bug the shape prevents — and nothing else. The
test: delete it, and see whether anything was lost. Config files
(`.env.example`, compose, tooling) get one short line where a value is
non-obvious, never the reasoning; that lives in `docs/how-to/`, once.
`.agents/skills/write-comments` is the working rule.

Everything committed is written in English — comments, docstrings, test
names, commit messages, docs, and user-facing copy. Chess is an
international game and so is this repo's audience; a comment nobody can
read is a comment that will be deleted rather than trusted. Conversations
happen in whatever language suits the people in them, but nothing in that
language reaches a file.

## How-to (task-oriented, read before doing)

- Verifying anything: `docs/how-to/verify-a-change.md` — the four gates,
  the per-package vitest projects, and what "green" does not mean
- Writing a test: `docs/how-to/write-a-test.md` — the backend seam, the
  frontend seam, MSW, and the rules each of them earned the hard way
- Schema change: `docs/how-to/add-a-migration.md`
- New package: `docs/how-to/add-a-package.md`

## Before modifying complex areas, read

- Frontend conventions (slices, i18n, state, tests): `docs/explanation/apps/web.md`
- Design system (frame, tokens, icons, board): `docs/explanation/modules/ui.md`
- Analysis lifecycle / locks: `docs/explanation/modules/application.md`
- Queue semantics (stately dedup, warm-up, truth split): `docs/explanation/modules/queue.md`
- Schema and per-repertoire judgment semantics: `docs/explanation/modules/db.md`
- API surface and contracts: `docs/explanation/apps/api.md`
- Worker ownership model: `docs/explanation/apps/worker.md`

## Four layers, four questions

|                | Question                               | Where                            |
| -------------- | -------------------------------------- | -------------------------------- |
| **Spec**       | what are we building, and why          | `openspec/`                      |
| **Role**       | who owns this decision                 | `.agents/agents/`                |
| **Skill**      | how to perform a specialized operation | `.agents/skills/`                |
| **CI / tests** | did it actually work                   | `pnpm test`, `.github/workflows` |

They compose in that order and none of them replaces another. A spec with
no test is a wish; a test with no spec is a guess about intent.

## Specs

`openspec/` holds intent. A change that is worth writing down gets a
folder under `openspec/changes/<name>/` with a proposal (what & why), a
spec delta (what the system must do), a design (how), and tasks. Specs
graduate into `openspec/specs/` when the change is archived.

`openspec/config.yaml` carries the project context every artifact is
drafted against — the vocabulary, the invariants, and what "done" means
here. Keep it current: it is the one file that shapes every proposal.

A change also carries a **behavior/oracle matrix**: each criterion mapped
to the observable thing that decides it, and where that oracle's
authority comes from (`spec-derived`, `independent`, `external`,
`implementation-aware`, `diagnostic-probe`). Every row needs at least one
oracle that is not `implementation-aware` — a test written after seeing
the code agrees with it by construction. See
`openspec/changes/review-a-game/behavior-matrix.md`.

`pnpm spec validate --all` runs in CI, so a malformed change fails there
rather than mid-implementation.

Planning and implementing are separate turns. The propose workflow writes
artifacts and stops; applying is a new request.

Not everything needs a spec. A bug fix with an obvious cause and a
failing test is a commit, not a proposal. Reach for `openspec` when a
change spans packages, moves a boundary, or when the _shape_ of the
solution is still open.

## Skills

Reusable procedures — _how_ to do a thing. Shared: several roles use the
same skill, and a skill is never written just to give a role something to
own.

- `.agents/skills/openspec-*` — generated by `openspec init`, regenerated
  by `openspec update`. Don't hand-edit them; change `openspec/config.yaml`.
- `.agents/skills/chess-data` — games, PGN tags, platform sources and
  chess semantics without presuming. Use before reading a game field,
  adding a column to a game screen, writing a fixture, or touching
  ingestion.
- `.agents/skills/architecture-review` — reviewing/refactoring with this
  repo's criteria. Use before proposing structural changes.
- `.agents/skills/debug-pipeline` — root-cause investigation of the
  import → judge → analysis → triage → review pipeline. Use when data looks
  inconsistent (zero candidates, missing severity, stuck jobs).
- `.agents/skills/shadcn` — installed from `skills.sh`, not hand-written.
  The CLI, the registry, theming, MCP. Regenerate with
  `pnpm dlx skills add shadcn/ui`; don't hand-edit.
- `.agents/skills/write-comments` — what a comment has to earn, and why
  config files get one line instead of a paragraph.
- `.agents/skills/ui-before-you-build` — ours, and the one to read first
  when writing any UI: where components live in this workspace, what to
  search before hand-rolling one, and the rules the registry cannot
  enforce (aria-label is copy, tokens never hex, skeletons are for
  absence). `Item`, `Empty`, `Skeleton` and `Spinner` were each written by
  hand here before someone noticed the registry already had them.
- `.agents/skills/site-quality` — public-site SEO, accessibility,
  performance, Lighthouse thresholds and static-export constraints.

## Roles

Boundaries — _who_ owns a decision, and what they must not do. Plain
markdown, no vendor format, so any assistant can read them.

- `.agents/agents/architect.md` — where something belongs and what it
  costs. Stops at the decision.
- `.agents/agents/implementer.md` — the smallest defensible change, then
  verification. Never redesigns mid-task.
- `.agents/agents/reviewer.md` — read-only: correctness, regressions,
  architecture drift, test gaps. Reports, never fixes.

**Delegation is manual and optional.** There is no pipeline: the main
agent works normally and hands off only when a task clearly benefits —
typically a structural question (architect) or a change that crossed
layers and is about to merge (reviewer). Delegating costs tokens and a
round trip; a change that fits in one file rarely earns it.

## Glossary

One word, one meaning. Both of these were settled once and drifted anyway,
so `__tests__/architecture.test.ts` now fails when they do.

**analysis** — the engine's judgement of a game that was played. The whole
flow: the trigger, the worker's run, the watch stream, the report, the
screen. Spelled the American way (`analyze`, `analyzed`) because the
engine package, the database and npm already do; `analysis` and `analyses`
are the same word in both spellings and are not the issue. A split
spelling costs a search: `grep analyz` would find half the codebase.

**drill** — the thing you practise: a position, the right answer, and why
it is there. The module, the screen and the HTTP surface all say it:
`libs/application/drills`, `/drill`, `/drill/*`.

**review** — one showing of a drill, on schedule. Stability, due date,
lapse: the spaced-repetition machinery, and the term of art in that field
— `ts-fsrs` itself says `ReviewLog`. It lives in `libs/scheduler` and
the `cards` / drill response tables, and it does **not** reach the
HTTP surface. FSRS is how we schedule today; a drill scheduled some other
way tomorrow is still a drill, and an API named after this year's
algorithm would be a name outliving its meaning.

Drill is the flashcard; review is one showing of it. `review` is also not
a synonym for analysis — naming the analysis screen's parts `Review*` made
one word mean two products.

**ply** — a position _and_ the half-move played from it. `GradedPly` is
what the engine produces per ply: the FEN, the move, both evaluations and
the verdict. "Position" and "move" are each half true, which is why
neither is the name. Chess already had the word.

**judgment** — replay against the repertoire, no engine involved. What
`deviation` records.
