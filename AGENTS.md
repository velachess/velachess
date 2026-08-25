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

libs/application  vertical slices: one request/use case per directory
libs/infra        db, queue, engine, logger, platforms, and auth adapters
libs/chess        chess rules and notation
libs/analysis     per-ply engine classification
libs/repertoire   repertoire construction and judgment
libs/scheduler    FSRS wrapper
libs/ui           shared design system and chess presentation
libs/fixtures     pure test data
libs/test-utils   shared test harness
```

Backend dependency direction:

```text
apps/server, apps/worker -> libs/application -> libs/infra + domain libs
```

Nothing under `libs/` imports from `apps/`. Application imports ports, not
Hono or pg-boss. Infra does not import application. The enforced boundary and
documented exceptions live in `docs/explanation/architecture.md` and
`__tests__/architecture.test.ts`.

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
  cannot express. Use the `write-comments` skill for prose-heavy changes.

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
pnpm check       # typecheck + lint + knip
pnpm fmt:check   # formatting gate
pnpm test        # all Vitest projects through Turbo
pnpm build       # deployable apps
```

Read `docs/how-to/verify-a-change.md` before claiming a change is complete and
`docs/how-to/write-a-test.md` before adding tests. Turbo owns task
orchestration and caching; use the `turborepo` skill when changing that graph.

## Guidance routing

Always-relevant subtree rules belong in the nearest `AGENTS.md`:

- `apps/web/AGENTS.md` — frontend slices, state, i18n, routing, and rendering.
- `apps/site/AGENTS.md` — static public-site boundary.
- `apps/server/AGENTS.md` — HTTP, validation, auth middleware, and OpenAPI.
- `apps/worker/AGENTS.md` — delivery consumer ownership.
- `libs/application/AGENTS.md` — vertical-slice ownership.
- `libs/infra/AGENTS.md` — technical adapters and portability.
- `libs/ui/AGENTS.md` — design-system ownership.

Task-dependent procedures live under `.agents/skills/`:

- Architecture or placement: `architecture-review`, then
  `vertical-slice-architecture` when slice placement is involved.
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
- Vitest APIs, mocks, timers, projects, or test configuration: `vitest`.
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
